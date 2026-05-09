"use client";

import { useTranslations } from "next-intl";

import { Skeleton } from "@/components/ui/skeleton";
import { useServiceStats } from "@/hooks/useServiceStats";

interface KpiItemProps {
  label: string;
  value: string;
  trend: string;
  trendUp?: boolean;
}

function KpiItem({ label, value, trend, trendUp }: KpiItemProps) {
  return (
    <div className="kpi-card-premium relative overflow-hidden rounded border border-border bg-card p-6 shadow-[0_1px_4px_rgba(28,20,9,.06)] transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_8px_24px_rgba(28,20,9,.08)]">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">{label}</p>
      <p className="kpi-value-premium mt-3 text-4xl font-medium tabular-nums leading-none tracking-tight">
        {value}
      </p>
      <p
        className={`mt-2 text-[11px] font-medium tracking-wider ${
          trendUp === undefined
            ? "text-muted-foreground"
            : trendUp
              ? "text-emerald-600"
              : "text-red-600"
        }`}
      >
        {trend}
      </p>
    </div>
  );
}

function KpiSkeleton() {
  return (
    <div className="rounded border border-border bg-card p-6">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-9 w-16" />
      <Skeleton className="mt-2 h-3 w-28" />
    </div>
  );
}

export function ServicesKPI() {
  const { data, isPending, isFetching, isError } = useServiceStats();
  const t = useTranslations("pages.services");

  const loading = (isPending || isFetching) && !data;

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-5 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <KpiSkeleton key={i} />
        ))}
      </div>
    );
  }

  const safe = data ?? {
    total: 0,
    active: 0,
    bookings_month: 0,
    avg_revenue: 0,
  };

  const activePercent = safe.total > 0 ? Math.round((safe.active / safe.total) * 100) : 0;

  return (
    <>
      {isError ? (
        <p className="mb-2 text-center text-xs text-muted-foreground">{t("kpiLoadError")}</p>
      ) : null}
      <div className="grid grid-cols-2 gap-5 xl:grid-cols-4">
        <KpiItem label={t("kpiTotal")} value={String(safe.total)} trend={t("kpiInCatalog")} />
        <KpiItem
          label={t("kpiActive")}
          value={String(safe.active)}
          trend={`↗ ${activePercent}%`}
          trendUp={activePercent >= 50}
        />
        <KpiItem
          label={t("kpiBookings")}
          value={String(safe.bookings_month)}
          trend={`↗ ${t("chartSubtitle")}`}
          trendUp={safe.bookings_month > 0}
        />
        <KpiItem label={t("kpiRevenue")} value={`€ ${safe.avg_revenue}`} trend={t("kpiInCatalog")} />
      </div>
    </>
  );
}
