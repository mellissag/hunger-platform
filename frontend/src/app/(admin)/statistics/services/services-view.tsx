"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiJson } from "@/lib/api";
import { cn } from "@/lib/utils";
import type {
  StatsDeadServicesResponse,
  StatsServicesResponse,
} from "@/types/admin-api";

import { useStatisticsPeriod } from "../statistics-context";

const PRIMARY = "#C9A84C";

type OrderBy = "revenue" | "popularity";

export function ServicesStatsView() {
  const t = useTranslations("pages.statistics");
  const locale = useLocale();
  const { qs, to } = useStatisticsPeriod();
  const [orderBy, setOrderBy] = useState<OrderBy>("revenue");

  const { data: top, isLoading: topLoading } = useQuery({
    queryKey: ["stats", "services", "top", qs, orderBy],
    queryFn: () =>
      apiJson<StatsServicesResponse>(
        `/stats/services/top?${qs}&order_by=${orderBy}&limit=20`,
      ),
  });

  const { data: dead, isLoading: deadLoading } = useQuery({
    queryKey: ["stats", "services", "dead", to],
    queryFn: () =>
      apiJson<StatsDeadServicesResponse>(
        `/stats/services/dead?to=${encodeURIComponent(to)}&dead_days=30`,
      ),
  });

  if (topLoading || deadLoading || !top || !dead) {
    return <Skeleton className="h-64 w-full" />;
  }

  const currency = top.currency || "EUR";
  const fmtMoney = (s: string) =>
    new Intl.NumberFormat(locale, { style: "currency", currency }).format(
      Number.parseFloat(s),
    );
  const name = (i18n: Record<string, string>) =>
    i18n[locale] ?? i18n.en ?? Object.values(i18n)[0] ?? "—";

  const chartData = top.top.slice(0, 10).map((s) => ({
    name: name(s.name_i18n),
    revenue: Number.parseFloat(s.revenue),
    bookings: s.completed_bookings,
  }));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>{t("servicesTop")}</CardTitle>
          <div className="flex gap-1">
            {(["popularity", "revenue"] as OrderBy[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setOrderBy(m)}
                className={cn(
                  "rounded-md px-2 py-1 text-xs transition-colors",
                  orderBy === m
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/60 text-muted-foreground hover:bg-muted",
                )}
              >
                {t(m === "revenue" ? "byRevenue" : "byPopularity")}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {top.top.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("serviceName")}</TableHead>
                  <TableHead>{t("colRevenue")}</TableHead>
                  <TableHead>{t("colBookings")}</TableHead>
                  <TableHead>{t("colAvgCheck")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {top.top.map((s) => (
                  <TableRow key={s.service_id}>
                    <TableCell className="font-medium">
                      {name(s.name_i18n)}
                    </TableCell>
                    <TableCell>{fmtMoney(s.revenue)}</TableCell>
                    <TableCell>{s.completed_bookings}</TableCell>
                    <TableCell>
                      {s.avg_check ? fmtMoney(s.avg_check) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {chartData.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("servicesChartTitle")}</CardTitle>
          </CardHeader>
          <CardContent style={{ height: Math.max(chartData.length * 32 + 50, 220) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ left: 12, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) =>
                    orderBy === "revenue"
                      ? new Intl.NumberFormat(locale, {
                          style: "currency",
                          currency,
                          maximumFractionDigits: 0,
                        }).format(Number(v))
                      : String(v)
                  }
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={140}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip
                  formatter={(value: unknown, key: unknown) => {
                    const k = String(key);
                    if (k === "revenue")
                      return [fmtMoney(String(value)), t("colRevenue")];
                    if (k === "bookings")
                      return [String(value), t("colBookings")];
                    return [String(value), k];
                  }}
                />
                <Bar
                  dataKey={orderBy === "revenue" ? "revenue" : "bookings"}
                  fill={PRIMARY}
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("servicesDead")}</CardTitle>
        </CardHeader>
        <CardContent>
          {dead.dead.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-5 w-5" />
              <span>{t("deadServicesEmpty")}</span>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("serviceName")}</TableHead>
                  <TableHead>{t("colLastBooking")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dead.dead.map((s) => (
                  <TableRow key={s.service_id}>
                    <TableCell>{name(s.name_i18n)}</TableCell>
                    <TableCell>
                      {s.last_booking_at ? (
                        new Intl.DateTimeFormat(locale, {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        }).format(new Date(s.last_booking_at))
                      ) : (
                        <span className="text-muted-foreground">
                          {t("deadServicesNever")}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
