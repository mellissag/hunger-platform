"use client";

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useClientStatuses,
  useCreateClientStatus,
  useDeleteClientStatus,
  useReorderClientStatuses,
  useUpdateClientStatus,
  type ClientStatusRow,
} from "@/hooks/useLoyaltyAdmin";

function statusLabel(s: ClientStatusRow, locale: string): string {
  if (locale === "en") return s.name_en;
  if (locale === "uk") return s.name_uk;
  if (locale === "bg") return s.name_bg;
  return s.name_ru;
}

const emptyForm = {
  name_ru: "",
  name_en: "",
  name_uk: "",
  name_bg: "",
  background_color: "#C9A84C",
  text_color: "#FFFFFF",
  discount_percent: "",
  points_multiplier: "1",
  min_visits: "",
  min_spent: "",
};

function SortableRow({
  status,
  locale,
  onEdit,
  onDelete,
}: {
  status: ClientStatusRow;
  locale: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: status.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between gap-2 rounded-lg border p-3"
    >
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          className="cursor-grab touch-none text-muted-foreground"
          {...attributes}
          {...listeners}
          aria-label="drag"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <span
          className="rounded-full px-3 py-1 text-sm font-medium"
          style={{ background: status.background_color, color: status.text_color }}
        >
          {statusLabel(status, locale)}
        </span>
        <span className="text-sm text-muted-foreground">×{status.points_multiplier}</span>
      </div>
      <div className="flex shrink-0 gap-1">
        <Button type="button" variant="ghost" size="icon" onClick={onEdit}>
          <Pencil className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" onClick={onDelete}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
    </div>
  );
}

export function LoyaltyStatusTab() {
  const t = useTranslations("pages.discounts");
  const locale = useLocale();
  const { data: statuses = [] } = useClientStatuses();
  const createMut = useCreateClientStatus();
  const updateMut = useUpdateClientStatus();
  const deleteMut = useDeleteClientStatus();
  const reorderMut = useReorderClientStatuses();

  const [items, setItems] = useState<ClientStatusRow[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ClientStatusRow | null>(null);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    setItems([...statuses].sort((a, b) => a.sort_order - b.sort_order));
  }, [statuses]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEdit(s: ClientStatusRow) {
    setEditing(s);
    setForm({
      name_ru: s.name_ru,
      name_en: s.name_en,
      name_uk: s.name_uk,
      name_bg: s.name_bg,
      background_color: s.background_color,
      text_color: s.text_color,
      discount_percent: s.discount_percent != null ? String(s.discount_percent) : "",
      points_multiplier: String(s.points_multiplier),
      min_visits: s.min_visits != null ? String(s.min_visits) : "",
      min_spent: s.min_spent != null ? String(s.min_spent) : "",
    });
    setModalOpen(true);
  }

  async function handleSave() {
    const body = {
      name_ru: form.name_ru.trim(),
      name_en: form.name_en.trim(),
      name_uk: form.name_uk.trim(),
      name_bg: form.name_bg.trim(),
      background_color: form.background_color,
      text_color: form.text_color,
      discount_percent: form.discount_percent ? Number(form.discount_percent) : null,
      points_multiplier: String(Number(form.points_multiplier) || 1),
      min_visits: form.min_visits ? Number(form.min_visits) : null,
      min_spent: form.min_spent ? form.min_spent : null,
      sort_order: editing?.sort_order ?? items.length,
    };
    if (!body.name_ru || !body.name_en) {
      toast.error(t("statusNamesRequired"));
      return;
    }
    try {
      if (editing) {
        await updateMut.mutateAsync({ id: editing.id, ...body });
      } else {
        await createMut.mutateAsync(body);
      }
      toast.success(t("saved"));
      setModalOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    }
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    const next = arrayMove(items, oldIndex, newIndex);
    setItems(next);
    reorderMut.mutate(next.map((i) => i.id));
  }

  return (
    <>
      <Card>
        <CardContent className="space-y-3 pt-6">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">{t("dragHint")}</p>
            <Button type="button" size="sm" onClick={openCreate}>
              <Plus className="mr-1 h-4 w-4" />
              {t("addStatus")}
            </Button>
          </div>
          {!items.length ? (
            <p className="text-sm text-muted-foreground">{t("noStatuses")}</p>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {items.map((s) => (
                    <SortableRow
                      key={s.id}
                      status={s}
                      locale={locale}
                      onEdit={() => openEdit(s)}
                      onDelete={() => {
                        if (!window.confirm(t("confirmDeleteStatus"))) return;
                        deleteMut.mutate(s.id, {
                          onSuccess: () => toast.success(t("saved")),
                        });
                      }}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </CardContent>
      </Card>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? t("editStatus") : t("addStatus")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("statusNameRu")} value={form.name_ru} onChange={(v) => setForm((f) => ({ ...f, name_ru: v }))} />
            <Field label={t("statusNameEn")} value={form.name_en} onChange={(v) => setForm((f) => ({ ...f, name_en: v }))} />
            <Field label={t("statusNameUk")} value={form.name_uk} onChange={(v) => setForm((f) => ({ ...f, name_uk: v }))} />
            <Field label={t("statusNameBg")} value={form.name_bg} onChange={(v) => setForm((f) => ({ ...f, name_bg: v }))} />
            <Field label={t("statusBgColor")} value={form.background_color} onChange={(v) => setForm((f) => ({ ...f, background_color: v }))} />
            <Field label={t("statusTextColor")} value={form.text_color} onChange={(v) => setForm((f) => ({ ...f, text_color: v }))} />
            <Field label={t("statusDiscount")} value={form.discount_percent} onChange={(v) => setForm((f) => ({ ...f, discount_percent: v }))} type="number" />
            <Field label={t("statusMultiplier")} value={form.points_multiplier} onChange={(v) => setForm((f) => ({ ...f, points_multiplier: v }))} type="number" />
            <Field label={t("statusMinVisits")} value={form.min_visits} onChange={(v) => setForm((f) => ({ ...f, min_visits: v }))} type="number" />
            <Field label={t("statusMinSpent")} value={form.min_spent} onChange={(v) => setForm((f) => ({ ...f, min_spent: v }))} type="number" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
              {t("cancel")}
            </Button>
            <Button type="button" onClick={handleSave} disabled={createMut.isPending || updateMut.isPending}>
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
