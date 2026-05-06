"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Pencil, Loader2, X, Check } from "lucide-react";
import { toast } from "sonner";
import { apiJson } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const LANGS = ["ru", "en", "uk", "bg"] as const;
type Lang = (typeof LANGS)[number];

const API = "/mini-app/daily-pick/admin";

interface DailyPickFull {
  id: string;
  title_ru: string; title_en: string; title_uk: string; title_bg: string;
  tags_ru: string; tags_en: string; tags_uk: string; tags_bg: string;
  price: number | null;
  service_id: string | null;
  active: boolean;
  valid_from: string | null;
  valid_to: string | null;
}

const emptyForm = (): Omit<DailyPickFull, "id"> => ({
  title_ru: "", title_en: "", title_uk: "", title_bg: "",
  tags_ru: "", tags_en: "", tags_uk: "", tags_bg: "",
  price: null, service_id: null, active: true,
  valid_from: null, valid_to: null,
});

export default function DailyPickPage() {
  const qc = useQueryClient();
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<DailyPickFull, "id">>(emptyForm());
  const [activeLang, setActiveLang] = useState<Lang>("ru");
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data: picks = [], isLoading } = useQuery<DailyPickFull[]>({
    queryKey: ["daily-picks-admin"],
    queryFn: () => apiJson<DailyPickFull[]>(API),
  });

  const createMut = useMutation({
    mutationFn: (body: typeof form) => apiJson<DailyPickFull>(API, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["daily-picks-admin"] }); closeDrawer(); toast.success("Подборка создана"); },
    onError: () => toast.error("Ошибка сохранения"),
  });

  const updateMut = useMutation({
    mutationFn: (body: typeof form) => apiJson<DailyPickFull>(`${API}/${editId}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["daily-picks-admin"] }); closeDrawer(); toast.success("Подборка обновлена"); },
    onError: () => toast.error("Ошибка сохранения"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiJson<void>(`${API}/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["daily-picks-admin"] }); toast.success("Удалено"); },
    onError: () => toast.error("Ошибка удаления"),
  });

  function openCreate() {
    setEditId(null);
    setForm(emptyForm());
    setDrawerOpen(true);
  }

  function openEdit(p: DailyPickFull) {
    setEditId(p.id);
    setForm({
      title_ru: p.title_ru, title_en: p.title_en, title_uk: p.title_uk, title_bg: p.title_bg,
      tags_ru: p.tags_ru, tags_en: p.tags_en, tags_uk: p.tags_uk, tags_bg: p.tags_bg,
      price: p.price, service_id: p.service_id, active: p.active,
      valid_from: p.valid_from, valid_to: p.valid_to,
    });
    setDrawerOpen(true);
  }

  function closeDrawer() { setDrawerOpen(false); setEditId(null); }

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  const isPending = createMut.isPending || updateMut.isPending;

  return (
    <div className="space-y-6 p-6 max-w-3xl">
      <div className="flex items-end justify-between border-b border-border pb-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Mini App</p>
          <h1 className="font-playfair mt-1 text-2xl font-medium">Подборка дня</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Управляй блоком на главном экране Mini App
          </p>
        </div>
        <Button onClick={openCreate} size="sm" className="gap-1.5 text-[11px] uppercase tracking-wider">
          <Plus className="h-3.5 w-3.5" /> Создать
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Загрузка...
        </div>
      ) : picks.length === 0 ? (
        <div className="rounded border border-dashed border-border bg-muted/30 p-10 text-center">
          <p className="font-playfair text-lg text-foreground/50">Нет подборок</p>
          <p className="mt-1 text-xs text-muted-foreground">Создай первую — она появится на главной</p>
        </div>
      ) : (
        <div className="space-y-3">
          {picks.map(p => (
            <div key={p.id} className="flex items-center justify-between rounded border border-border bg-card px-4 py-3 shadow-sm">
              <div className="flex items-center gap-3">
                <span className={cn(
                  "inline-flex h-2 w-2 rounded-full shrink-0",
                  p.active ? "bg-emerald-500" : "bg-border",
                )} />
                <div>
                  <p className="font-medium text-sm">{p.title_ru || p.title_en || "—"}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {p.price != null ? `€${p.price}` : "без цены"}
                    {p.valid_from || p.valid_to ? ` · ${p.valid_from ?? "∞"} — ${p.valid_to ?? "∞"}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex gap-1.5">
                <button onClick={() => openEdit(p)} className="flex h-7 w-7 items-center justify-center rounded border border-border text-muted-foreground hover:text-foreground transition-colors">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => deleteMut.mutate(p.id)} className="flex h-7 w-7 items-center justify-center rounded border border-red-200 text-red-400 hover:bg-red-50 transition-colors">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Drawer */}
      {drawerOpen && <div className="fixed inset-0 z-40 bg-black/30" onClick={closeDrawer} />}
      <div className={cn(
        "fixed right-0 top-0 z-50 flex h-full w-full max-w-[480px] flex-col bg-card shadow-xl transition-transform duration-300",
        drawerOpen ? "translate-x-0" : "translate-x-full",
      )}>
        <div className="flex items-center justify-between border-b border-border px-6 py-5">
          <h2 className="font-playfair text-xl font-medium">
            {editId ? "Редактировать" : "Создать"} подборку
          </h2>
          <button onClick={closeDrawer} className="flex h-8 w-8 items-center justify-center rounded border border-border text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Language tabs */}
          <div>
            <div className="flex gap-1 mb-3">
              {LANGS.map(l => (
                <button key={l} type="button" onClick={() => setActiveLang(l)}
                  className={cn(
                    "rounded border px-3 py-1 text-[11px] font-medium uppercase tracking-wider transition-all",
                    activeLang === l ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/40",
                  )}>
                  {l.toUpperCase()}
                </button>
              ))}
            </div>

            {LANGS.map(l => (
              <div key={l} className={cn("space-y-3", activeLang !== l && "hidden")}>
                <div className="space-y-1.5">
                  <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    Заголовок ({l.toUpperCase()})
                  </Label>
                  <Input
                    value={String(form[`title_${l}` as keyof typeof form] ?? "")}
                    onChange={e => set(`title_${l}` as keyof typeof form, e.target.value as never)}
                    placeholder={`Заголовок на ${l.toUpperCase()}...`}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    Теги ({l.toUpperCase()}) — через запятую
                  </Label>
                  <Input
                    value={String(form[`tags_${l}` as keyof typeof form] ?? "")}
                    onChange={e => set(`tags_${l}` as keyof typeof form, e.target.value as never)}
                    placeholder="Маникюр, Уход за лицом, Массаж"
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Price */}
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Цена (€)</Label>
            <Input
              type="number"
              step="0.01"
              min={0}
              value={form.price ?? ""}
              onChange={e => set("price", e.target.value ? Number(e.target.value) : null)}
              placeholder="180"
            />
          </div>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Действует от</Label>
              <Input type="date" value={form.valid_from ?? ""} onChange={e => set("valid_from", e.target.value || null)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Действует до</Label>
              <Input type="date" value={form.valid_to ?? ""} onChange={e => set("valid_to", e.target.value || null)} />
            </div>
          </div>

          {/* Active toggle */}
          <div className="flex items-center justify-between rounded border border-border bg-muted/50 px-4 py-3">
            <span className="text-sm font-medium">Активно</span>
            <button
              type="button"
              role="switch"
              aria-checked={form.active}
              onClick={() => set("active", !form.active)}
              className={cn(
                "relative inline-flex h-[18px] w-8 shrink-0 cursor-pointer rounded-full border-none transition-colors",
                form.active ? "bg-emerald-600" : "bg-border",
              )}
            >
              <span className={cn(
                "pointer-events-none absolute top-[3px] h-3 w-3 rounded-full bg-white shadow-sm transition-all",
                form.active ? "right-[3px]" : "left-[3px]",
              )} />
            </button>
          </div>
        </div>

        <div className="flex gap-3 border-t border-border px-6 py-4">
          <Button type="button" variant="outline" onClick={closeDrawer} className="flex-1 text-[11px] uppercase tracking-wider">
            Отмена
          </Button>
          <Button
            type="button"
            disabled={isPending}
            onClick={() => editId ? updateMut.mutate(form) : createMut.mutate(form)}
            className="flex-1 text-[11px] uppercase tracking-wider"
          >
            {isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1.5 h-3.5 w-3.5" />}
            Сохранить
          </Button>
        </div>
      </div>
    </div>
  );
}
