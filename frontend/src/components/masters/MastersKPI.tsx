"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { apiJson } from "@/lib/api";
import type { MasterOut, MastersTodayStats } from "@/types/admin-api";

export function MastersKPI({ masters }: { masters: MasterOut[] }) {
  const t = useTranslations("pages.masters");
  const activeMasters = masters.filter((m) => m.is_active).length;
  const ratedMasters = masters.filter((m) => m.rating_count > 0 && m.rating_avg);
  const avgRating =
    ratedMasters.length === 0
      ? 0
      : ratedMasters.reduce((sum, m) => sum + Number.parseFloat(m.rating_avg!), 0) /
        ratedMasters.length;

  const { data: todayStats } = useQuery({
    queryKey: ["masters-today-stats"],
    queryFn: () => apiJson<MastersTodayStats>("/masters/stats/today"),
    staleTime: 60_000,
  });

  const kpis = [
    { label: t("kpiTotal"), value: String(masters.length), sub: t("kpiActiveSub", { count: activeMasters }) },
    { label: t("kpiAvgRating"), value: avgRating.toFixed(1), sub: t("kpiAvgRatingSub") },
    {
      label: t("kpiToday"),
      value: todayStats ? String(todayStats.bookings_today) : "—",
      sub: t("kpiTodaySub"),
    },
    {
      label: t("kpiRevenue"),
      value: todayStats ? `€ ${todayStats.revenue_month.toFixed(0)}` : "—",
      sub: t("kpiRevenueSub"),
    },
  ];

  return (
    <div className="masters-kpi-row">
      {kpis.map((k) => (
        <div key={k.label} className="masters-kpi-item">
          <span className="kpi-label">{k.label}</span>
          <span className="kpi-value">{k.value}</span>
          <span className="kpi-sub">{k.sub}</span>
        </div>
      ))}
    </div>
  );
}
