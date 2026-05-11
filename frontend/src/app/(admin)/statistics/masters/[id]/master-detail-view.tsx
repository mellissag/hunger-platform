"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import type { StatsMasterDetailResponse } from "@/types/admin-api";

import { useStatisticsPeriod } from "../../statistics-context";

const PRIMARY = "#C9A84C";

function shortDate(iso: string, locale: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(d);
}

export function MasterDetailView({ masterId }: { masterId: string }) {
  const t = useTranslations("pages.statistics");
  const locale = useLocale();
  const sp = useSearchParams();
  const { qs: ctxQs } = useStatisticsPeriod();
  const qs = sp.toString() || ctxQs;

  const { data, isLoading } = useQuery({
    queryKey: ["stats", "master", masterId, qs],
    queryFn: () =>
      apiJson<StatsMasterDetailResponse>(`/stats/masters/${masterId}?${qs}`),
  });

  if (isLoading || !data) {
    return <Skeleton className="h-40 w-full" />;
  }

  const currency = data.currency || "EUR";
  const fmt = (s: string) =>
    new Intl.NumberFormat(locale, { style: "currency", currency }).format(
      Number.parseFloat(s),
    );
  const name = (i18n: Record<string, string>) =>
    i18n[locale] ?? i18n.en ?? Object.values(i18n)[0] ?? "—";

  const trend = data.revenue_by_day.map((r) => ({
    date: r.date,
    label: shortDate(r.date, locale),
    revenue: Number.parseFloat(r.revenue),
    bookings: r.bookings_count,
  }));
  const trendEmpty = trend.length === 0;

  return (
    <div className="space-y-6">
      <Button variant="secondary" asChild>
        <Link href={`/statistics/masters?${qs}`}>← {t("mastersTable")}</Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>{data.display_name}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <CardDescription>{t("colRevenue")}</CardDescription>
            <p className="text-xl font-semibold">{fmt(data.revenue)}</p>
          </div>
          <div>
            <CardDescription>{t("colBookings")}</CardDescription>
            <p className="text-xl font-semibold">{data.completed_bookings}</p>
          </div>
          <div>
            <CardDescription>{t("colAvgCheck")}</CardDescription>
            <p className="text-xl font-semibold">{fmt(data.avg_check)}</p>
          </div>
          <div>
            <CardDescription>{t("colPayroll")}</CardDescription>
            <p className="text-xl font-semibold">{fmt(data.payroll_amount)}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("masterDetailRevenueChart")}</CardTitle>
        </CardHeader>
        <CardContent className="h-64">
          {trendEmpty ? (
            <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {t("empty")}
            </p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend}>
                <defs>
                  <linearGradient id="masterRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={PRIMARY} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={PRIMARY} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) =>
                    new Intl.NumberFormat(locale, {
                      style: "currency",
                      currency,
                      maximumFractionDigits: 0,
                    }).format(Number(v))
                  }
                />
                <RechartsTooltip
                  formatter={(value: unknown, key: unknown) => {
                    if (String(key) === "revenue")
                      return [fmt(String(value)), t("kpiRevenue")];
                    return [String(value), t("tooltipBookings")];
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke={PRIMARY}
                  strokeWidth={2}
                  fill="url(#masterRev)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("masterDetailServices")}</CardTitle>
        </CardHeader>
        <CardContent>
          {data.services_breakdown.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("serviceName")}</TableHead>
                  <TableHead>{t("colBookings")}</TableHead>
                  <TableHead>{t("colRevenue")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.services_breakdown.map((s) => (
                  <TableRow key={s.service_id}>
                    <TableCell>{name(s.name_i18n)}</TableCell>
                    <TableCell>{s.completed_bookings}</TableCell>
                    <TableCell>{fmt(s.revenue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("masterDetailClients")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div>
            <CardDescription>{t("masterDetailClientsUnique")}</CardDescription>
            <p className="text-2xl font-semibold">{data.unique_clients}</p>
          </div>
          <div>
            <CardDescription>{t("masterDetailClientsNew")}</CardDescription>
            <p className="text-2xl font-semibold">{data.new_clients}</p>
          </div>
          <div>
            <CardDescription>{t("masterDetailClientsRepeat")}</CardDescription>
            <p className="text-2xl font-semibold">{data.repeat_clients}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("masterDetailRecent")}</CardTitle>
        </CardHeader>
        <CardContent>
          {data.recent_bookings.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("recentColDate")}</TableHead>
                  <TableHead>{t("recentColClient")}</TableHead>
                  <TableHead>{t("recentColService")}</TableHead>
                  <TableHead>{t("recentColPrice")}</TableHead>
                  <TableHead>{t("recentColStatus")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recent_bookings.map((b) => (
                  <TableRow key={b.booking_id}>
                    <TableCell>
                      {b.starts_at
                        ? new Intl.DateTimeFormat(locale, {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          }).format(new Date(b.starts_at))
                        : "—"}
                    </TableCell>
                    <TableCell>{b.client_name}</TableCell>
                    <TableCell>{name(b.service_name_i18n)}</TableCell>
                    <TableCell>{fmt(b.price)}</TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        {b.status}
                      </span>
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
