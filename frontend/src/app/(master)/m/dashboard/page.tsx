"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";

import { usePermissions } from "@/hooks/usePermissions";
import { apiJson } from "@/lib/api";

type BookingBrief = {
  id: string;
  client_name: string | null;
  service_name: string | null;
  starts_at: string | null;
  ends_at: string | null;
  status: string;
  price: number;
};

type DashboardData = {
  today_bookings: BookingBrief[];
  today_bookings_count?: number;
  upcoming_bookings: BookingBrief[];
  today_revenue: number;
  total_clients: number;
  pending_count: number;
  flags?: {
    show_kpi_bookings_today: boolean;
    show_kpi_pending: boolean;
    show_kpi_revenue_today: boolean;
    show_kpi_total_clients: boolean;
    show_section_today: boolean;
    show_section_upcoming: boolean;
  };
};

const STATUS_COLORS: Record<string, string> = {
  confirmed: "#22c55e",
  pending: "#f59e0b",
  completed: "#6366f1",
  cancelled_by_client: "#ef4444",
  cancelled_by_salon: "#ef4444",
};

const STATUS_I18N_KEYS: Record<string, string> = {
  confirmed: "statusConfirmed",
  pending: "statusPending",
  completed: "statusCompleted",
  cancelled_by_client: "statusCancelledByClient",
  cancelled_by_salon: "statusCancelledBySalon",
};

function localeForBcp47(locale: string): string {
  switch (locale) {
    case "ru":
      return "ru-RU";
    case "uk":
      return "uk-UA";
    case "bg":
      return "bg-BG";
    default:
      return "en-US";
  }
}

function formatTime(iso: string | null, locale: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString(localeForBcp47(locale), {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function BookingRow({
  b,
  locale,
  statusLabel,
  emptyClient,
  emptyService,
}: {
  b: BookingBrief;
  locale: string;
  statusLabel: (s: string) => string;
  emptyClient: string;
  emptyService: string;
}) {
  const color = STATUS_COLORS[b.status] ?? "#94a3b8";
  return (
    <div className="flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm">
      <div className="w-14 shrink-0 font-mono text-xs font-semibold text-muted-foreground">
        {formatTime(b.starts_at, locale)}
      </div>
      <div className="h-8 w-1 shrink-0 rounded-full" style={{ background: color }} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{b.client_name ?? emptyClient}</p>
        <p className="truncate text-xs text-muted-foreground">{b.service_name ?? emptyService}</p>
      </div>
      <span
        className="shrink-0 rounded px-2 py-0.5 text-[11px] font-medium"
        style={{ background: `${color}20`, color }}
      >
        {statusLabel(b.status)}
      </span>
    </div>
  );
}

export default function MasterDashboardPage() {
  const t = useTranslations("pages.masterDashboard");
  const locale = useLocale();
  const router = useRouter();
  const { me, permUser } = usePermissions();

  const dash = useMemo(() => permUser?.page_permissions?.master_dashboard, [permUser?.page_permissions]);

  const dashboardEnabled = Boolean(dash?.enabled);

  useEffect(() => {
    if (!me || me.role !== "master") return;
    if (!dashboardEnabled) {
      router.replace("/bookings");
    }
  }, [me, dashboardEnabled, router]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["master-dashboard", me?.id],
    queryFn: () => apiJson<DashboardData>("/master/dashboard"),
    staleTime: 60_000,
    enabled: Boolean(me?.role === "master" && dashboardEnabled),
  });

  const flags = data?.flags;
  const showKpiToday =
    dashboardEnabled && (flags?.show_kpi_bookings_today ?? dash?.show_kpi_bookings_today ?? true);
  const showKpiPending =
    dashboardEnabled && (flags?.show_kpi_pending ?? dash?.show_kpi_pending ?? true);
  const showKpiRevenue =
    dashboardEnabled && (flags?.show_kpi_revenue_today ?? dash?.show_kpi_revenue_today ?? true);
  const showKpiClients =
    dashboardEnabled && (flags?.show_kpi_total_clients ?? dash?.show_kpi_total_clients ?? true);
  const showSectionToday =
    dashboardEnabled && (flags?.show_section_today ?? dash?.show_section_today ?? true);
  const showSectionUpcoming =
    dashboardEnabled && (flags?.show_section_upcoming ?? dash?.show_section_upcoming ?? true);

  const todayCount = data?.today_bookings_count ?? data?.today_bookings?.length ?? 0;

  const statusLabel = (s: string) => {
    const key = STATUS_I18N_KEYS[s];
    return key ? t(key as never) : s;
  };

  if (!dashboardEnabled) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">{t("accessDenied")}</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-destructive">{t("loadError")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {showKpiToday ? (
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">{t("kpiBookingsToday")}</p>
            <p className="mt-1 text-2xl font-bold">{isLoading ? "…" : (todayCount ?? 0)}</p>
          </div>
        ) : null}
        {showKpiPending ? (
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">{t("kpiPending")}</p>
            <p className="mt-1 text-2xl font-bold text-amber-500">{isLoading ? "…" : (data?.pending_count ?? 0)}</p>
          </div>
        ) : null}
        {showKpiRevenue ? (
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">{t("kpiRevenueToday")}</p>
            <p className="mt-1 text-2xl font-bold text-green-600">
              {isLoading
                ? "…"
                : `${(data?.today_revenue ?? 0).toLocaleString(localeForBcp47(locale))} ₴`}
            </p>
          </div>
        ) : null}
        {showKpiClients ? (
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">{t("kpiTotalClients")}</p>
            <p className="mt-1 text-2xl font-bold">{isLoading ? "…" : (data?.total_clients ?? 0)}</p>
          </div>
        ) : null}
      </div>

      {showSectionToday ? (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t("sectionToday")}
          </h2>
          {isLoading && <p className="text-sm text-muted-foreground">{t("loading")}</p>}
          {!isLoading && (data?.today_bookings.length ?? 0) === 0 && (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              {t("emptyToday")}
            </p>
          )}
          <div className="space-y-2">
            {data?.today_bookings.map((b) => (
              <BookingRow
                key={b.id}
                b={b}
                locale={locale}
                statusLabel={statusLabel}
                emptyClient={t("noClient")}
                emptyService={t("noService")}
              />
            ))}
          </div>
        </div>
      ) : null}

      {showSectionUpcoming && (data?.upcoming_bookings.length ?? 0) > 0 ? (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t("sectionUpcoming")}
          </h2>
          <div className="space-y-2">
            {data?.upcoming_bookings.map((b) => (
              <BookingRow
                key={b.id}
                b={b}
                locale={locale}
                statusLabel={statusLabel}
                emptyClient={t("noClient")}
                emptyService={t("noService")}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
