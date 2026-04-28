"use client";

import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  BarChart2,
  Calendar,
  CalendarDays,
  CheckCircle2,
  Info,
  Plus,
  Send,
  Sparkles,
  Star,
  TrendingUp,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
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

import { AdminEmptyState } from "@/components/admin/empty-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiJson } from "@/lib/api";
import { utcAddDays, utcStartOfDay, toIsoParam } from "@/lib/date-utc";
import type {
  BroadcastOut,
  CalendarBooking,
  CalendarResponse,
  ClientOut,
  MasterOut,
  Paginated,
  ServiceOut,
  StatsBotResponse,
  UserMe,
} from "@/types/admin-api";

const CHART_COLORS = ["#9A7230", "#C9A96E", "#B8A888", "#C8BFA8", "#E4DDD0"];

const STATUS_STYLES: Record<string, string> = {
  confirmed:
    "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800",
  pending:
    "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800",
  cancelled_by_client:
    "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800",
  cancelled_by_salon:
    "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800",
  no_show:
    "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800",
  completed:
    "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800",
};

function sameUtcDay(iso: string, day: Date): boolean {
  const d = new Date(iso);
  return (
    d.getUTCFullYear() === day.getUTCFullYear() &&
    d.getUTCMonth() === day.getUTCMonth() &&
    d.getUTCDate() === day.getUTCDate()
  );
}

function formatMoney(n: number, locale: string, currency = "EUR"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(n);
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function ClientAvatar({ name }: { name: string }) {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/50 text-xs font-semibold text-primary-foreground">
      {getInitials(name) || "?"}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const label = status.replace(/_/g, " ").replace(/by .*/i, "").trim();
  return (
    <span
      className={`inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${STATUS_STYLES[status] ?? "bg-muted text-muted-foreground border-border"}`}
    >
      {label}
    </span>
  );
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

  const today = useMemo(() => {
    const d = new Date();
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }, []);

  const { data: broadcastsPage } = useQuery({
    queryKey: ["broadcasts", "dash"],
    queryFn: () => apiJson<Paginated<BroadcastOut>>("/broadcasts?page=1&page_size=100"),
  });

  const { data: botStatsData, dataUpdatedAt: botStatsUpdatedAt } = useQuery({
    queryKey: ["stats", "bot", "dash", today],
    queryFn: () => apiJson<StatsBotResponse>(`/stats/bot?from=${today}&to=${today}`),
  });

  const kpis = useMemo(() => {
    const bookings = cal30?.bookings ?? [];
    const today = utcStartOfDay(now);
    const yesterday = utcAddDays(today, -1);
    const monthAgo = utcAddDays(today, -29);
    const weekAgo = utcAddDays(today, -7);

    const active = (b: CalendarBooking) => b.status === "pending" || b.status === "confirmed";

    const todayB = bookings.filter((b) => active(b) && sameUtcDay(b.starts_at, today));
    const yestB = bookings.filter((b) => active(b) && sameUtcDay(b.starts_at, yesterday));

    const revMonth = bookings
      .filter((b) => active(b) && new Date(b.starts_at) >= monthAgo)
      .reduce((s, b) => s + Number.parseFloat(b.price || "0"), 0);
    const revPrevMonth = bookings
      .filter(
        (b) =>
          active(b) &&
          new Date(b.starts_at) >= utcAddDays(monthAgo, -29) &&
          new Date(b.starts_at) < monthAgo,
      )
      .reduce((s, b) => s + Number.parseFloat(b.price || "0"), 0);

    const clients = clientsPage?.items ?? [];
    const newWeek = clients.filter((c) => new Date(c.joined_at) >= weekAgo).length;

    const deltaBookings = todayB.length - yestB.length;
    const deltaRevPct =
      revPrevMonth > 0
        ? Math.round(((revMonth - revPrevMonth) / revPrevMonth) * 100)
        : revMonth > 0
          ? 100
          : 0;

    // Simple retention: clients with >1 booking in last 30 days
    const clientBookingCount: Record<string, number> = {};
    for (const b of bookings) {
      if (!active(b)) continue;
      clientBookingCount[b.client_id] = (clientBookingCount[b.client_id] ?? 0) + 1;
    }
    const retained = Object.values(clientBookingCount).filter((c) => c > 1).length;
    const totalBooked = Object.keys(clientBookingCount).length;
    const retention = totalBooked > 0 ? Math.round((retained / totalBooked) * 100) : 0;

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
        ? (masters.find((m) => m.id === topMasterId)?.display_name ?? null)
        : null;

    return {
      todayCount: todayB.length,
      deltaBookings,
      revMonth,
      deltaRevPct,
      newWeek,
      retention,
      topMasterName,
      topCount,
    };
  }, [cal30?.bookings, clientsPage?.items, mastersPage?.items, now]);

  const pendingBroadcastCount = useMemo(
    () =>
      (broadcastsPage?.items ?? []).filter(
        (b) => b.status === "draft" || b.status === "scheduled",
      ).length,
    [broadcastsPage?.items],
  );

  const todayBotBookings = useMemo(() => {
    const stats = botStatsData?.stats as Record<string, number> | undefined;
    return stats?.bookings_started ?? 0;
  }, [botStatsData]);

  const botSyncTime = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(
        botStatsUpdatedAt ? new Date(botStatsUpdatedAt) : new Date(),
      ),
    [botStatsUpdatedAt, locale],
  );

  const lineData = useMemo(() => {
    const bookings = cal30?.bookings ?? [];
    const active = (b: CalendarBooking) => b.status === "pending" || b.status === "confirmed";
    const map: Record<string, { revenue: number; bookings: number }> = {};
    for (let i = 29; i >= 0; i -= 1) {
      const day = utcAddDays(utcStartOfDay(now), -i);
      const key = `${day.getUTCFullYear()}-${String(day.getUTCMonth() + 1).padStart(2, "0")}-${String(day.getUTCDate()).padStart(2, "0")}`;
      map[key] = { revenue: 0, bookings: 0 };
    }
    for (const b of bookings) {
      if (!active(b)) continue;
      const d = new Date(b.starts_at);
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
      if (key in map && map[key]) {
        map[key]!.revenue += Number.parseFloat(b.price || "0");
        map[key]!.bookings += 1;
      }
    }
    return Object.entries(map).map(([day, v]) => ({
      day: day.slice(5),
      ...v,
    }));
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
    return Object.entries(bySvc)
      .map(([id, value]) => {
        const name =
          services.find((s) => s.id === id)?.name_i18n[locale] ??
          services.find((s) => s.id === id)?.name_i18n.en ??
          id.slice(0, 8);
        return { name, value };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [cal30?.bookings, locale, servicesPage?.items]);

  const todayBookings = useMemo(() => {
    const bookings = cal30?.bookings ?? [];
    const clients = clientsPage?.items ?? [];
    const masters = mastersPage?.items ?? [];
    const services = servicesPage?.items ?? [];
    const today = utcStartOfDay(now);
    return bookings
      .filter((b) => sameUtcDay(b.starts_at, today))
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
      .slice(0, 8)
      .map((b) => {
        const client = clients.find((c) => c.id === b.client_id);
        const cn = [client?.first_name, client?.last_name].filter(Boolean).join(" ") || "—";
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
    const clients = clientsPage?.items ?? [];
    return [...bookings]
      .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())
      .slice(0, 6)
      .map((b) => {
        const client = clients.find((c) => c.id === b.client_id);
        const cn = [client?.first_name, client?.last_name].filter(Boolean).join(" ") || "—";
        return { ...b, cn };
      });
  }, [cal30?.bookings, clientsPage?.items]);

  const salonName = me?.email?.split("@")[1]?.split(".")[0] ?? "Salon";
  const displayName = [me?.first_name, me?.last_name].filter(Boolean).join(" ") || me?.email || "";

  if (meLoading || calLoading) {
    return <DashboardSkeleton />;
  }

  const dayLabel = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(now);

  return (
    <div className="space-y-6">
      {/* ── Page header ── */}
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-6">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            · {t("title")} ·
          </p>
          <h1 className="mt-1 text-3xl font-medium tracking-tight">
            {t("greeting", { name: "" })}{" "}
            <span className="italic text-primary">{displayName || salonName}</span>
          </h1>
          <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            — ✦ —
          </p>
          <p className="text-xs text-muted-foreground">{dayLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/bookings"
            className="inline-flex items-center gap-2 rounded border border-border px-4 py-2 text-xs font-medium uppercase tracking-wider transition-colors hover:border-primary hover:text-primary"
          >
            <BarChart2 className="h-3.5 w-3.5" />
            {t("exportReport")}
          </Link>
          <Link
            href="/bookings/new"
            className="inline-flex items-center gap-2 rounded bg-primary px-4 py-2 text-xs font-medium uppercase tracking-wider text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus className="h-3.5 w-3.5" />
            {t("newBooking")}
          </Link>
        </div>
      </div>

      {/* ── Alerts ── */}
      <div className="space-y-2">
        {pendingBroadcastCount > 0 && (
          <div className="flex items-start gap-3 rounded border border-amber-200/60 bg-amber-50/60 px-4 py-3 dark:border-amber-900/40 dark:bg-amber-950/20">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-300">
              <strong className="font-semibold text-foreground">
                {t("alertBroadcastTitle", { count: pendingBroadcastCount })}
              </strong>{" "}
              {t("alertBroadcastBody")}
            </p>
          </div>
        )}
        <div className="flex items-start gap-3 rounded border border-primary/20 bg-primary/5 px-4 py-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t("alertBotStatus", { bookings: todayBotBookings, syncTime: botSyncTime })}
          </p>
        </div>
      </div>

      {/* ── KPI grid ── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          testId="dashboard-kpi-today-bookings"
          icon={Calendar}
          label={t("kpiBookingsToday")}
          value={String(kpis.todayCount)}
          trend={
            kpis.deltaBookings >= 0
              ? `↗ +${kpis.deltaBookings} ${t("kpiVsYesterday")}`
              : `↘ ${kpis.deltaBookings} ${t("kpiVsYesterday")}`
          }
          trendUp={kpis.deltaBookings >= 0}
        />
        <KpiCard
          testId="dashboard-kpi-revenue-month"
          icon={TrendingUp}
          label={t("kpiRevenueMonth")}
          value={formatMoney(kpis.revMonth, locale)}
          trend={
            kpis.deltaRevPct >= 0
              ? `↗ +${kpis.deltaRevPct}% ${t("kpiVsPrev")}`
              : `↘ ${kpis.deltaRevPct}% ${t("kpiVsPrev")}`
          }
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
          testId="dashboard-kpi-retention"
          icon={Star}
          label={t("kpiRetention")}
          value={`${kpis.retention}%`}
          trend={t("kpiRetentionDesc")}
          neutral
        />
      </div>

      {/* ── Chart + Pie ── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>{t("chartRevenueTitle")}</CardTitle>
              <CardDescription>{t("chartRevenueDesc")}</CardDescription>
            </div>
            <Link
              href="/statistics"
              className="text-[11px] uppercase tracking-wider text-primary hover:underline"
            >
              {t("fullStats")} →
            </Link>
          </CardHeader>
          <CardContent className="h-[220px]">
            {lineData.every((d) => d.revenue === 0 && d.bookings === 0) ? (
              <AdminEmptyState title={t("emptyChart")} description={t("emptyChartDesc")} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={lineData}>
                  <CartesianGrid strokeDasharray="2 4" className="stroke-border" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} tickLine={false} />
                  <YAxis allowDecimals={false} width={36} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    name={t("legendRevenue")}
                    stroke="#9A7230"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: "#9A7230" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="bookings"
                    name={t("legendBookings")}
                    stroke="#C9A96E"
                    strokeWidth={1.5}
                    dot={false}
                    activeDot={{ r: 3, fill: "#C9A96E" }}
                  />
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
          <CardContent className="h-[220px]">
            {pieData.length === 0 ? (
              <AdminEmptyState title={t("emptyPie")} description={t("emptyPieDesc")} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={44}
                    outerRadius={72}
                  >
                    {pieData.map((row, i) => (
                      <Cell key={`${row.name}-${i}`} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Today's bookings + Right column ── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>{t("upcomingTitle")}</CardTitle>
              <CardDescription>
                {new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(now)} ·{" "}
                {todayBookings.length} {t("bookingsCount")}
              </CardDescription>
            </div>
            <Link
              href="/bookings"
              className="text-[11px] uppercase tracking-wider text-primary hover:underline"
            >
              {t("allBookings")} →
            </Link>
          </CardHeader>
          <CardContent>
            {todayBookings.length === 0 ? (
              <AdminEmptyState title={t("emptyUpcoming")} description={t("emptyUpcomingDesc")} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left">
                      <th className="px-3 pb-2 pt-2 text-[10px] font-semibold uppercase tracking-wider text-primary">
                        {t("colWhen")}
                      </th>
                      <th className="px-3 pb-2 pt-2 text-[10px] font-semibold uppercase tracking-wider text-primary">
                        {t("colClient")}
                      </th>
                      <th className="px-3 pb-2 pt-2 text-[10px] font-semibold uppercase tracking-wider text-primary">
                        {t("colService")}
                      </th>
                      <th className="px-3 pb-2 pt-2 text-[10px] font-semibold uppercase tracking-wider text-primary">
                        {t("colMaster")}
                      </th>
                      <th className="px-3 pb-2 pt-2 text-[10px] font-semibold uppercase tracking-wider text-primary">
                        {t("colStatus")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {todayBookings.map((r) => (
                      <tr
                        key={r.id}
                        className="border-b border-dashed border-border/60 transition-colors last:border-0 hover:bg-muted/40"
                      >
                        <td className="px-3 py-3 font-medium tabular-nums text-primary">
                          {new Intl.DateTimeFormat(locale, {
                            timeStyle: "short",
                          }).format(new Date(r.starts_at))}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <ClientAvatar name={r.cn} />
                            <span>{r.cn}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-muted-foreground">{r.sn}</td>
                        <td className="px-3 py-3 text-muted-foreground">{r.mn}</td>
                        <td className="px-3 py-3">
                          <StatusPill status={r.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right column */}
        <div className="flex flex-col gap-4">
          {/* Quick actions */}
          <Card>
            <CardHeader>
              <CardTitle>{t("quickActionsTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2">
                {[
                  {
                    href: "/bookings/new",
                    icon: Plus,
                    label: t("qaNewBooking"),
                    sub: t("qaNewBookingSub"),
                  },
                  {
                    href: "/clients/new",
                    icon: UserPlus,
                    label: t("qaAddClient"),
                    sub: t("qaAddClientSub"),
                  },
                  {
                    href: "/broadcasts",
                    icon: Send,
                    label: t("qaBroadcast"),
                    sub: t("qaBroadcastSub"),
                  },
                  {
                    href: "/statistics",
                    icon: BarChart2,
                    label: t("qaReport"),
                    sub: t("qaReportSub"),
                  },
                ].map(({ href, icon: Icon, label, sub }) => (
                  <Link
                    key={href}
                    href={href}
                    className="flex flex-col gap-1.5 rounded border border-border bg-muted/40 p-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
                  >
                    <Icon className="h-4 w-4 text-primary" />
                    <span className="text-xs font-medium leading-tight">{label}</span>
                    <span className="text-[10px] text-muted-foreground">{sub}</span>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Activity feed */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>{t("activityTitle")}</CardTitle>
                <CardDescription>{t("activityDesc")}</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-0">
              {activity.length === 0 ? (
                <AdminEmptyState title={t("emptyActivity")} description={t("emptyActivityDesc")} />
              ) : (
                activity.map((b) => <FeedItem key={b.id} booking={b} locale={locale} t={t} />)
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Bottom insights ── */}
      {kpis.topMasterName && (
        <Card>
          <CardHeader>
            <CardTitle>{t("footerTopMaster")}</CardTitle>
            <CardDescription>{t("footerTopMasterDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            <p>
              <span className="font-medium text-primary">{kpis.topMasterName}</span> —{" "}
              {t("footerBookingsCount", { count: kpis.topCount })}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ── Sub-components ── */

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
    <Card data-testid={testId} className="kpi-card-premium">
      <CardHeader className="pb-2">
        <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-full border border-primary/20 bg-primary/8">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <CardDescription className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
          {label}
        </CardDescription>
        <CardTitle className="kpi-value-premium text-3xl font-medium tabular-nums">
          {value}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className={`text-xs font-medium ${trendClass}`}>{trend}</p>
      </CardContent>
    </Card>
  );
}

function FeedItem({
  booking,
  locale,
  t,
}: {
  booking: CalendarBooking & { cn: string };
  locale: string;
  t: ReturnType<typeof useTranslations<"pages.dashboard">>;
}) {
  const isConfirmed = booking.status === "confirmed" || booking.status === "completed";
  const isCancelled =
    booking.status === "cancelled_by_client" ||
    booking.status === "cancelled_by_salon" ||
    booking.status === "no_show";

  const iconClass = isCancelled
    ? "bg-red-50 border-red-200 text-red-600 dark:bg-red-950/30 dark:border-red-900 dark:text-red-400"
    : isConfirmed
      ? "bg-emerald-50 border-emerald-200 text-emerald-600 dark:bg-emerald-950/30 dark:border-emerald-900 dark:text-emerald-400"
      : "bg-primary/8 border-primary/20 text-primary";

  const FeedIcon = isCancelled ? X : isConfirmed ? CheckCircle2 : Sparkles;

  return (
    <div className="flex gap-3 border-b border-dashed border-border/60 py-3 last:border-0">
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${iconClass}`}
      >
        <FeedIcon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs leading-snug">
          <span className="font-medium text-primary">{booking.cn}</span>{" "}
          {t("activityBooking", {
            time: new Intl.DateTimeFormat(locale, {
              timeStyle: "short",
            }).format(new Date(booking.starts_at)),
          })}
        </p>
        <p className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          {booking.status.replace(/_/g, " ")}
        </p>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-20 w-72" />
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-[280px] lg:col-span-2" />
        <Skeleton className="h-[280px]" />
      </div>
    </div>
  );
}
