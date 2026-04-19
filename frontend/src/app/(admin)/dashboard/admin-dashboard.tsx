"use client";

import { useQuery } from "@tanstack/react-query";
import { Calendar, Sparkles, TrendingUp, Users } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";
import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiJson } from "@/lib/api";
import { utcAddDays, utcStartOfDay, toIsoParam } from "@/lib/date-utc";
import type {
  CalendarBooking,
  CalendarResponse,
  ClientOut,
  MasterOut,
  Paginated,
  ServiceOut,
  UserMe,
} from "@/types/admin-api";

import { AdminEmptyState } from "@/components/admin/empty-state";

const CHART_COLORS = ["#D97757", "#E89A7D", "#C7B8A1", "#8B7355", "#ECE4DF"];

function sameUtcDay(iso: string, day: Date): boolean {
  const d = new Date(iso);
  return (
    d.getUTCFullYear() === day.getUTCFullYear() &&
    d.getUTCMonth() === day.getUTCMonth() &&
    d.getUTCDate() === day.getUTCDate()
  );
}

function formatMoney(n: number, locale: string, currency = "EUR"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
}

export function AdminDashboard() {
  const t = useTranslations("pages.dashboard");
  const locale = useLocale();
  const now = useMemo(() => new Date(), []);

  const range30 = useMemo(() => {
    const from = utcStartOfDay(utcAddDays(now, -29));
    const to = utcAddDays(utcStartOfDay(now), 1);
    return { from, to };
  }, [now]);

  const { data: me, isLoading: meLoading } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => apiJson<UserMe>("/auth/me"),
  });

  const { data: cal30, isLoading: calLoading } = useQuery({
    queryKey: ["schedule", "calendar", range30.from.toISOString(), range30.to.toISOString()],
    queryFn: () =>
      apiJson<CalendarResponse>(
        `/schedule/calendar?from=${encodeURIComponent(toIsoParam(range30.from))}&to=${encodeURIComponent(toIsoParam(range30.to))}`,
      ),
  });

  const { data: clientsPage } = useQuery({
    queryKey: ["clients", "dash"],
    queryFn: () => apiJson<Paginated<ClientOut>>("/clients?page=1&page_size=100"),
  });

  const { data: mastersPage } = useQuery({
    queryKey: ["masters", "dash"],
    queryFn: () => apiJson<Paginated<MasterOut>>("/masters?page=1&page_size=100"),
  });

  const { data: servicesPage } = useQuery({
    queryKey: ["services", "dash"],
    queryFn: () => apiJson<Paginated<ServiceOut>>("/services?page=1&page_size=200"),
  });

  const kpis = useMemo(() => {
    const bookings = cal30?.bookings ?? [];
    const today = utcStartOfDay(now);
    const yesterday = utcAddDays(today, -1);
    const weekAgo = utcAddDays(today, -7);

    const active = (b: CalendarBooking) => b.status === "pending" || b.status === "confirmed";

    const todayB = bookings.filter((b) => active(b) && sameUtcDay(b.starts_at, today));
    const yestB = bookings.filter((b) => active(b) && sameUtcDay(b.starts_at, yesterday));

    const revToday = todayB.reduce((s, b) => s + Number.parseFloat(b.price || "0"), 0);
    const revYest = yestB.reduce((s, b) => s + Number.parseFloat(b.price || "0"), 0);

    const clients = clientsPage?.items ?? [];
    const newWeek = clients.filter((c) => new Date(c.joined_at) >= weekAgo).length;

    const deltaBookings = todayB.length - yestB.length;
    const deltaRevPct =
      revYest > 0 ? Math.round(((revToday - revYest) / revYest) * 100) : revToday > 0 ? 100 : 0;

    const byMaster: Record<string, number> = {};
    for (const b of bookings) {
      if (!active(b)) continue;
      byMaster[b.master_id] = (byMaster[b.master_id] ?? 0) + 1;
    }
    let topMasterId: string | null = null;
    let topCount = 0;
    for (const [mid, c] of Object.entries(byMaster)) {
      if (c > topCount) {
        topCount = c;
        topMasterId = mid;
      }
    }
    const masters = mastersPage?.items ?? [];
    const topMasterName =
      topMasterId && masters.length
        ? masters.find((m) => m.id === topMasterId)?.display_name ?? null
        : null;

    return {
      todayCount: todayB.length,
      deltaBookings,
      revToday,
      deltaRevPct,
      newWeek,
      topMasterName,
      topCount,
    };
  }, [cal30?.bookings, clientsPage?.items, mastersPage?.items, now]);

  const lineData = useMemo(() => {
    const bookings = cal30?.bookings ?? [];
    const active = (b: CalendarBooking) => b.status === "pending" || b.status === "confirmed";
    const map: Record<string, number> = {};
    for (let i = 29; i >= 0; i -= 1) {
      const day = utcAddDays(utcStartOfDay(now), -i);
      const key = `${day.getUTCFullYear()}-${String(day.getUTCMonth() + 1).padStart(2, "0")}-${String(day.getUTCDate()).padStart(2, "0")}`;
      map[key] = 0;
    }
    for (const b of bookings) {
      if (!active(b)) continue;
      const d = new Date(b.starts_at);
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
      if (key in map) map[key] = (map[key] ?? 0) + 1;
    }
    return Object.entries(map).map(([day, count]) => ({ day, count }));
  }, [cal30?.bookings, now]);

  const pieData = useMemo(() => {
    const bookings = cal30?.bookings ?? [];
    const services = servicesPage?.items ?? [];
    const active = (b: CalendarBooking) => b.status === "pending" || b.status === "confirmed";
    const bySvc: Record<string, number> = {};
    for (const b of bookings) {
      if (!active(b)) continue;
      bySvc[b.service_id] = (bySvc[b.service_id] ?? 0) + 1;
    }
    return Object.entries(bySvc).map(([id, value]) => {
      const name =
        services.find((s) => s.id === id)?.name_i18n[locale] ??
        services.find((s) => s.id === id)?.name_i18n.en ??
        id.slice(0, 8);
      return { name, value };
    });
  }, [cal30?.bookings, locale, servicesPage?.items]);

  const upcoming = useMemo(() => {
    const bookings = cal30?.bookings ?? [];
    const clients = clientsPage?.items ?? [];
    const masters = mastersPage?.items ?? [];
    const services = servicesPage?.items ?? [];
    const active = (b: CalendarBooking) => b.status === "pending" || b.status === "confirmed";
    const list = bookings
      .filter((b) => active(b) && new Date(b.starts_at) >= now)
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
      .slice(0, 10);
    return list.map((b) => {
      const cn =
        [clients.find((c) => c.id === b.client_id)?.first_name, clients.find((c) => c.id === b.client_id)?.last_name]
          .filter(Boolean)
          .join(" ") || "—";
      const mn = masters.find((m) => m.id === b.master_id)?.display_name ?? "—";
      const sn =
        services.find((s) => s.id === b.service_id)?.name_i18n[locale] ??
        services.find((s) => s.id === b.service_id)?.name_i18n.en ??
        "—";
      return { ...b, cn, mn, sn };
    });
  }, [cal30?.bookings, clientsPage?.items, locale, mastersPage?.items, now, servicesPage?.items]);

  const activity = useMemo(() => {
    const bookings = cal30?.bookings ?? [];
    return [...bookings]
      .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())
      .slice(0, 8);
  }, [cal30?.bookings]);

  const displayName = [me?.first_name, me?.last_name].filter(Boolean).join(" ") || me?.email || "";

  if (meLoading || calLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">
            {t("greeting", { name: displayName || "—" })} · {new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(now)}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          testId="dashboard-kpi-today-bookings"
          icon={Calendar}
          label={t("kpiBookingsToday")}
          value={String(kpis.todayCount)}
          trend={kpis.deltaBookings >= 0 ? `+${kpis.deltaBookings}` : String(kpis.deltaBookings)}
          trendUp={kpis.deltaBookings >= 0}
        />
        <KpiCard
          testId="dashboard-kpi-today-revenue"
          icon={TrendingUp}
          label={t("kpiRevenueToday")}
          value={formatMoney(kpis.revToday, locale)}
          trend={kpis.deltaRevPct >= 0 ? `+${kpis.deltaRevPct}%` : `${kpis.deltaRevPct}%`}
          trendUp={kpis.deltaRevPct >= 0}
        />
        <KpiCard
          testId="dashboard-kpi-new-clients"
          icon={Users}
          label={t("kpiNewClientsWeek")}
          value={String(kpis.newWeek)}
          trend={t("kpiWindow7d")}
          neutral
        />
        <KpiCard
          testId="dashboard-kpi-bot-visits"
          icon={Sparkles}
          label={t("kpiBotVisits")}
          value="—"
          trend={t("kpiPlaceholderTrend")}
          neutral
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("chartBookingsTitle")}</CardTitle>
            <CardDescription>{t("chartBookingsDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="h-[260px]">
            {lineData.every((d) => d.count === 0) ? (
              <AdminEmptyState title={t("emptyChart")} description={t("emptyChartDesc")} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={lineData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} width={32} />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("chartServicesTitle")}</CardTitle>
            <CardDescription>{t("chartServicesDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="h-[260px]">
            {pieData.length === 0 ? (
              <AdminEmptyState title={t("emptyPie")} description={t("emptyPieDesc")} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={72} label>
                    {pieData.map((row, i) => (
                      <Cell key={`${row.name}-${i}`} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("upcomingTitle")}</CardTitle>
            <CardDescription>{t("upcomingDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            {upcoming.length === 0 ? (
              <AdminEmptyState title={t("emptyUpcoming")} description={t("emptyUpcomingDesc")} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-3 font-medium">{t("colWhen")}</th>
                      <th className="pb-2 pr-3 font-medium">{t("colClient")}</th>
                      <th className="pb-2 pr-3 font-medium">{t("colMaster")}</th>
                      <th className="pb-2 pr-3 font-medium">{t("colService")}</th>
                      <th className="pb-2 font-medium">{t("colStatus")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {upcoming.map((r) => (
                      <tr key={r.id} className="border-b border-border/60">
                        <td className="py-2 pr-3 whitespace-nowrap">
                          {new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(new Date(r.starts_at))}
                        </td>
                        <td className="py-2 pr-3">{r.cn}</td>
                        <td className="py-2 pr-3">{r.mn}</td>
                        <td className="py-2 pr-3">{r.sn}</td>
                        <td className="py-2">{r.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("activityTitle")}</CardTitle>
            <CardDescription>{t("activityDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {activity.length === 0 ? (
              <AdminEmptyState title={t("emptyActivity")} description={t("emptyActivityDesc")} />
            ) : (
              activity.map((b) => (
                <div key={b.id} className="flex gap-2 border-b border-border/40 pb-2 last:border-0">
                  <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                  <div>
                    <p className="font-medium leading-snug">
                      {t("activityBooking", {
                        time: new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(new Date(b.starts_at)),
                      })}
                    </p>
                    <p className="text-xs text-muted-foreground">{b.status}</p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("footerTopMaster")}</CardTitle>
            <CardDescription>{t("footerTopMasterDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            {kpis.topMasterName ? (
              <p>
                <span className="font-medium">{kpis.topMasterName}</span> — {t("footerBookingsCount", { count: kpis.topCount })}
              </p>
            ) : (
              <p className="text-muted-foreground">{t("footerNoMaster")}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("footerAi")}</CardTitle>
            <CardDescription>{t("footerAiDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">{t("footerAiBody")}</CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  trend,
  trendUp,
  neutral,
  testId,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  trend: string;
  trendUp?: boolean;
  neutral?: boolean;
  testId: string;
}) {
  const trendClass = neutral
    ? "text-muted-foreground"
    : trendUp
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-rose-600 dark:text-rose-400";
  return (
    <Card data-testid={testId}>
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-2 text-xs font-medium">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </CardDescription>
        <CardTitle className="text-3xl font-semibold tabular-nums">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className={`text-xs font-medium ${trendClass}`}>{trend}</p>
      </CardContent>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-64" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-[320px] lg:col-span-2" />
        <Skeleton className="h-[320px]" />
      </div>
    </div>
  );
}
