"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiJson } from "@/lib/api";

type BookingBrief = {
  id: string;
  client_name: string | null;
  client_phone: string | null;
  service_name: string | null;
  starts_at: string | null;
  status: string;
  price: number;
};

type BookingsPage = {
  items: BookingBrief[];
  total: number;
  page: number;
  page_size: number;
};

const STATUSES = [
  { value: "", label: "Все" },
  { value: "pending", label: "Ожидает" },
  { value: "confirmed", label: "Подтверждена" },
  { value: "completed", label: "Завершена" },
  { value: "cancelled_by_client", label: "Отменена клиентом" },
  { value: "cancelled_by_salon", label: "Отменена салоном" },
];

const STATUS_COLORS: Record<string, string> = {
  confirmed: "#22c55e",
  pending: "#f59e0b",
  completed: "#6366f1",
  cancelled_by_client: "#ef4444",
  cancelled_by_salon: "#ef4444",
};

export default function MasterBookingsPage() {
  const t = useTranslations("layout");
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const params = new URLSearchParams({ page: String(page), page_size: "50" });
  if (status) params.set("status", status);
  if (dateFrom) params.set("date_from", dateFrom);
  if (dateTo) params.set("date_to", dateTo);

  const { data, isLoading } = useQuery({
    queryKey: ["master-bookings", status, dateFrom, dateTo, page],
    queryFn: () => apiJson<BookingsPage>(`/master/bookings?${params}`),
    staleTime: 60_000,
  });

  const totalPages = Math.ceil((data?.total ?? 0) / 50);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">{t("nav.masterBookings")}</h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <Label className="text-xs mb-1">Статус</Label>
          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            className="flex h-9 rounded-md border bg-background px-2 text-sm"
          >
            {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <Label className="text-xs mb-1">С даты</Label>
          <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className="h-9 w-36" />
        </div>
        <div>
          <Label className="text-xs mb-1">По дату</Label>
          <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className="h-9 w-36" />
        </div>
        {(status || dateFrom || dateTo) && (
          <Button variant="ghost" size="sm" onClick={() => { setStatus(""); setDateFrom(""); setDateTo(""); setPage(1); }}>
            Сбросить
          </Button>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2.5">Дата и время</th>
              <th className="px-3 py-2.5">Клиент</th>
              <th className="px-3 py-2.5">Услуга</th>
              <th className="px-3 py-2.5">Цена</th>
              <th className="px-3 py-2.5">Статус</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                  Загрузка…
                </td>
              </tr>
            )}
            {!isLoading && (data?.items.length ?? 0) === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                  Записей не найдено
                </td>
              </tr>
            )}
            {data?.items.map((b) => {
              const color = STATUS_COLORS[b.status] ?? "#94a3b8";
              const statusLabel = STATUSES.find((s) => s.value === b.status)?.label ?? b.status;
              const dt = b.starts_at
                ? new Date(b.starts_at).toLocaleString("ru-RU", {
                    day: "2-digit", month: "2-digit", year: "numeric",
                    hour: "2-digit", minute: "2-digit",
                  })
                : "—";
              return (
                <tr key={b.id} className="border-b hover:bg-muted/20 transition-colors">
                  <td className="px-3 py-2.5 font-mono text-xs">{dt}</td>
                  <td className="px-3 py-2.5">
                    <p className="font-medium">{b.client_name ?? "—"}</p>
                    {b.client_phone && <p className="text-xs text-muted-foreground">{b.client_phone}</p>}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{b.service_name ?? "—"}</td>
                  <td className="px-3 py-2.5">{Number(b.price).toLocaleString("ru-RU")} ₴</td>
                  <td className="px-3 py-2.5">
                    <span
                      className="rounded px-2 py-0.5 text-[11px] font-medium"
                      style={{ background: `${color}20`, color }}
                    >
                      {statusLabel}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-2 justify-end">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>←</Button>
          <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>→</Button>
        </div>
      )}
    </div>
  );
}
