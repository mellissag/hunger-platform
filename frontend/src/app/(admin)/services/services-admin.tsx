"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Download, Loader2, Pencil, Plus, Tag, Trash2, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { ServiceCard, ServiceCardSkeleton } from "@/components/services/ServiceCard";
import { ServiceDeleteModal } from "@/components/services/ServiceDeleteModal";
import { ServiceDrawer } from "@/components/services/ServiceDrawer";
import { ServiceFilterTabs } from "@/components/services/ServiceFilterTabs";
import { ServicesChart } from "@/components/services/ServicesChart";
import { ServicesKPI } from "@/components/services/ServicesKPI";
import {
  useServiceCategories,
  useServices,
  useCreateServiceCategory,
  useUpdateServiceCategory,
  useDeleteServiceCategory,
} from "@/hooks/useServices";
import { useHealth } from "@/hooks/useServiceStats";
import { useDebounce } from "@/hooks/useDebounce";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiJson, HttpError } from "@/lib/api";
import { aiTranslateReadyFromSalon } from "@/lib/aiTranslateReady";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { Paginated, ServiceCategoryOut, ServiceOut, SalonBundle } from "@/types/admin-api";

// ── Daily Pick types & helpers ───────────────────────────────────────────────

const PICK_LANGS = ["ru", "en", "uk", "bg"] as const;
type PickLang = (typeof PICK_LANGS)[number];
const PICK_API = "/mini-app/daily-pick/admin";

interface DailyPickFull {
  id: string;
  title_ru: string; title_en: string; title_uk: string; title_bg: string;
  tags_ru: string; tags_en: string; tags_uk: string; tags_bg: string;
  button_text_ru: string; button_text_en: string; button_text_uk: string; button_text_bg: string;
  button_url: string;
  button_type: "url" | "mini_app";
  price: number | null;
  service_id: string | null;
  active: boolean;
  valid_from: string | null;
  valid_to: string | null;
}

const emptyPickForm = (): Omit<DailyPickFull, "id"> => ({
  title_ru: "", title_en: "", title_uk: "", title_bg: "",
  tags_ru: "", tags_en: "", tags_uk: "", tags_bg: "",
  button_text_ru: "", button_text_en: "", button_text_uk: "", button_text_bg: "",
  button_url: "",
  button_type: "url",
  price: null, service_id: null, active: true,
  valid_from: null, valid_to: null,
});

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function splitPickDateTime(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  try {
    const normalized = iso.includes("T") ? iso : `${iso}T00:00:00`;
    const d = new Date(normalized);
    if (Number.isNaN(d.getTime())) return { date: iso.slice(0, 10), time: "" };
    return {
      date: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
      time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`,
    };
  } catch {
    return { date: iso.slice(0, 10), time: "" };
  }
}

function combinePickDateTime(
  date: string,
  time: string,
  defaultTime: string,
): string | null {
  const d = date.trim();
  if (!d) return null;
  const t = (time.trim() || defaultTime).slice(0, 5);
  return `${d}T${t}:00`;
}

/** Mirrors Mini App: active and not past ``valid_to``. */
function pickShowsInMiniApp(p: DailyPickFull): boolean {
  if (!p.active) return false;
  if (!p.valid_to) return true;
  const end = new Date(p.valid_to.includes("T") ? p.valid_to : `${p.valid_to}T23:59:59`);
  return !Number.isNaN(end.getTime()) && end.getTime() > Date.now();
}

function dailyPickMutationToastMessage(error: unknown, fallback: string): string {
  if (error instanceof HttpError && error.message.trim()) {
    return `${fallback}: ${error.message}`;
  }
  return fallback;
}

// ── DailyPickBlock ────────────────────────────────────────────────────────────

function DailyPickBlock() {
  const qc = useQueryClient();
  const t = useTranslations("pages.services");
  const tc = useTranslations("pages.services.collection");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<DailyPickFull, "id">>(emptyPickForm());
  const [activeLang, setActiveLang] = useState<PickLang>("ru");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pickTranslating, setPickTranslating] = useState(false);

  const { data: salonBundle } = useQuery({
    queryKey: ["salon"],
    queryFn: () => apiJson<SalonBundle>("/salon"),
    staleTime: 60_000,
  });
  const translateReady = useMemo(() => aiTranslateReadyFromSalon(salonBundle), [salonBundle]);

  const { data: picks = [], isLoading, isError, error: picksError, refetch: refetchPicks } = useQuery<
    DailyPickFull[]
  >({
    queryKey: ["daily-picks-admin"],
    queryFn: () => apiJson<DailyPickFull[]>(PICK_API),
  });

  const picksListErrorDetail =
    isError && picksError instanceof HttpError ? picksError.message.trim() : "";

  const createMut = useMutation({
    mutationFn: (body: Omit<DailyPickFull, "id">) =>
      apiJson<DailyPickFull>(PICK_API, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["daily-picks-admin"] });
      closeDrawer();
      toast.success(tc("pick_created"));
    },
    onError: (e) => toast.error(dailyPickMutationToastMessage(e, tc("pick_save_error"))),
  });

  const updateMut = useMutation({
    mutationFn: (body: Omit<DailyPickFull, "id">) =>
      apiJson<DailyPickFull>(`${PICK_API}/${editId}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["daily-picks-admin"] });
      closeDrawer();
      toast.success(tc("pick_updated"));
    },
    onError: (e) => toast.error(dailyPickMutationToastMessage(e, tc("pick_save_error"))),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) =>
      apiJson<void>(`${PICK_API}/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["daily-picks-admin"] });
      toast.success(tc("pick_deleted"));
    },
    onError: (e) => toast.error(dailyPickMutationToastMessage(e, tc("pick_delete_error"))),
  });

  function openCreate() {
    setEditId(null);
    setForm(emptyPickForm());
    setDrawerOpen(true);
  }

  function openEdit(p: DailyPickFull) {
    setEditId(p.id);
    setForm({
      title_ru: p.title_ru, title_en: p.title_en, title_uk: p.title_uk, title_bg: p.title_bg,
      tags_ru: p.tags_ru, tags_en: p.tags_en, tags_uk: p.tags_uk, tags_bg: p.tags_bg,
      button_text_ru: p.button_text_ru, button_text_en: p.button_text_en,
      button_text_uk: p.button_text_uk, button_text_bg: p.button_text_bg,
      button_url: p.button_url,
      button_type: p.button_type === "mini_app" ? "mini_app" : "url",
      price: p.price, service_id: p.service_id, active: p.active,
      valid_from: p.valid_from, valid_to: p.valid_to,
    });
    setDrawerOpen(true);
  }

  function closeDrawer() { setDrawerOpen(false); setEditId(null); }

  function setField<K extends keyof Omit<DailyPickFull, "id">>(k: K, v: Omit<DailyPickFull, "id">[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  async function handleDailyPickTranslate() {
    const title = String(form[`title_${activeLang}` as keyof typeof form] ?? "").trim();
    const tags = String(form[`tags_${activeLang}` as keyof typeof form] ?? "").trim();
    const buttonText = String(form[`button_text_${activeLang}` as keyof typeof form] ?? "").trim();
    if (!title && !tags && !buttonText) {
      toast.error(t("collection.auto_translate_empty"));
      return;
    }
    setPickTranslating(true);
    try {
      type Coll = { title: string; tags: string; button_text: string };
      type TranslatePickRes = {
        collection: Record<string, Coll> | null;
      };
      const res = await apiJson<TranslatePickRes>("/ai/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content_type: "collection",
          source_lang: activeLang,
          title,
          tags,
          button_text: buttonText,
        }),
      });
      if (!res.collection) {
        toast.error(t("drawerTranslateError"));
        return;
      }
      const patch: Partial<Omit<DailyPickFull, "id">> = {};
      for (const lang of PICK_LANGS) {
        if (lang === activeLang) continue;
        const c = res.collection[lang];
        if (!c) continue;
        (patch as Record<string, string>)[`title_${lang}`] = c.title ?? "";
        (patch as Record<string, string>)[`tags_${lang}`] = c.tags ?? "";
        (patch as Record<string, string>)[`button_text_${lang}`] = c.button_text ?? "";
      }
      setForm((f) => ({ ...f, ...patch }));
      toast.success(t("collection.auto_translate_success"));
    } catch (e) {
      toast.error(e instanceof HttpError ? e.message : t("drawerTranslateError"));
    } finally {
      setPickTranslating(false);
    }
  }

  const isPending = createMut.isPending || updateMut.isPending;

  return (
    <>
      <div className="rounded border border-border bg-card shadow-[0_1px_4px_rgba(28,20,9,.06)]">
        <div className="border-b border-border px-6 py-5 flex items-center justify-between">
          <div>
            <h2 className="font-playfair text-lg font-medium">Подборка дня</h2>
            <p className="mt-0.5 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
              Блок на главном экране Mini App
            </p>
            <p className="mt-2 max-w-xl text-xs text-muted-foreground leading-relaxed">
              В приложении показываются активные подборки до момента «Действует до»; после окончания
              срока блок скрывается, на карточке — таймер обратного отсчёта.
            </p>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded bg-primary px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus className="h-3.5 w-3.5" />
            Добавить подборку
          </button>
        </div>

        <div className="px-6 pb-6 pt-4">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" /> Загрузка...
            </div>
          ) : isError ? (
            <div className="rounded border border-destructive/25 bg-destructive/5 p-6 text-left">
              <p className="font-medium text-sm text-destructive">{tc("pick_list_error")}</p>
              {picksListErrorDetail ? (
                <p className="mt-2 text-xs text-muted-foreground font-mono break-all">{picksListErrorDetail}</p>
              ) : null}
              <p className="mt-3 text-xs text-muted-foreground leading-relaxed">{tc("pick_list_error_hint")}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => void refetchPicks()}
              >
                {tc("pick_retry")}
              </Button>
            </div>
          ) : picks.length === 0 ? (
            <div className="rounded border border-dashed border-border bg-muted/30 p-8 text-center">
              <p className="font-playfair text-base text-foreground/50">Нет подборок</p>
              <p className="mt-1 text-xs text-muted-foreground">Создай первую — она появится на главной Mini App</p>
            </div>
          ) : (
            <div className="space-y-3">
              {picks.map(p => (
                <div key={p.id} className="flex items-center justify-between rounded border border-border bg-background px-4 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={cn(
                      "inline-flex h-2 w-2 rounded-full shrink-0",
                      p.active ? "bg-emerald-500" : "bg-border",
                    )} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 gap-y-1">
                        <p className="font-medium text-sm truncate">{p.title_ru || p.title_en || "—"}</p>
                        <span
                          className={cn(
                            "inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                            pickShowsInMiniApp(p)
                              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                              : "border-border bg-muted/60 text-muted-foreground",
                          )}
                        >
                          {pickShowsInMiniApp(p) ? "В приложении" : "Не в приложении"}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        {p.price != null ? `€${p.price}` : "без цены"}
                        {p.valid_from || p.valid_to ? ` · период: ${p.valid_from ?? "∞"} — ${p.valid_to ?? "∞"}` : ""}
                        {p.button_url ? ` · ${p.button_url}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => openEdit(p)}
                      className="flex h-7 w-7 items-center justify-center rounded border border-border text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => deleteMut.mutate(p.id)}
                      className="flex h-7 w-7 items-center justify-center rounded border border-red-200 text-red-400 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Drawer backdrop */}
      {drawerOpen && <div className="fixed inset-0 z-40 bg-black/30" onClick={closeDrawer} />}

      {/* Drawer */}
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
              {PICK_LANGS.map(l => (
                <button key={l} type="button" onClick={() => setActiveLang(l)}
                  className={cn(
                    "rounded border px-3 py-1 text-[11px] font-medium uppercase tracking-wider transition-all",
                    activeLang === l
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:border-primary/40",
                  )}>
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="mb-3"
              disabled={!translateReady || pickTranslating}
              title={translateReady ? undefined : t("collection.auto_translate_no_key")}
              onClick={() => void handleDailyPickTranslate()}
            >
              {pickTranslating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {pickTranslating ? t("collection.auto_translate_loading") : t("collection.auto_translate_btn")}
            </Button>

            {PICK_LANGS.map(l => (
              <div key={l} className={cn("space-y-3", activeLang !== l && "hidden")}>
                <div className="space-y-1.5">
                  <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    Заголовок ({l.toUpperCase()})
                  </Label>
                  <Input
                    value={String(form[`title_${l}` as keyof typeof form] ?? "")}
                    onChange={e => setField(`title_${l}` as keyof Omit<DailyPickFull, "id">, e.target.value as never)}
                    placeholder={`Заголовок на ${l.toUpperCase()}...`}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    Теги ({l.toUpperCase()}) — через запятую
                  </Label>
                  <Input
                    value={String(form[`tags_${l}` as keyof typeof form] ?? "")}
                    onChange={e => setField(`tags_${l}` as keyof Omit<DailyPickFull, "id">, e.target.value as never)}
                    placeholder="Маникюр, Уход за лицом, Массаж"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    Текст кнопки ({l.toUpperCase()})
                  </Label>
                  <Input
                    value={String(form[`button_text_${l}` as keyof typeof form] ?? "")}
                    onChange={e => setField(`button_text_${l}` as keyof Omit<DailyPickFull, "id">, e.target.value as never)}
                    placeholder="Записаться"
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Button link type + URL */}
          <div className="space-y-2">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {tc("button_type_label")}
            </Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setField("button_type", "url")}
                className={cn(
                  "flex-1 rounded-lg border px-3 py-2 text-left text-xs transition-colors",
                  form.button_type === "url"
                    ? "border-primary bg-primary/10 text-primary font-medium"
                    : "border-border text-muted-foreground hover:border-primary/50",
                )}
              >
                <p className="font-medium">🔗 {tc("button_type_url")}</p>
                <p className="opacity-60">{tc("button_type_url_hint")}</p>
              </button>
              <button
                type="button"
                onClick={() => setField("button_type", "mini_app")}
                className={cn(
                  "flex-1 rounded-lg border px-3 py-2 text-left text-xs transition-colors",
                  form.button_type === "mini_app"
                    ? "border-primary bg-primary/10 text-primary font-medium"
                    : "border-border text-muted-foreground hover:border-primary/50",
                )}
              >
                <p className="font-medium">📱 {tc("button_type_mini_app")}</p>
                <p className="opacity-60">{tc("button_type_mini_app_hint")}</p>
              </button>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {tc("button_url_label")}
              </Label>
              <Input
                value={form.button_url}
                onChange={e => setField("button_url", e.target.value)}
                placeholder="https://... или /mini-app/book (если пусто — стандартное бронирование)"
              />
              <p className="text-[11px] text-muted-foreground leading-snug">
                {form.button_type === "mini_app"
                  ? tc("button_url_hint_mini_app")
                  : tc("button_url_hint_url")}
              </p>
            </div>
          </div>

          {/* Price */}
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Цена (€)</Label>
            <Input
              type="number"
              step="0.01"
              min={0}
              value={form.price ?? ""}
              onChange={e => setField("price", e.target.value ? Number(e.target.value) : null)}
              placeholder="180"
            />
          </div>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Действует от</Label>
              <div className="flex gap-2">
                {(() => {
                  const fromParts = splitPickDateTime(form.valid_from);
                  return (
                    <>
                      <Input
                        type="date"
                        className="min-w-0 flex-1"
                        value={fromParts.date}
                        onChange={e =>
                          setField(
                            "valid_from",
                            combinePickDateTime(e.target.value, fromParts.time, "00:00"),
                          )
                        }
                      />
                      <Input
                        type="time"
                        className="w-[7.25rem] shrink-0"
                        value={fromParts.time || (fromParts.date ? "00:00" : "")}
                        onChange={e =>
                          setField(
                            "valid_from",
                            combinePickDateTime(fromParts.date, e.target.value, "00:00"),
                          )
                        }
                        disabled={!fromParts.date}
                      />
                    </>
                  );
                })()}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Действует до</Label>
              <div className="flex gap-2">
                {(() => {
                  const toParts = splitPickDateTime(form.valid_to);
                  return (
                    <>
                      <Input
                        type="date"
                        className="min-w-0 flex-1"
                        value={toParts.date}
                        onChange={e =>
                          setField(
                            "valid_to",
                            combinePickDateTime(e.target.value, toParts.time, "23:59"),
                          )
                        }
                      />
                      <Input
                        type="time"
                        className="w-[7.25rem] shrink-0"
                        value={toParts.time || (toParts.date ? "23:59" : "")}
                        onChange={e =>
                          setField(
                            "valid_to",
                            combinePickDateTime(toParts.date, e.target.value, "23:59"),
                          )
                        }
                        disabled={!toParts.date}
                      />
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground leading-snug">
            Время по умолчанию: 00:00 для начала, 23:59 для окончания. После «Действует до» подборка
            исчезает в Mini App.
          </p>

          {/* Active toggle */}
          <div className="flex items-center justify-between rounded border border-border bg-muted/50 px-4 py-3">
            <span className="text-sm font-medium">Активно</span>
            <button
              type="button"
              role="switch"
              aria-checked={form.active}
              onClick={() => setField("active", !form.active)}
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
    </>
  );
}

function SyncBadge({ syncActive, syncInactive }: { syncActive: string; syncInactive: string }) {
  const { data: health } = useHealth();
  if (!health) return null;
  return health.redis ? (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/60 bg-emerald-50/80 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.1em] text-emerald-700">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
      {syncActive}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200/60 bg-red-50/80 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.1em] text-red-700">
      <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
      {syncInactive}
    </span>
  );
}

export function ServicesAdmin() {
  const locale = useLocale();
  const t = useTranslations("pages.services");

  const [activeCategoryId, setActiveCategoryId] = useState<string | undefined>(undefined);
  const [searchRaw, setSearchRaw] = useState("");
  const search = useDebounce(searchRaw, 300);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ServiceOut | null>(null);

  // ── Category dialog state ─────────────────────────────────────────────────
  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<ServiceCategoryOut | null>(null);
  const emptyCatForm = () => ({ name_i18n: { ru: '', en: '', uk: '', bg: '' }, icon: '', sort_order: 0 });
  const [catForm, setCatForm] = useState(emptyCatForm());
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);

  const createCategory = useCreateServiceCategory();
  const updateCategory = useUpdateServiceCategory();
  const deleteCategory = useDeleteServiceCategory();
  const isCatPending = createCategory.isPending || updateCategory.isPending || deleteCategory.isPending;

  const openCreateCat = () => {
    setEditingCat(null);
    setCatForm(emptyCatForm());
    setSelectedServiceIds([]);
    setCatDialogOpen(true);
  };
  const openEditCat = (cat: ServiceCategoryOut) => {
    setEditingCat(cat);
    setCatForm({
      name_i18n: { ru: '', en: '', uk: '', bg: '', ...cat.name_i18n },
      icon: cat.icon ?? '',
      sort_order: cat.sort_order,
    });
    setCatDialogOpen(true);
  };
  const closeCatDialog = () => { setCatDialogOpen(false); setEditingCat(null); };

  const saveCat = async () => {
    const payload = {
      name_i18n: catForm.name_i18n,
      icon: catForm.icon.trim() || undefined,
      sort_order: catForm.sort_order,
    };
    if (editingCat) {
      await updateCategory.mutateAsync({
        id: editingCat.id,
        ...payload,
        service_ids: selectedServiceIds,
      });
    } else {
      await createCategory.mutateAsync(payload);
    }
    closeCatDialog();
  };
  const deleteCat = async () => {
    if (!editingCat) return;
    if (!confirm(`Удалить категорию "${editingCat.name_i18n[locale] ?? editingCat.name_i18n.ru}"?`)) return;
    await deleteCategory.mutateAsync(editingCat.id);
    closeCatDialog();
  };

  function toggleServiceInCategory(svcId: string) {
    setSelectedServiceIds((prev) =>
      prev.includes(svcId) ? prev.filter((id) => id !== svcId) : [...prev, svcId],
    );
  }

  const { data: catData } = useServiceCategories();
  const { data: svcData, isLoading } = useServices(activeCategoryId, search);

  const { data: catDetail } = useQuery({
    queryKey: ["service-categories", "detail", editingCat?.id],
    queryFn: () => apiJson<ServiceCategoryOut>(`/service-categories/${editingCat!.id}`),
    enabled: Boolean(catDialogOpen && editingCat?.id),
  });

  const { data: pickerSvc } = useQuery({
    queryKey: ["services", "picker-all"],
    queryFn: () => apiJson<Paginated<ServiceOut>>(`/services?page=1&page_size=500`),
    enabled: catDialogOpen,
  });
  const pickerServices = pickerSvc?.items ?? [];

  useEffect(() => {
    if (!catDialogOpen) {
      setSelectedServiceIds([]);
      return;
    }
    if (!editingCat) return;
    if (catDetail && Array.isArray(catDetail.service_ids)) {
      setSelectedServiceIds(catDetail.service_ids.map(String));
    }
  }, [catDialogOpen, editingCat?.id, catDetail]);

  const categories = useMemo(() => catData?.items ?? [], [catData?.items]);
  const services = useMemo(() => svcData?.items ?? [], [svcData?.items]);
  const catalogTotal = svcData?.total ?? 0;
  const hasListFilters = Boolean(activeCategoryId || search.trim());
  const isGlobalCatalogEmpty = !isLoading && catalogTotal === 0 && !hasListFilters;

  const openCreate = useCallback(() => {
    setDrawerOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
  }, []);

  const now = new Date();
  const dayLabel = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(now);
  const cityLabel = "Sofia";

  return (
    <div className="space-y-8">
      {/* ── Page Header ── */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            {t("pageSubtitle")}
          </p>
          <h1 className="font-playfair mt-1 text-3xl font-medium leading-tight tracking-tight">
            {t("pageTitle")}
          </h1>
          <p className="mt-1 text-[10px] uppercase tracking-[0.25em] text-muted-foreground/60">
            {t("ornament")}
          </p>
          <p className="text-xs text-muted-foreground">
            {dayLabel} · {cityLabel}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <SyncBadge syncActive={t("syncActive")} syncInactive={t("syncInactive")} />
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded border border-border px-4 py-2 text-[11px] font-medium uppercase tracking-wider transition-colors hover:border-primary hover:text-primary"
          >
            <Download className="h-3.5 w-3.5" />
            {t("exportBtn")}
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded bg-primary px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus className="h-3.5 w-3.5" />
            {t("addBtn")}
          </button>
        </div>
      </div>

      {/* ── KPI Grid ── */}
      <ServicesKPI />

      {/* ── Analytics Row ── */}
      <ServicesChart />

      {/* ── Categories section ── */}
      <div className="rounded border border-border bg-card shadow-[0_1px_4px_rgba(28,20,9,.06)] px-6 py-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-playfair text-lg font-medium">Категории</h2>
            <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground mt-0.5">
              Группы услуг
            </p>
          </div>
          <button
            type="button"
            onClick={openCreateCat}
            className="inline-flex items-center gap-2 rounded border border-border px-4 py-2
                       text-[11px] font-medium uppercase tracking-wider transition-colors
                       hover:border-primary hover:text-primary"
          >
            <Plus className="h-3.5 w-3.5" />
            Добавить
          </button>
        </div>
        {categories.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">Нет категорий. Создайте первую.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => openEditCat(cat)}
                className="group flex items-center gap-1.5 px-3 py-1.5 border border-border
                           rounded-sm bg-background hover:border-primary/40 transition-colors"
              >
                {cat.icon && <span className="text-sm">{cat.icon}</span>}
                <span className="text-sm font-medium">
                  {cat.name_i18n[locale] ?? cat.name_i18n.ru ?? cat.name_i18n.en ?? 'Без названия'}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Services CRUD ── */}
      <div className="rounded border border-border bg-card shadow-[0_1px_4px_rgba(28,20,9,.06)]">
        {/* Card header */}
        <div className="border-b border-border px-6 py-5">
          <h2 className="font-playfair text-lg font-medium">{t("allServices")}</h2>
          <p className="mt-0.5 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            {t("allServicesSubtitle")}
          </p>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
          <ServiceFilterTabs
            categories={categories}
            activeId={activeCategoryId}
            onChange={setActiveCategoryId}
            locale={locale}
          />
          <div className="relative">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 stroke-muted-foreground"
              strokeWidth={2}
            >
              <circle cx="11" cy="11" r="8" />
              <path strokeLinecap="round" d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              value={searchRaw}
              onChange={(e) => setSearchRaw(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="w-60 rounded border border-border bg-muted py-2 pl-8 pr-3 text-[12px] text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
          </div>
        </div>

        {/* Services Grid */}
        <div className="px-6 pb-6">
          {isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <ServiceCardSkeleton key={i} />
              ))}
            </div>
          ) : isGlobalCatalogEmpty ? (
            <GlobalServicesEmpty onAdd={openCreate} addLabel={t("addBtn")} />
          ) : services.length === 0 ? (
            <EmptyState onAdd={openCreate} emptyTitle={t("emptyTitle")} emptyBtn={t("emptyBtn")} />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {services.map((svc) => (
                <ServiceCard
                  key={svc.id}
                  service={svc}
                  locale={locale}
                  onDelete={setDeleteTarget}
                />
              ))}
              <AddServiceCard onClick={openCreate} label={t("addCard")} />
            </div>
          )}
        </div>

        {/* Info footer */}
        <div className="flex items-center gap-2 border-t border-border px-6 py-4">
          <svg
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            className="h-3.5 w-3.5 shrink-0 stroke-primary"
          >
            <path
              strokeLinecap="round"
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="text-[12px] text-muted-foreground">
            {t("infoText")}
          </p>
        </div>
      </div>

      {/* ── Daily Pick block ── */}
      <DailyPickBlock />

      {/* ── ServiceDrawer ── */}
      <ServiceDrawer open={drawerOpen} serviceId={null} service={null} onClose={closeDrawer} />

      {/* ── Delete Modal ── */}
      <ServiceDeleteModal service={deleteTarget} onClose={() => setDeleteTarget(null)} />

      {/* ── Category Dialog ── */}
      <Dialog open={catDialogOpen} onOpenChange={(o) => { if (!o) closeCatDialog(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingCat ? 'Редактировать категорию' : 'Новая категория'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {(['ru', 'en', 'uk', 'bg'] as const).map((lang) => (
              <div key={lang} className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {lang.toUpperCase()}
                </label>
                <Input
                  value={catForm.name_i18n[lang] ?? ''}
                  onChange={(e) =>
                    setCatForm((f) => ({
                      ...f,
                      name_i18n: { ...f.name_i18n, [lang]: e.target.value },
                    }))
                  }
                  placeholder={
                    lang === 'ru' ? 'Волосы' :
                    lang === 'en' ? 'Hair' :
                    lang === 'uk' ? 'Волосся' : 'Коса'
                  }
                />
              </div>
            ))}

            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Иконка
              </label>
              <Input
                value={catForm.icon}
                onChange={(e) => setCatForm((f) => ({ ...f, icon: e.target.value }))}
                placeholder="✂️ или оставь пустым"
                maxLength={4}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Порядок сортировки
              </label>
              <Input
                type="number"
                value={catForm.sort_order}
                onChange={(e) =>
                  setCatForm((f) => ({ ...f, sort_order: Number(e.target.value) }))
                }
              />
            </div>

            {editingCat && (
              <div className="mt-4 space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("categoryDialogServices")}
                </label>
                <div className="max-h-48 space-y-2 overflow-y-auto rounded-xl border border-border p-3">
                  {pickerServices.map((svc) => {
                    const checked = selectedServiceIds.includes(svc.id);
                    const svcName =
                      svc.name_i18n[locale] ?? svc.name_i18n.ru ?? svc.name_i18n.en ?? svc.id;
                    const priceNum = Number.parseFloat(svc.price);
                    const priceLabel = Number.isNaN(priceNum)
                      ? ""
                      : `€${priceNum.toLocaleString(locale, { maximumFractionDigits: 2 })}`;
                    return (
                      <label
                        key={svc.id}
                        className={cn(
                          "flex cursor-pointer items-center gap-3 rounded-lg p-2 transition-colors",
                          checked ? "bg-primary/5" : "hover:bg-muted/60",
                        )}
                      >
                        <div
                          className={cn(
                            "flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 transition-colors",
                            checked ? "border-primary bg-primary" : "border-border bg-card",
                          )}
                        >
                          {checked && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden>
                              <polyline points="20 6 9 17 4 12" stroke="white" strokeWidth="3.5" />
                            </svg>
                          )}
                        </div>
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={checked}
                          onChange={() => toggleServiceInCategory(svc.id)}
                        />
                        <span className="flex-1 text-sm text-foreground">{svcName}</span>
                        {priceLabel ? (
                          <span className="text-xs text-muted-foreground">{priceLabel}</span>
                        ) : null}
                      </label>
                    );
                  })}
                  {pickerServices.length === 0 && (
                    <p className="py-2 text-xs text-muted-foreground">{t("categoryDialogServicesEmpty")}</p>
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            {editingCat && (
              <button
                type="button"
                onClick={deleteCat}
                disabled={isCatPending}
                className="inline-flex items-center gap-1 rounded border border-destructive
                           px-3 py-2 text-[11px] font-medium text-destructive
                           hover:bg-destructive/10 transition-colors"
              >
                Удалить
              </button>
            )}
            <button
              type="button"
              onClick={saveCat}
              disabled={isCatPending}
              className="inline-flex items-center rounded bg-primary px-4 py-2 text-[11px]
                         font-medium uppercase tracking-wider text-primary-foreground
                         hover:bg-primary/90 transition-colors disabled:opacity-60"
            >
              {isCatPending ? 'Сохраняем...' : 'Сохранить'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GlobalServicesEmpty({ onAdd, addLabel }: { onAdd: () => void; addLabel: string }) {
  const t = useTranslations("pages.services");
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-20 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="1.5" aria-hidden>
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <path d="M8 21h8M12 17v4" />
        </svg>
      </div>
      <p className="font-medium text-gray-900">{t("emptyGlobalTitle")}</p>
      <p className="mt-1 text-sm text-gray-400">{t("emptyGlobalHint")}</p>
      <button
        type="button"
        onClick={onAdd}
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-medium uppercase tracking-wider text-primary-foreground transition-colors hover:bg-primary/90"
      >
        <Plus className="h-3.5 w-3.5" />
        {addLabel}
      </button>
    </div>
  );
}

function EmptyState({
  onAdd,
  emptyTitle,
  emptyBtn,
}: {
  onAdd: () => void;
  emptyTitle: string;
  emptyBtn: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full border border-border bg-muted">
        <Tag className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="font-medium text-foreground">{emptyTitle}</p>
      <button
        type="button"
        onClick={onAdd}
        className="mt-1 inline-flex items-center gap-2 rounded bg-primary px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-primary-foreground transition-colors hover:bg-primary/90"
      >
        <Plus className="h-3.5 w-3.5" />
        {emptyBtn}
      </button>
    </div>
  );
}

function AddServiceCard({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[190px] flex-col items-center justify-center gap-2.5 rounded border-2 border-dashed border-border bg-muted transition-colors hover:border-primary/40"
    >
      <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.5} className="h-7 w-7 stroke-muted-foreground">
        <path strokeLinecap="round" d="M12 4v16m8-8H4" />
      </svg>
      <span className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">{label}</span>
    </button>
  );
}
