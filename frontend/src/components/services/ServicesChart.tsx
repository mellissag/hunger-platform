"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useLocale, useTranslations } from "next-intl";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useServices } from "@/hooks/useServices";

const CHART_COLORS = ["#9A7230", "#C9A96E", "#B8A888", "#C8BFA8", "#E4DDD0"];

type SortOption = "bookings" | "revenue";

export function ServicesChart() {
  const locale = useLocale();
  const t = useTranslations("pages.services");
  const { data } = useServices();
  const [sort, setSort] = useState<SortOption>("bookings");

  const SORT_OPTIONS = [
    { label: t("chartByBookings"), value: "bookings" as const },
    { label: t("chartByRevenue"), value: "revenue" as const },
  ];

  const services = useMemo(() => data?.items ?? [], [data?.items]);

  const lineData = useMemo(() => {
    const sorted = [...services]
      .filter((s) => s.is_active)
      .sort((a, b) => (b.bookings_count ?? 0) - (a.bookings_count ?? 0))
      .slice(0, 6);

    return sorted.map((s, i) => ({
      name: s.name_i18n[locale] ?? s.name_i18n.en ?? s.name_i18n.ru ?? `Услуга ${i + 1}`,
      value: sort === "bookings" ? (s.bookings_count ?? 0) : Number(s.price),
    }));
  }, [services, locale, sort]);

  const pieData = useMemo(() => {
    if (!services.length) return [];
    const byCat: Record<string, { name: string; value: number }> = {};
    for (const s of services) {
      const key = s.category_id ?? "other";
      if (!byCat[key]) {
        byCat[key] = { name: key.slice(0, 8), value: 0 };
      }
      byCat[key]!.value += s.bookings_count ?? 1;
    }
    return Object.values(byCat)
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [services]);

  const totalBookings = pieData.reduce((s, d) => s + d.value, 0);

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      {/* Line / Area chart — 2/3 */}
      <Card className="lg:col-span-2">
        <CardHeader className="flex flex-row items-start justify-between pb-2">
          <div>
            <CardTitle className="font-playfair text-lg font-medium">{t("chartPopularity")}</CardTitle>
            <p className="mt-1 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
              {t("chartSubtitle")}
            </p>
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortOption)}
            className="rounded border border-border bg-muted px-2 py-1 text-[11px] uppercase tracking-wider text-primary outline-none"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label} ▾
              </option>
            ))}
          </select>
        </CardHeader>
        <CardContent className="h-[220px] pt-0">
          {lineData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {t("noData")}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={lineData}>
                <defs>
                  <linearGradient id="goldGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#9A7230" stopOpacity={0.18} />
                    <stop offset="100%" stopColor="#9A7230" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke="#E4DDD0" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis
                  allowDecimals={false}
                  width={32}
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    fontSize: 12,
                    borderRadius: 2,
                    border: "1px solid #E4DDD0",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#9A7230"
                  strokeWidth={2}
                  fill="url(#goldGrad)"
                  dot={{ r: 4, fill: "#9A7230", stroke: "#fff", strokeWidth: 2 }}
                  activeDot={{ r: 5, fill: "#9A7230", stroke: "#fff", strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Donut chart — 1/3 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="font-playfair text-lg font-medium">{t("chartCategories")}</CardTitle>
          <p className="mt-1 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            {t("chartCatSubtitle")}
          </p>
        </CardHeader>
        <CardContent className="pt-0">
          {pieData.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              {t("noData")}
            </div>
          ) : (
            <div className="flex items-center gap-5">
              <div className="relative h-[140px] w-[140px] shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={65}
                      strokeWidth={0}
                    >
                      {pieData.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <span className="font-playfair text-2xl font-medium text-primary">
                    {totalBookings}
                  </span>
                </div>
              </div>
              <div className="flex-1 space-y-0">
                {pieData.map((row, i) => {
                  const pct = totalBookings > 0 ? Math.round((row.value / totalBookings) * 100) : 0;
                  return (
                    <div
                      key={i}
                      className="flex items-center justify-between gap-2 border-b border-dashed border-border py-2 last:border-b-0"
                    >
                      <div className="flex items-center gap-2 text-[12px]">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{
                            background: CHART_COLORS[i % CHART_COLORS.length],
                          }}
                        />
                        <span className="truncate text-foreground">{row.name}</span>
                      </div>
                      <span className="font-playfair text-[14px] font-medium text-primary">
                        {pct}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
