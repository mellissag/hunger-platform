"use client";

import { useCallback, useMemo, useState } from "react";
import { Download, Plus, Tag } from "lucide-react";
import { useLocale } from "next-intl";

import { ServiceCard, ServiceCardSkeleton } from "@/components/services/ServiceCard";
import { ServiceDeleteModal } from "@/components/services/ServiceDeleteModal";
import { ServiceDrawer } from "@/components/services/ServiceDrawer";
import { ServiceFilterTabs } from "@/components/services/ServiceFilterTabs";
import { ServicesChart } from "@/components/services/ServicesChart";
import { ServicesKPI } from "@/components/services/ServicesKPI";
import { useServiceCategories, useServices } from "@/hooks/useServices";
import { useHealth } from "@/hooks/useServiceStats";
import { useDebounce } from "@/hooks/useDebounce";
import type { ServiceOut } from "@/types/admin-api";

function SyncBadge() {
  const { data: health } = useHealth();

  if (!health) return null;

  return health.redis ? (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/60 bg-emerald-50/80 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.1em] text-emerald-700">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
      Бот синхронизирован
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200/60 bg-red-50/80 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.1em] text-red-700">
      <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
      Бот отключён
    </span>
  );
}

export function ServicesAdmin() {
  const locale = useLocale();

  const [activeCategoryId, setActiveCategoryId] = useState<string | undefined>(undefined);
  const [searchRaw, setSearchRaw] = useState("");
  const search = useDebounce(searchRaw, 300);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editServiceId, setEditServiceId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ServiceOut | null>(null);

  const { data: catData } = useServiceCategories();
  const { data: svcData, isLoading } = useServices(activeCategoryId, search);

  const categories = catData?.items ?? [];
  const services = svcData?.items ?? [];

  const editService = useMemo(
    () => services.find((s) => s.id === editServiceId) ?? null,
    [services, editServiceId],
  );

  const openCreate = useCallback(() => {
    setEditServiceId(null);
    setDrawerOpen(true);
  }, []);

  const openEdit = useCallback((id: string) => {
    setEditServiceId(id);
    setDrawerOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    setEditServiceId(null);
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
            · Управление услугами ·
          </p>
          <h1 className="font-playfair mt-1 text-3xl font-medium tracking-tight leading-tight">
            Коллекция{" "}
            <span className="italic text-primary">услуг</span>
          </h1>
          <p className="mt-1 text-[10px] uppercase tracking-[0.25em] text-muted-foreground/60">
            ⸻ ✦ ⸻
          </p>
          <p className="text-xs text-muted-foreground">
            {dayLabel} · {cityLabel}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <SyncBadge />
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded border border-border px-4 py-2 text-[11px] font-medium uppercase tracking-wider transition-colors hover:border-primary hover:text-primary"
          >
            <Download className="h-3.5 w-3.5" />
            Экспорт
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded bg-primary px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus className="h-3.5 w-3.5" />
            Добавить услугу
          </button>
        </div>
      </div>

      {/* ── KPI Grid ── */}
      <ServicesKPI />

      {/* ── Analytics Row ── */}
      <ServicesChart />

      {/* ── Services CRUD ── */}
      <div className="rounded border border-border bg-card shadow-[0_1px_4px_rgba(28,20,9,.06)]">
        {/* Card header */}
        <div className="border-b border-border px-6 py-5">
          <h2 className="font-playfair text-lg font-medium">Все услуги</h2>
          <p className="mt-0.5 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            Изменения мгновенно применяются в боте
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
              placeholder="Поиск…"
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
          ) : services.length === 0 ? (
            <EmptyState onAdd={openCreate} />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {services.map((svc) => (
                <ServiceCard
                  key={svc.id}
                  service={svc}
                  categories={categories}
                  locale={locale}
                  onEdit={openEdit}
                  onDelete={setDeleteTarget}
                />
              ))}
              {/* Add card */}
              <AddServiceCard onClick={openCreate} />
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
            Изменения синхронизируются с Telegram-ботом мгновенно через Redis
            Pub/Sub. Переключатель «Скрыта в боте» убирает услугу из меню
            записи — история записей сохраняется.
          </p>
        </div>
      </div>

      {/* ── ServiceDrawer ── */}
      <ServiceDrawer
        open={drawerOpen}
        serviceId={editServiceId}
        service={editService}
        onClose={closeDrawer}
      />

      {/* ── Delete Modal ── */}
      <ServiceDeleteModal
        service={deleteTarget}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full border border-border bg-muted">
        <Tag className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="font-medium text-foreground">
        Услуг в этой категории пока нет
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="mt-1 inline-flex items-center gap-2 rounded bg-primary px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-primary-foreground transition-colors hover:bg-primary/90"
      >
        <Plus className="h-3.5 w-3.5" />
        Добавить первую услугу
      </button>
    </div>
  );
}

function AddServiceCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[190px] flex-col items-center justify-center gap-2.5 rounded border-2 border-dashed border-border bg-muted transition-colors hover:border-primary/40"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth={1.5}
        className="h-7 w-7 stroke-muted-foreground"
      >
        <path strokeLinecap="round" d="M12 4v16m8-8H4" />
      </svg>
      <span className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
        Добавить услугу
      </span>
    </button>
  );
}
