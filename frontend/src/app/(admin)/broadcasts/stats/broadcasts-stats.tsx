"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BarChart2, CheckCheck, Send, TrendingUp, Users, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiJson } from "@/lib/api";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────

type StatsCampaign = {
  id: string;
  title: string;
  status: string;
  sent_at: string | null;
  total: number;
  sent: number;
  delivered: number;
  failed: number;
  delivery_rate: number;
};

type StatsDaily = {
  date: string;
  sent: number;
  delivered: number;
};

type StatsSummary = {
  total_broadcasts: number;
  total_recipients: number;
  total_sent: number;
  total_delivered: number;
  total_failed: number;
  delivery_rate: number;
  daily_chart: StatsDaily[];
  campaigns: StatsCampaign[];
};

// ── Status helpers ──────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  draft: "Черновик",
  scheduled: "Запланировано",
  sending: "Отправляется",
  sent: "Отправлено",
  failed: "Ошибка",
};

const STATUS_CLASSES: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  scheduled: "bg-blue-50 text-blue-700",
  sending: "bg-amber-50 text-amber-700",
  sent: "bg-green-50 text-green-700",
  failed: "bg-red-50 text-red-700",
};

// ── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  iconColor,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  iconColor?: string;
}) {
  return (
    <Card className="border border-border shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
      <CardContent className="flex items-start gap-4 p-5">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
            iconColor ?? "bg-primary/10 text-primary",
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="mt-0.5 text-2xl font-bold leading-none">
            {typeof value === "number" ? value.toLocaleString("ru-RU") : value}
          </p>
          {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Sort helpers ────────────────────────────────────────────────────────────

type SortKey = keyof StatsCampaign;
type SortDir = "asc" | "desc";

function sortCampaigns(
  campaigns: StatsCampaign[],
  key: SortKey,
  dir: SortDir,
): StatsCampaign[] {
  return [...campaigns].sort((a, b) => {
    const av = a[key] ?? "";
    const bv = b[key] ?? "";
    if (av < bv) return dir === "asc" ? -1 : 1;
    if (av > bv) return dir === "asc" ? 1 : -1;
    return 0;
  });
}

// ── Main component ──────────────────────────────────────────────────────────

export function BroadcastsStats() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [appliedFilters, setAppliedFilters] = useState({ dateFrom: "", dateTo: "", status: "" });
  const [sortKey, setSortKey] = useState<SortKey>("sent_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const { data, isLoading } = useQuery({
    queryKey: ["broadcasts-stats", appliedFilters],
    queryFn: () => {
      const params = new URLSearchParams();
      if (appliedFilters.dateFrom) params.set("date_from", appliedFilters.dateFrom);
      if (appliedFilters.dateTo) params.set("date_to", appliedFilters.dateTo);
      if (appliedFilters.status) params.set("status", appliedFilters.status);
      return apiJson<StatsSummary>(`/broadcasts/stats/summary?${params.toString()}`);
    },
  });

  const sortedCampaigns = useMemo(
    () => (data ? sortCampaigns(data.campaigns, sortKey, sortDir) : []),
    [data, sortKey, sortDir],
  );

  const top5 = useMemo(
    () =>
      (data?.campaigns ?? [])
        .filter((c) => c.sent > 0)
        .sort((a, b) => b.delivery_rate - a.delivery_rate)
        .slice(0, 5),
    [data],
  );

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const chartData = (data?.daily_chart ?? []).map((d) => ({
    ...d,
    date: new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(
      new Date(d.date),
    ),
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" asChild>
            <Link href="/broadcasts">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="font-playfair text-2xl font-semibold tracking-tight">
              Статистика рассылок
            </h1>
            <p className="text-sm text-muted-foreground">
              Сводная аналитика по всем кампаниям
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <Card className="border border-border shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        <CardContent className="flex flex-wrap items-end gap-3 pt-5">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">С даты</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-9 rounded-md border border-border bg-card px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">По дату</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-9 rounded-md border border-border bg-card px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Статус</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 rounded-md border border-border bg-card px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Все статусы</option>
              <option value="sent">Отправлено</option>
              <option value="scheduled">Запланировано</option>
              <option value="draft">Черновики</option>
              <option value="failed">Ошибки</option>
            </select>
          </div>
          <Button
            onClick={() =>
              setAppliedFilters({ dateFrom, dateTo, status: statusFilter })
            }
          >
            Применить
          </Button>
          {(appliedFilters.dateFrom || appliedFilters.dateTo || appliedFilters.status) && (
            <Button
              variant="ghost"
              onClick={() => {
                setDateFrom("");
                setDateTo("");
                setStatusFilter("");
                setAppliedFilters({ dateFrom: "", dateTo: "", status: "" });
              }}
            >
              Сбросить
            </Button>
          )}
        </CardContent>
      </Card>

      {/* KPI cards */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : data ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <KpiCard
            icon={Users}
            label="Всего кампаний"
            value={data.total_broadcasts}
            sub={`${data.total_recipients.toLocaleString("ru-RU")} получателей`}
            iconColor="bg-primary/10 text-primary"
          />
          <KpiCard
            icon={Send}
            label="Отправлено"
            value={data.total_sent}
            iconColor="bg-blue-50 text-blue-600"
          />
          <KpiCard
            icon={CheckCheck}
            label="Доставлено"
            value={data.total_delivered}
            sub={data.total_sent > 0 ? `${data.delivery_rate}% доставляемость` : undefined}
            iconColor="bg-green-50 text-green-600"
          />
          <KpiCard
            icon={XCircle}
            label="Ошибки"
            value={data.total_failed}
            iconColor="bg-red-50 text-red-500"
          />
        </div>
      ) : null}

      {/* Line chart */}
      {!isLoading && chartData.length > 0 && (
        <Card className="border border-border shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <TrendingUp className="h-4 w-4 text-primary" />
              Динамика по дням
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  width={36}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line
                  type="monotone"
                  dataKey="sent"
                  name="Отправлено"
                  stroke="#9A7230"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="delivered"
                  name="Доставлено"
                  stroke="#16a34a"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Top 5 by delivery rate */}
      {!isLoading && top5.length > 0 && (
        <Card className="border border-border shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <BarChart2 className="h-4 w-4 text-primary" />
              Топ-5 кампаний по доставляемости
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {top5.map((c) => (
              <div key={c.id} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <Link
                    href={`/broadcasts/${c.id}`}
                    className="max-w-[60%] truncate font-medium hover:underline"
                  >
                    {c.title}
                  </Link>
                  <span className="font-semibold text-green-700">{c.delivery_rate}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-green-500 transition-all duration-500"
                    style={{ width: `${Math.min(c.delivery_rate, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Campaigns table */}
      <Card className="border border-border shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Все кампании</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-5">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : sortedCampaigns.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Нет данных
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    {(
                      [
                        ["title", "Название"],
                        ["status", "Статус"],
                        ["sent_at", "Дата"],
                        ["total", "Получ."],
                        ["sent", "Отправл."],
                        ["delivered", "Доставл."],
                        ["failed", "Ошибки"],
                        ["delivery_rate", "Доставл. %"],
                      ] as [SortKey, string][]
                    ).map(([key, label]) => (
                      <th
                        key={key}
                        className="cursor-pointer select-none whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
                        onClick={() => handleSort(key)}
                      >
                        {label}
                        {sortKey === key && (
                          <span className="ml-1 text-primary">
                            {sortDir === "asc" ? "↑" : "↓"}
                          </span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedCampaigns.map((c, idx) => (
                    <tr
                      key={c.id}
                      className={cn(
                        "border-b border-border/50 transition-colors hover:bg-muted/30",
                        idx % 2 === 0 ? "" : "bg-muted/10",
                      )}
                    >
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/broadcasts/${c.id}`}
                          className="max-w-[200px] truncate font-medium hover:underline"
                        >
                          {c.title}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-medium",
                            STATUS_CLASSES[c.status] ?? "bg-muted text-muted-foreground",
                          )}
                        >
                          {STATUS_LABELS[c.status] ?? c.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">
                        {c.sent_at
                          ? new Intl.DateTimeFormat("ru-RU", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            }).format(new Date(c.sent_at))
                          : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right">{c.total.toLocaleString("ru-RU")}</td>
                      <td className="px-4 py-2.5 text-right">{c.sent.toLocaleString("ru-RU")}</td>
                      <td className="px-4 py-2.5 text-right text-green-700">
                        {c.delivered.toLocaleString("ru-RU")}
                      </td>
                      <td className="px-4 py-2.5 text-right text-red-600">
                        {c.failed > 0 ? c.failed.toLocaleString("ru-RU") : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {c.sent > 0 ? (
                          <span
                            className={cn(
                              "font-semibold",
                              c.delivery_rate >= 80
                                ? "text-green-700"
                                : c.delivery_rate >= 50
                                  ? "text-amber-600"
                                  : "text-red-600",
                            )}
                          >
                            {c.delivery_rate}%
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
