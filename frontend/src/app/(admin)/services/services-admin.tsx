"use client";

import { useCallback, useMemo, useState } from "react";
import { Download, Plus, Tag } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { ServiceCategoryOut, ServiceOut } from "@/types/admin-api";

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

  const createCategory = useCreateServiceCategory();
  const updateCategory = useUpdateServiceCategory();
  const deleteCategory = useDeleteServiceCategory();
  const isCatPending = createCategory.isPending || updateCategory.isPending || deleteCategory.isPending;

  const openCreateCat = () => {
    setEditingCat(null);
    setCatForm(emptyCatForm());
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
      await updateCategory.mutateAsync({ id: editingCat.id, ...payload });
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

  const { data: catData } = useServiceCategories();
  const { data: svcData, isLoading } = useServices(activeCategoryId, search);

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
                  categories={categories}
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
