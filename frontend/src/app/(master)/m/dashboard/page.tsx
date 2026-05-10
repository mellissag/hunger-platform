"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
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

function statusLabel(s: string) {
  const map: Record<string, string> = {
    confirmed: "Подтверждена",
    pending: "Ожидает",
    completed: "Завершена",
    cancelled_by_client: "Отменена клиентом",
    cancelled_by_salon: "Отменена салоном",
  };
  return map[s] ?? s;
}

function formatTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function BookingRow({ b }: { b: BookingBrief }) {
  const color = STATUS_COLORS[b.status] ?? "#94a3b8";
  return (
    <div className="flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm">
      <div className="w-14 shrink-0 font-mono text-xs font-semibold text-muted-foreground">
        {formatTime(b.starts_at)}
      </div>
      <div
        className="h-8 w-1 shrink-0 rounded-full"
        style={{ background: color }}
      />
      <div className="min-w-0 flex-1">
        <p className="font-medium truncate">{b.client_name ?? "—"}</p>
        <p className="text-xs text-muted-foreground truncate">{b.service_name ?? "—"}</p>
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
  const t = useTranslations("layout");

  const { data, isLoading } = useQuery({
    queryKey: ["master-dashboard"],
    queryFn: () => apiJson<DashboardData>("/master/dashboard"),
    staleTime: 60_000,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("nav.masterDashboard")}</h1>

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Записей сегодня</p>
          <p className="mt-1 text-2xl font-bold">{isLoading ? "…" : (data?.today_bookings.length ?? 0)}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Ожидают подтверждения</p>
          <p className="mt-1 text-2xl font-bold text-amber-500">{isLoading ? "…" : (data?.pending_count ?? 0)}</p>
        </div>
        <div className="rounded-xl border bg-card p-4 col-span-2 sm:col-span-1">
          <p className="text-xs text-muted-foreground">Выручка сегодня</p>
          <p className="mt-1 text-2xl font-bold text-green-600">
            {isLoading ? "…" : `${(data?.today_revenue ?? 0).toLocaleString("ru-RU")} ₴`}
          </p>
        </div>
      </div>

      {/* Today's bookings */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Сегодня
        </h2>
        {isLoading && <p className="text-sm text-muted-foreground">Загрузка…</p>}
        {!isLoading && (data?.today_bookings.length ?? 0) === 0 && (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Записей на сегодня нет
          </p>
        )}
        <div className="space-y-2">
          {data?.today_bookings.map((b) => <BookingRow key={b.id} b={b} />)}
        </div>
      </div>

      {/* Upcoming */}
      {(data?.upcoming_bookings.length ?? 0) > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Ближайшие записи
          </h2>
          <div className="space-y-2">
            {data?.upcoming_bookings.map((b) => <BookingRow key={b.id} b={b} />)}
          </div>
        </div>
      )}
    </div>
  );
}
