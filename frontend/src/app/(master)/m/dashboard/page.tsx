"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
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
  upcoming_bookings: BookingBrief[];
  today_revenue: number;
  total_clients: number;
  pending_count: number;
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
      <div
        className="h-8 w-1 shrink-0 rounded-full"
        style={{ background: color }}
      />
      <div className="min-w-0 flex-1">
        <p className="font-medium truncate">{b.client_name ?? emptyClient}</p>
        <p className="text-xs text-muted-foreground truncate">{b.service_name ?? emptyService}</p>
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

  const { data, isLoading } = useQuery({
    queryKey: ["master-dashboard"],
    queryFn: () => apiJson<DashboardData>("/master/dashboard"),
    staleTime: 60_000,
  });

  const statusLabel = (s: string) => {
    const key = STATUS_I18N_KEYS[s];
    return key ? t(key as never) : s;
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">{t("kpiBookingsToday")}</p>
          <p className="mt-1 text-2xl font-bold">{isLoading ? "…" : (data?.today_bookings.length ?? 0)}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">{t("kpiPending")}</p>
          <p className="mt-1 text-2xl font-bold text-amber-500">{isLoading ? "…" : (data?.pending_count ?? 0)}</p>
        </div>
        <div className="rounded-xl border bg-card p-4 col-span-2 sm:col-span-1">
          <p className="text-xs text-muted-foreground">{t("kpiRevenueToday")}</p>
          <p className="mt-1 text-2xl font-bold text-green-600">
            {isLoading
              ? "…"
              : `${(data?.today_revenue ?? 0).toLocaleString(localeForBcp47(locale))} ₴`}
          </p>
        </div>
      </div>

      {/* Today's bookings */}
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

      {/* Upcoming */}
      {(data?.upcoming_bookings.length ?? 0) > 0 && (
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
      )}
    </div>
  );
}
