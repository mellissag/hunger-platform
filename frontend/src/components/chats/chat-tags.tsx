"use client";

import { Lock, Plus, Settings2, Tag as TagIcon, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  ChatTag,
  ChatTagSummary,
  useAssignChatTag,
  useChatTags,
  useCreateChatTag,
  useDeleteChatTag,
  useUnassignChatTag,
} from "@/hooks/useChatData";

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;
const COLOR_PRESETS = [
  "#F59E0B", // amber
  "#10B981", // emerald
  "#EF4444", // red
  "#C9A84C", // gold
  "#6B7280", // gray
  "#3B82F6", // blue
  "#8B5CF6", // violet
  "#EC4899", // pink
  "#14B8A6", // teal
  "#F97316", // orange
] as const;

// ── Tag badge ─────────────────────────────────────────────────────────────────

export interface TagBadgeProps {
  tag: ChatTagSummary;
  size?: "sm" | "md";
  onRemove?: () => void;
  className?: string;
}

/** Small pill with a colored dot and tag name. */
export function TagBadge({ tag, size = "sm", onRemove, className }: TagBadgeProps) {
  const padding = size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-xs";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-medium",
        padding,
        className,
      )}
      style={{
        backgroundColor: hexToRgba(tag.color, 0.12),
        color: tag.color,
      }}
    >
      <span
        className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: tag.color }}
        aria-hidden
      />
      <span className="max-w-[120px] truncate">{tag.name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-0.5 inline-flex h-3 w-3 items-center justify-center rounded-full hover:bg-black/10"
          aria-label="Remove tag"
        >
          <X className="h-2.5 w-2.5" />
        </button>
      )}
    </span>
  );
}

/** Light-weight conversion `#RRGGBB` → `rgba(r,g,b,a)`. */
export function hexToRgba(hex: string, alpha: number): string {
  if (!HEX_RE.test(hex)) return `rgba(0,0,0,${alpha})`;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ── Inline "create new tag" form ──────────────────────────────────────────────

function CreateTagForm({
  onCreated,
  onCancel,
}: {
  onCreated: (tag: ChatTag) => void;
  onCancel?: () => void;
}) {
  const t = useTranslations("pages.chats.tags");
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(COLOR_PRESETS[0]!);
  const create = useCreateChatTag();

  const valid = name.trim().length > 0 && HEX_RE.test(color);

  const submit = async () => {
    if (!valid || create.isPending) return;
    try {
      const tag = await create.mutateAsync({ name: name.trim(), color });
      onCreated(tag);
      setName("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("createError"));
    }
  };

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-3">
      <Input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t("namePlaceholder")}
        maxLength={64}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void submit();
          }
          if (e.key === "Escape" && onCancel) onCancel();
        }}
        className="h-8 text-sm"
      />
      <div className="flex flex-wrap items-center gap-1.5">
        {COLOR_PRESETS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            className={cn(
              "h-5 w-5 rounded-full ring-offset-1 transition-transform",
              color === c ? "scale-110 ring-2 ring-foreground/60" : "hover:scale-105",
            )}
            style={{ backgroundColor: c }}
            aria-label={c}
          />
        ))}
        <Input
          value={color}
          onChange={(e) => setColor(e.target.value)}
          placeholder="#C9A84C"
          maxLength={7}
          className="h-6 w-20 text-[11px]"
        />
      </div>
      <div className="flex items-center justify-end gap-2 pt-1">
        {onCancel && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            className="h-7 text-xs"
          >
            {t("cancel")}
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          onClick={submit}
          disabled={!valid || create.isPending}
          className="h-7 text-xs"
        >
          {create.isPending ? t("creating") : t("create")}
        </Button>
      </div>
    </div>
  );
}

// ── Tag picker popover (assign / unassign to a specific chat) ────────────────

export function ChatTagPicker({
  clientId,
  currentTags,
  trigger,
  align = "start",
}: {
  clientId: string;
  currentTags: ChatTagSummary[];
  trigger: React.ReactNode;
  align?: "start" | "center" | "end";
}) {
  const t = useTranslations("pages.chats.tags");
  const { data: allTags = [] } = useChatTags();
  const assign = useAssignChatTag();
  const unassign = useUnassignChatTag();
  const [creating, setCreating] = useState(false);

  const currentIds = useMemo(
    () => new Set(currentTags.map((t) => t.id)),
    [currentTags],
  );

  const toggle = async (tag: ChatTag) => {
    try {
      if (currentIds.has(tag.id)) {
        await unassign.mutateAsync({ clientId, tagId: tag.id });
      } else {
        await assign.mutateAsync({ clientId, tagId: tag.id });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("toggleError"));
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align={align} className="w-64 p-2" sideOffset={4}>
        <div className="mb-1 px-2 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t("pickerTitle")}
        </div>
        <ul className="max-h-56 overflow-y-auto">
          {allTags.length === 0 ? (
            <li className="px-2 py-2 text-xs text-muted-foreground">
              {t("emptyTags")}
            </li>
          ) : (
            allTags.map((tag) => {
              const assigned = currentIds.has(tag.id);
              return (
                <li key={tag.id}>
                  <button
                    type="button"
                    onClick={() => void toggle(tag)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted",
                      assigned && "bg-muted/60",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: tag.color }}
                      />
                      <span className="truncate">{tag.name}</span>
                    </span>
                    {assigned && (
                      <span className="text-[10px] font-medium text-primary">✓</span>
                    )}
                  </button>
                </li>
              );
            })
          )}
        </ul>
        <div className="mt-2 border-t border-border pt-2">
          {creating ? (
            <CreateTagForm
              onCreated={async (tag) => {
                setCreating(false);
                try {
                  await assign.mutateAsync({ clientId, tagId: tag.id });
                } catch {
                  /* silent — list will re-fetch */
                }
              }}
              onCancel={() => setCreating(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-primary transition-colors hover:bg-primary/10"
            >
              <Plus className="h-3.5 w-3.5" />
              {t("createTag")}
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── Settings dialog: manage system + custom tags ──────────────────────────────

export function ChatTagsSettingsDialog({ trigger }: { trigger?: React.ReactNode }) {
  const t = useTranslations("pages.chats.tags");
  const { data: tags = [] } = useChatTags();
  const deleteTag = useDeleteChatTag();
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState(false);

  const systemTags = tags.filter((t) => t.is_default);
  const customTags = tags.filter((t) => !t.is_default);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="ghost" size="icon" aria-label={t("settingsTitle")}>
            <Settings2 className="h-4 w-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("settingsTitle")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <section className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Lock className="h-3 w-3" />
              {t("systemTagsLabel")}
            </div>
            <ul className="space-y-1">
              {systemTags.map((tag) => (
                <li
                  key={tag.id}
                  className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-2 py-1.5"
                >
                  <TagBadge tag={tag} size="md" />
                  <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-label="locked" />
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <TagIcon className="h-3 w-3" />
              {t("customTagsLabel")}
            </div>
            <ul className="space-y-1">
              {customTags.length === 0 ? (
                <li className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                  {t("noCustomTags")}
                </li>
              ) : (
                customTags.map((tag) => (
                  <li
                    key={tag.id}
                    className="flex items-center justify-between rounded-md border border-border bg-card px-2 py-1.5"
                  >
                    <TagBadge tag={tag} size="md" />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={async () => {
                        if (!window.confirm(t("confirmDelete", { name: tag.name })))
                          return;
                        try {
                          await deleteTag.mutateAsync(tag.id);
                          toast.success(t("deletedToast"));
                        } catch (err) {
                          toast.error(
                            err instanceof Error ? err.message : t("deleteError"),
                          );
                        }
                      }}
                      className="h-7 w-7"
                      aria-label={t("deleteTag")}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </li>
                ))
              )}
            </ul>
          </section>

          {creating ? (
            <CreateTagForm
              onCreated={() => setCreating(false)}
              onCancel={() => setCreating(false)}
            />
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCreating(true)}
              className="w-full"
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              {t("createTag")}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Inline chat note editor with debounced autosave ──────────────────────────

export function ChatNoteEditor({
  clientId,
  initialNote,
  onSave,
}: {
  clientId: string;
  initialNote: string | null;
  onSave: (note: string | null) => Promise<unknown> | void;
}) {
  const t = useTranslations("pages.chats.note");
  const [value, setValue] = useState(initialNote ?? "");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Reset when switching to a different chat.
  useEffect(() => {
    setValue(initialNote ?? "");
    setSavedAt(null);
  }, [clientId, initialNote]);

  // Debounce — autosave 1s after typing stops.
  useEffect(() => {
    const normalized = value.trim() || null;
    if (normalized === (initialNote ?? null)) return;
    const timer = window.setTimeout(async () => {
      setSaving(true);
      try {
        await onSave(normalized);
        setSavedAt(Date.now());
      } finally {
        setSaving(false);
      }
    }, 1000);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally only on value/clientId
  }, [value, clientId]);

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {t("label")}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t("placeholder")}
        maxLength={2000}
        className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
      />
      <span className="text-[10px] text-muted-foreground">
        {saving ? t("saving") : savedAt ? t("saved") : ""}
      </span>
    </div>
  );
}
