"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { apiJson } from "@/lib/api";
import type {
  StatsMastersListResponse,
  StatsOverviewResponse,
  StatsTopService,
} from "@/types/admin-api";

import {
  useStatisticsPeriod,
  type GroupBy,
} from "../statistics-context";

const DOW_KEYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const FUNNEL_T_KEYS: Record<string, string> = {
  bot_visitors: "funnelBotVisitors",
  registration_started: "funnelRegStarted",
  registration_completed: "funnelRegCompleted",
  first_booking: "funnelFirstBooking",
  repeat_booking: "funnelRepeatBooking",
};
const SOURCE_LABELS: Record<string, string> = {
  bot: "sourceBot",
  mini_app: "sourceMiniApp",
  admin: "sourceAdmin",
  manual: "sourceManual",
};
const SOURCE_COLORS: Record<string, string> = {
  bot: "#C9A84C",
  mini_app: "#7AA76D",
  admin: "#7B8FA1",
  manual: "#B7AAA2",
};

const PRIMARY = "#C9A84C";
const SECONDARY_MUTED = "#94A3B8";

function pctDelta(curr: number, prev: number): number | null {
  if (prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

function formatShortDate(iso: string, locale: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(d);
}

function DeltaBadge({
  value,
  vsLabel,
}: {
  value: number | null;
  vsLabel: string;
}) {
  const t = useTranslations("pages.statistics");
  if (value === null) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const rounded = Math.round(value * 10) / 10;
  if (Math.abs(rounded) < 0.05) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <ArrowRight className="h-3 w-3" /> {t("noChange")}
      </span>
    );
  }
  const up = rounded > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium",
        up ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
      )}
    >
      {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {`${up ? "+" : ""}${rounded.toFixed(1)}%`} {vsLabel}
    </span>
  );
}

function KpiCard({
  href,
  title,
  value,
  delta,
}: {
  href?: string;
  title: string;
  value: string;
  delta?: React.ReactNode;
}) {
  const inner = (
    <Card className="h-full transition-shadow hover:shadow-md">
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-xl">{value}</CardTitle>
        {delta ? <div className="pt-1">{delta}</div> : null}
      </CardHeader>
    </Card>
  );
  if (href) {
    return (
      <Link href={href} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-md">
        {inner}
      </Link>
    );
  }
  return inner;
}

function TopServicesBlock({
  data,
  currency,
  locale,
}: {
  data: { revenue: StatsTopService[]; popularity: StatsTopService[] };
  currency: string;
  locale: string;
}) {
  const t = useTranslations("pages.statistics");
  const [mode, setMode] = useState<"revenue" | "popularity">("revenue");
  const rows = mode === "revenue" ? data.revenue : data.popularity;
  const name = (i18n: Record<string, string>) =>
    i18n[locale] ?? i18n.en ?? Object.values(i18n)[0] ?? "—";
  const fmtMoney = (s: string) =>
    new Intl.NumberFormat(locale, { style: "currency", currency }).format(Number.parseFloat(s));
  const max = rows.reduce((acc, r) => {
    const v = mode === "revenue" ? Number.parseFloat(r.revenue) : r.completed_bookings;
    return v > acc ? v : acc;
  }, 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>{t("topServicesTitle")}</CardTitle>
        <div className="flex gap-1">
          {(["popularity", "revenue"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "rounded-md px-2 py-1 text-xs transition-colors",
                mode === m
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
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => {
              const v =
                mode === "revenue" ? Number.parseFloat(r.revenue) : r.completed_bookings;
              const pct = max > 0 ? (v / max) * 100 : 0;
              return (
                <div key={r.service_id} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="truncate font-medium">{name(r.name_i18n)}</span>
                    <span className="ml-2 shrink-0 text-muted-foreground">
                      {mode === "revenue" ? fmtMoney(r.revenue) : r.completed_bookings}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${pct}%`, backgroundColor: PRIMARY }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FunnelBlock({ steps }: { steps: { key: string; count: number }[] }) {
  const t = useTranslations("pages.statistics");
  const top = steps[0]?.count ?? 0;
  const empty = steps.every((s) => s.count === 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("funnelTitle")}</CardTitle>
      </CardHeader>
      <CardContent>
        {empty ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <div className="space-y-2">
            {steps.map((s, i) => {
              const width = top > 0 ? Math.max(10, (s.count / top) * 100) : 0;
              const prev = i > 0 ? steps[i - 1]?.count ?? 0 : 0;
              const pctOfPrev = i > 0 && prev > 0 ? (s.count / prev) * 100 : null;
              const tKey = FUNNEL_T_KEYS[s.key] ?? s.key;
              return (
                <div key={s.key} className="flex items-center gap-3">
                  <div className="w-44 text-sm">
                    {t(tKey as Parameters<typeof t>[0])}
                  </div>
                  <div className="relative h-9 flex-1 overflow-hidden rounded-md bg-muted/40">
                    <div
                      className="absolute left-0 top-0 flex h-full items-center justify-between rounded-md px-3 text-sm font-medium text-primary-foreground"
                      style={{
                        width: `${width}%`,
                        backgroundColor: PRIMARY,
                      }}
                    >
                      <span>{s.count}</span>
                      {pctOfPrev !== null ? (
                        <span className="text-xs opacity-90">{pctOfPrev.toFixed(0)}%</span>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PeakHoursBlock({
  peakHours,
}: {
  peakHours: { hour: number; count: number; avg_per_day: number }[];
}) {
  const t = useTranslations("pages.statistics");
  const empty = peakHours.every((p) => p.count === 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("peakHoursTitle")}</CardTitle>
        <CardDescription>{t("peakHoursHint")}</CardDescription>
      </CardHeader>
      <CardContent className="h-56">
        {empty ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={peakHours}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="hour" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(v: unknown) => [
                  String(v),
                  t("tooltipBookings"),
                ]}
                labelFormatter={(l) => `${l}:00`}
              />
              <Bar dataKey="avg_per_day" fill={PRIMARY} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

function SourcesBlock({
  sources,
}: {
  sources: { source: string; count: number }[];
}) {
  const t = useTranslations("pages.statistics");
  const empty = sources.length === 0 || sources.every((s) => s.count === 0);
  const data = sources.map((s) => ({
    name: t((SOURCE_LABELS[s.source] ?? s.source) as Parameters<typeof t>[0]),
    value: s.count,
    color: SOURCE_COLORS[s.source] ?? PRIMARY,
  }));
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("sourcesTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="h-64">
        {empty ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius={50}
                outerRadius={85}
                paddingAngle={2}
              >
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

function HeatmapBlock({
  heatmap,
  locale,
}: {
  heatmap: { dow: number; hour: number; count: number }[];
  locale: string;
}) {
  const t = useTranslations("pages.statistics");
  const { matrix, max } = useMemo(() => {
    const m: number[][] = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
    let mx = 1;
    for (const c of heatmap) {
      if (c.dow >= 0 && c.dow < 7 && c.hour >= 0 && c.hour < 24) {
        const row = m[c.dow];
        if (row) {
          row[c.hour] = c.count;
          mx = Math.max(mx, c.count);
        }
      }
    }
    return { matrix: m, max: mx };
  }, [heatmap]);
  const total = heatmap.reduce((sum, c) => sum + c.count, 0);
  const dowDate = new Date(2024, 0, 1);
  const dowLabel = (i: number): string => {
    const d = new Date(dowDate);
    d.setDate(d.getDate() + i);
    return new Intl.DateTimeFormat(locale, { weekday: "short" }).format(d);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("chartHeatmap")}</CardTitle>
        <CardDescription>{t("heatmapHint")}</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {total === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
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
              {matrix.map((row, di) => (
                <tr key={DOW_KEYS[di]}>
                  <td className="pr-2 text-left text-muted-foreground">{dowLabel(di)}</td>
                  {row.map((v, hi) => (
                    <td key={hi} className="p-0.5">
                      <div
                        className="h-4 w-full min-w-[10px] rounded-sm bg-primary"
                        style={{ opacity: v ? Math.max(0.12, v / max) : 0.06 }}
                        title={t("heatmapTooltip", {
                          dow: dowLabel(di),
                          hour: hi,
                          count: v,
                        })}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

function MasterFilter() {
  const t = useTranslations("pages.statistics");
  const { masterId, setMasterId } = useStatisticsPeriod();
  const { data } = useQuery({
    queryKey: ["stats", "masters-list"],
    queryFn: () => apiJson<StatsMastersListResponse>("/stats/masters-list"),
  });
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="stat-master" className="text-sm text-muted-foreground">
        {t("filterMaster")}:
      </label>
      <select
        id="stat-master"
        value={masterId ?? ""}
        onChange={(e) => setMasterId(e.target.value ? e.target.value : null)}
        className="rounded-md border border-input bg-background px-2 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
      >
        <option value="">{t("filterAllMasters")}</option>
        {(data?.masters ?? []).map((m) => (
          <option key={m.master_id} value={m.master_id}>
            {m.display_name}
          </option>
        ))}
      </select>
    </div>
  );
}

export function OverviewView() {
  const t = useTranslations("pages.statistics");
  const locale = useLocale();
  const { qs, groupBy, setGroupBy, from, to } = useStatisticsPeriod();

  const url = useMemo(() => `/stats/overview?${qs}&group_by=${groupBy}`, [qs, groupBy]);
  const { data, isLoading } = useQuery({
    queryKey: ["stats", "overview", qs, groupBy],
    queryFn: () => apiJson<StatsOverviewResponse>(url),
  });

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
  const vsPrev = t("vsPrev");

  const trend = data.revenue_trend.map((r) => ({
    date: r.date,
    label: formatShortDate(r.date, locale),
    revenue: Number.parseFloat(r.revenue),
    bookings: r.bookings_count,
    avg_check: r.bookings_count > 0 ? Number.parseFloat(r.revenue) / r.bookings_count : 0,
  }));
  const trendEmpty = trend.length === 0 || trend.every((d) => d.revenue === 0 && d.bookings === 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MasterFilter />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          href={`/bookings?status=completed&from=${from}&to=${to}`}
          title={t("kpiRevenue")}
          value={fmtMoney(String(kpi.revenue ?? "0"))}
          delta={
            <DeltaBadge
              value={pctDelta(
                Number.parseFloat(String(kpi.revenue ?? "0")),
                Number.parseFloat(String(kpi.prev_revenue ?? "0")),
              )}
              vsLabel={vsPrev}
            />
          }
        />
        <KpiCard
          href={`/bookings?status=completed&from=${from}&to=${to}`}
          title={t("kpiCompleted")}
          value={String(kpi.completed_bookings ?? 0)}
          delta={
            <DeltaBadge
              value={pctDelta(
                Number(kpi.completed_bookings ?? 0),
                Number(kpi.prev_completed_bookings ?? 0),
              )}
              vsLabel={vsPrev}
            />
          }
        />
        <KpiCard
          title={t("kpiAvgCheck")}
          value={fmtMoney(String(kpi.avg_check ?? "0"))}
          delta={
            <DeltaBadge
              value={pctDelta(
                Number.parseFloat(String(kpi.avg_check ?? "0")),
                Number.parseFloat(String(kpi.prev_avg_check ?? "0")),
              )}
              vsLabel={vsPrev}
            />
          }
        />
        <KpiCard
          href={`/clients?from=${from}&to=${to}`}
          title={t("kpiNewClients")}
          value={String(kpi.new_clients_count ?? 0)}
          delta={
            <DeltaBadge
              value={pctDelta(
                Number(kpi.new_clients_count ?? 0),
                Number(kpi.prev_new_clients_count ?? 0),
              )}
              vsLabel={vsPrev}
            />
          }
        />
        <KpiCard
          href={`/bookings?status=cancelled&from=${from}&to=${to}`}
          title={t("kpiCancelled")}
          value={String(kpi.cancelled_bookings_count ?? 0)}
          delta={
            <DeltaBadge
              value={pctDelta(
                Number(kpi.cancelled_bookings_count ?? 0),
                Number(kpi.prev_cancelled_bookings_count ?? 0),
              )}
              vsLabel={vsPrev}
            />
          }
        />
        <KpiCard
          href="/statistics/masters"
          title={t("kpiMasters")}
          value={t("openDetail")}
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>{t("chartRevenue")}</CardTitle>
          <div className="flex gap-1">
            {(["day", "week", "month"] as GroupBy[]).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGroupBy(g)}
                className={cn(
                  "rounded-md px-2 py-1 text-xs transition-colors",
                  groupBy === g
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/60 text-muted-foreground hover:bg-muted",
                )}
              >
                {t(
                  (g === "day"
                    ? "groupByDay"
                    : g === "week"
                      ? "groupByWeek"
                      : "groupByMonth") as Parameters<typeof t>[0],
                )}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="h-80">
          {trendEmpty ? (
            <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {t("empty")}
            </p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trend}>
                <defs>
                  <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={PRIMARY} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={PRIMARY} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) =>
                    new Intl.NumberFormat(locale, {
                      style: "currency",
                      currency,
                      maximumFractionDigits: 0,
                    }).format(Number(v))
                  }
                />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(value: unknown, name: unknown) => {
                    const key = String(name);
                    if (key === "revenue")
                      return [fmtMoney(String(value)), t("kpiRevenue")];
                    if (key === "bookings")
                      return [String(value), t("tooltipBookings")];
                    if (key === "avg_check")
                      return [fmtMoney(String(value)), t("tooltipAvgCheck")];
                    return [String(value), key];
                  }}
                  labelFormatter={(l) => String(l)}
                />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="revenue"
                  stroke={PRIMARY}
                  strokeWidth={2}
                  fill="url(#revFill)"
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="bookings"
                  stroke={SECONDARY_MUTED}
                  strokeWidth={2}
                  dot={false}
                />
                <Legend />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <TopServicesBlock
          data={{
            revenue: data.top_services_revenue,
            popularity: data.top_services_popularity,
          }}
          currency={currency}
          locale={locale}
        />
        <FunnelBlock steps={data.funnel} />
        <PeakHoursBlock peakHours={data.peak_hours} />
        <SourcesBlock sources={data.sources} />
      </div>

      <HeatmapBlock heatmap={data.heatmap} locale={locale} />
    </div>
  );
}
