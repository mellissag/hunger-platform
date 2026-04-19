"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiJson } from "@/lib/api";
import type { StatsOverviewResponse } from "@/types/admin-api";

import { useStatisticsPeriod } from "../statistics-context";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function OverviewView() {
  const t = useTranslations("pages.statistics");
  const locale = useLocale();
  const { qs } = useStatisticsPeriod();

  const { data, isLoading } = useQuery({
    queryKey: ["stats", "overview", qs],
    queryFn: () => apiJson<StatsOverviewResponse>(`/stats/overview?${qs}`),
  });

  const heatmapMatrix = useMemo(() => {
    const m: number[][] = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
    let mx = 1;
    for (const c of data?.heatmap ?? []) {
      if (c.dow >= 0 && c.dow < 7 && c.hour >= 0 && c.hour < 24) {
        const row = m[c.dow];
        if (row) {
          row[c.hour] = c.count;
          mx = Math.max(mx, c.count);
        }
      }
    }
    return { m, mx };
  }, [data?.heatmap]);

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const kpi = data.kpi;
  const currency = data.currency || "EUR";
  const fmtMoney = (s: string) =>
    new Intl.NumberFormat(locale, { style: "currency", currency }).format(Number.parseFloat(s));

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t("kpiRevenue")}</CardDescription>
            <CardTitle className="text-xl">{fmtMoney(String(kpi.revenue ?? "0"))}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t("kpiCompleted")}</CardDescription>
            <CardTitle className="text-xl">{String(kpi.completed_bookings ?? 0)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t("kpiAvgCheck")}</CardDescription>
            <CardTitle className="text-xl">{fmtMoney(String(kpi.avg_check ?? "0"))}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t("kpiConversion")}</CardDescription>
            <CardTitle className="text-xl">
              {((Number(kpi.conversion_completed_per_bot_started ?? 0) || 0) * 100).toFixed(1)}%
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("chartRevenue")}</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.revenue_trend.map((r) => ({ ...r, revenue: Number.parseFloat(r.revenue) }))}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(v) => [fmtMoney(String(v ?? 0)), t("kpiRevenue")]}
                labelFormatter={(l) => String(l)}
              />
              <Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("chartHeatmap")}</CardTitle>
          <CardDescription>{t("heatmapHint")}</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full border-collapse text-[10px]">
            <thead>
              <tr>
                <th className="p-1" />
                {Array.from({ length: 24 }, (_, h) => (
                  <th key={h} className="p-0.5 font-normal text-muted-foreground">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {heatmapMatrix.m.map((row, di) => (
                <tr key={DOW[di]}>
                  <td className="pr-2 text-left text-muted-foreground">{DOW[di]}</td>
                  {row.map((v, hi) => (
                    <td key={hi} className="p-0.5">
                      <div
                        className="h-4 w-full min-w-[10px] rounded-sm bg-primary"
                        style={{ opacity: v ? Math.max(0.12, v / heatmapMatrix.mx) : 0.06 }}
                        title={`${v}`}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
