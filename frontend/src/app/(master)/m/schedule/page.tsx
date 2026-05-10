"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
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

type ScheduleData = {
  week_start: string;
  work_hours: Record<string, { start?: string; end?: string; active?: boolean }>;
  bookings: BookingBrief[];
};

const STATUS_COLORS: Record<string, string> = {
  confirmed: "#22c55e",
  pending: "#f59e0b",
  completed: "#6366f1",
  cancelled_by_client: "#ef4444",
  cancelled_by_salon: "#ef4444",
};

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function getMondayOf(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(d);
  mon.setDate(d.getDate() + diff);
  mon.setHours(0, 0, 0, 0);
  return mon;
}

function toISODate(d: Date): string {
  return d.toISOString().split("T")[0]!;
}

function formatTime(iso: string | null) {
  if (!iso) return "?";
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export default function MasterSchedulePage() {
  const t = useTranslations("layout");
  const [monday, setMonday] = useState(() => getMondayOf(new Date()));

  const { data, isLoading } = useQuery({
    queryKey: ["master-schedule", toISODate(monday)],
    queryFn: () => apiJson<ScheduleData>(`/master/schedule?week_start=${toISODate(monday)}`),
    staleTime: 60_000,
  });

  function prevWeek() {
    setMonday((d) => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; });
  }
  function nextWeek() {
    setMonday((d) => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; });
  }
  function thisWeek() {
    setMonday(getMondayOf(new Date()));
  }

  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });

  // Group bookings by day of week
  const byDay: Record<string, BookingBrief[]> = {};
  for (const b of data?.bookings ?? []) {
    if (!b.starts_at) continue;
    const d = new Date(b.starts_at);
    const key = toISODate(d);
    if (!byDay[key]) byDay[key] = [];
    byDay[key].push(b);
  }

  const fmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="flex-1 text-2xl font-semibold tracking-tight">{t("nav.masterSchedule")}</h1>
        <Button variant="ghost" size="icon" onClick={prevWeek}><ChevronLeft className="h-4 w-4" /></Button>
        <Button variant="outline" size="sm" onClick={thisWeek} className="text-xs">Эта неделя</Button>
        <Button variant="ghost" size="icon" onClick={nextWeek}><ChevronRight className="h-4 w-4" /></Button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Загрузка…</p>}

      <div className="grid grid-cols-7 gap-1.5">
        {weekDates.map((date, i) => {
          const dateKey = toISODate(date);
          const dayBookings = byDay[dateKey] ?? [];
          const dayKey = DAY_KEYS[i]!;
          const wh = data?.work_hours?.[dayKey];
          const isToday = toISODate(date) === toISODate(new Date());
          const isOff = wh?.active === false;

          return (
            <div
              key={dateKey}
              className={`rounded-xl border p-2 min-h-[120px] ${isToday ? "border-primary bg-primary/5" : "bg-card"} ${isOff ? "opacity-40" : ""}`}
            >
              <p className={`text-[11px] font-semibold mb-1 ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                {DAY_LABELS[i]}
              </p>
              <p className={`text-sm font-bold mb-2 ${isToday ? "text-primary" : ""}`}>
                {fmt.format(date)}
              </p>
              {wh?.start && wh?.end && !isOff && (
                <p className="text-[10px] text-muted-foreground mb-1.5">
                  {wh.start}–{wh.end}
                </p>
              )}
              <div className="space-y-1">
                {dayBookings.map((b) => {
                  const color = STATUS_COLORS[b.status] ?? "#94a3b8";
                  return (
                    <div
                      key={b.id}
                      className="rounded px-1.5 py-1 text-[10px] font-medium"
                      style={{ background: `${color}20`, color }}
                    >
                      <p>{formatTime(b.starts_at)}</p>
                      <p className="truncate opacity-80">{b.client_name ?? "—"}</p>
                    </div>
                  );
                })}
                {dayBookings.length === 0 && !isOff && (
                  <p className="text-[10px] text-muted-foreground">—</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
