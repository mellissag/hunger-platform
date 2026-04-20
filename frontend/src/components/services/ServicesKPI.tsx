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
  const { data, isLoading } = useServiceStats();
  const t = useTranslations("pages.services");

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-2 gap-5 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <KpiSkeleton key={i} />
        ))}
      </div>
    );
  }

  const activePercent = data.total > 0 ? Math.round((data.active / data.total) * 100) : 0;

  return (
    <div className="grid grid-cols-2 gap-5 xl:grid-cols-4">
      <KpiItem label={t("kpiTotal")} value={String(data.total)} trend={t("kpiInCatalog")} />
      <KpiItem
        label={t("kpiActive")}
        value={String(data.active)}
        trend={`↗ ${activePercent}%`}
        trendUp={activePercent >= 50}
      />
      <KpiItem
        label={t("kpiBookings")}
        value={String(data.bookings_month)}
        trend={`↗ ${t("chartSubtitle")}`}
        trendUp={data.bookings_month > 0}
      />
      <KpiItem label={t("kpiRevenue")} value={`€ ${data.avg_revenue}`} trend={t("kpiInCatalog")} />
    </div>
  );
}
