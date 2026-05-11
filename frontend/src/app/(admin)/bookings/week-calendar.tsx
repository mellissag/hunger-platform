"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";

import {
  addDaysLocal,
  durationMinutes,
  isoToTimeInZone,
  minutesInZone,
} from "@/lib/date-local";
import type { BookingOut, CalendarSlotRow, MasterOut } from "@/types/admin-api";
import { cn } from "@/lib/utils";

const GRID_START_MIN = 9 * 60;
const GRID_END_MIN = 21 * 60;
const PX_PER_MIN = 1;
const GRID_HEIGHT = (GRID_END_MIN - GRID_START_MIN) * PX_PER_MIN;

type CalendarSlot = CalendarSlotRow;

type Props = {
  weekStart: Date;
  timeZone: string;
  bookings: BookingOut[];
  masters: MasterOut[];
  scheduleSlots: CalendarSlot[];
  masterFilter: string;
  nameClient: (id: string) => string;
  nameService: (id: string) => string;
  onSelectBooking: (id: string) => void;
  onEmptyClick: (date: string, time: string) => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
};

function slotOverlapsBlock(
  slot: CalendarSlot,
  masterId: string | undefined,
  dayKey: string,
  timeZone: string,
): { top: number; height: number } | null {
  if (masterId && slot.master_id !== masterId) return null;
  const st = ["vacation", "block", "sick", "break_"].includes(slot.slot_type) ? slot.slot_type : null;
  if (!st) return null;
  const a = minutesInZone(slot.starts_at, timeZone);
  const b = minutesInZone(slot.ends_at, timeZone);
  if (a.dayKey !== dayKey && b.dayKey !== dayKey) {
    // may span — simplify: only draw if start day matches
    if (a.dayKey !== dayKey) return null;
  }
  const startMin = a.minutes;
  const endMin = Math.max(startMin + 5, b.minutes);
  const top = Math.max(0, startMin - GRID_START_MIN) * PX_PER_MIN;
  const height = Math.min(GRID_HEIGHT - top, (endMin - startMin) * PX_PER_MIN);
  if (height <= 0) return null;
  return { top, height };
}

export function WeekCalendar({
  weekStart,
  timeZone,
  bookings,
  masters,
  scheduleSlots,
  masterFilter,
  nameClient,
  nameService,
  onSelectBooking,
  onEmptyClick,
  onPrevWeek,
  onNextWeek,
  onToday,
}: Props) {
  const locale = useLocale();
  const t = useTranslations("pages.bookings");

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysLocal(weekStart, i)), [weekStart]);

  const todayKey = useMemo(
    () => new Date().toLocaleDateString("en-CA", { timeZone }),
    [timeZone],
  );

  const rangeLabel = useMemo(() => {
    const a = days[0]!;
    const b = days[6]!;
    const fmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long" });
    return `${fmt.format(a)} — ${fmt.format(b)}`;
  }, [days, locale]);

  const hours = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 9), []);

  const bookingsByDay = useMemo(() => {
    const map = new Map<string, BookingOut[]>();
    for (const d of days) {
      const key = d.toLocaleDateString("en-CA", { timeZone });
      map.set(key, []);
    }
    const HIDDEN_STATUSES = new Set(["cancelled_by_client", "cancelled_by_salon", "no_show"]);
    for (const b of bookings) {
      if (HIDDEN_STATUSES.has(b.status)) continue;
      if (!b.starts_at) continue; // consultation bookings have no time
      const { dayKey } = minutesInZone(b.starts_at, timeZone);
      const list = map.get(dayKey);
      if (list) list.push(b);
    }
    for (const list of map.values()) {
      list.sort((a, c) => new Date(a.starts_at!).getTime() - new Date(c.starts_at!).getTime());
    }
    return map;
  }, [bookings, days, timeZone]);

  const masterColor = (id: string) => masters.find((m) => m.id === id)?.color_hex ?? "#9a7230";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card hover:bg-muted"
            onClick={onPrevWeek}
            aria-label="prev"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="font-playfair text-lg font-medium">{rangeLabel}</span>
          <button
            type="button"
            className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted"
            onClick={onToday}
          >
            {t("today")}
          </button>
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card hover:bg-muted"
            onClick={onNextWeek}
            aria-label="next"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex gap-0 overflow-x-auto rounded-lg border border-border bg-card">
        <div className="w-[60px] shrink-0 border-r border-border bg-muted/20 pt-10">
          {hours.map((h) => (
            <div
              key={h}
              className="flex items-start justify-end pr-2 text-[10px] text-muted-foreground"
              style={{ height: 60 }}
            >
              {String(h).padStart(2, "0")}:00
            </div>
          ))}
        </div>

        <div className="flex min-w-[840px] flex-1">
          {days.map((day) => {
            const dayKey = day.toLocaleDateString("en-CA", { timeZone });
            const isToday = dayKey === todayKey;
            const dayBookings = bookingsByDay.get(dayKey) ?? [];

            return (
              <div
                key={dayKey}
                className="relative flex-1 border-r border-border last:border-r-0"
                style={{ minHeight: GRID_HEIGHT }}
              >
                <div
                  className={cn(
                    "border-b border-border bg-muted/10 px-1 py-2 text-center text-[11px]",
                    isToday && "border-b-2 border-b-[hsl(37_53%_40%)]",
                  )}
                >
                  <div className="text-muted-foreground">
                    {new Intl.DateTimeFormat(locale, { weekday: "short" }).format(day)}
                  </div>
                  <div className={cn("font-medium", isToday && "text-[hsl(37_53%_40%)]")}>
                    {new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(day)}
                  </div>
                </div>

                <div
                  className="relative"
                  style={{ height: GRID_HEIGHT }}
                  data-calendar-day={dayKey}
                >
                  {hours.map((h) => (
                    <div
                      key={h}
                      className="absolute left-0 right-0 border-b border-border/40"
                      style={{ top: (h * 60 - GRID_START_MIN) * PX_PER_MIN, height: 60 }}
                    />
                  ))}

                  {scheduleSlots.map((slot) => {
                    const o = slotOverlapsBlock(
                      slot,
                      masterFilter || undefined,
                      dayKey,
                      timeZone,
                    );
                    if (!o) return null;
                    return (
                      <div
                        key={slot.id}
                        className="pointer-events-none absolute left-0 right-0 z-[1] rounded-sm opacity-80"
                        style={{
                          top: o.top,
                          height: o.height,
                          background:
                            "repeating-linear-gradient(-45deg, hsl(var(--muted)), hsl(var(--muted)) 6px, hsl(var(--muted-foreground) / 0.15) 6px, hsl(var(--muted-foreground) / 0.15) 12px)",
                        }}
                        title={slot.slot_type}
                      />
                    );
                  })}

                  {dayBookings.map((b) => {
                    if (!b.starts_at || !b.ends_at) return null;
                    const sm = minutesInZone(b.starts_at, timeZone);
                    if (sm.dayKey !== dayKey) return null;
                    const dur = durationMinutes(b.starts_at, b.ends_at);
                    const top = (sm.minutes - GRID_START_MIN) * PX_PER_MIN;
                    const height = Math.max(dur * PX_PER_MIN, 18);
                    const col = masterColor(b.master_id ?? "");
                    const isPending = b.status === "pending";
                    const timeRange = `${isoToTimeInZone(b.starts_at, timeZone)}–${isoToTimeInZone(b.ends_at, timeZone)}`;
                    const clientName = nameClient(b.client_id);
                    const serviceName = nameService(b.service_id);
                    const isTiny = dur < 30;
                    const compactName = (() => {
                      const trimmed = clientName.trim();
                      if (!trimmed) return "";
                      const first = trimmed.charAt(0);
                      return first ? `${first.toUpperCase()}.` : "";
                    })();
                    return (
                      <button
                        key={b.id}
                        type="button"
                        className="absolute left-0.5 right-0.5 z-[2] overflow-hidden rounded-[2px] px-1 py-0.5 text-left text-[11px] leading-tight text-white shadow-sm"
                        style={{
                          top,
                          height,
                          backgroundColor: isPending ? `${col}99` : `${col}dd`,
                          backgroundImage: isPending
                            ? "repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(0,0,0,0.1) 5px, rgba(0,0,0,0.1) 10px)"
                            : undefined,
                          border: isPending
                            ? `2px dashed rgba(255,255,255,0.55)`
                            : `none`,
                          borderLeft: isPending ? undefined : `3px solid ${col}`,
                        }}
                        title={`${timeRange} · ${clientName} · ${serviceName}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectBooking(b.id);
                        }}
                      >
                        {isPending && (
                          <svg
                            className="absolute right-1 top-1 opacity-80"
                            width="11" height="11" viewBox="0 0 24 24"
                            fill="none" stroke="rgba(255,255,255,0.95)" strokeWidth="2.5"
                            strokeLinecap="round" strokeLinejoin="round"
                          >
                            <circle cx="12" cy="12" r="10"/>
                            <polyline points="12 6 12 12 16 14"/>
                          </svg>
                        )}
                        <span className="relative block whitespace-nowrap text-[10px] font-medium tabular-nums text-white/85">
                          {timeRange}
                        </span>
                        {isTiny ? (
                          compactName ? (
                            <span className="relative block truncate">{compactName}</span>
                          ) : null
                        ) : (
                          <span className="relative line-clamp-2">
                            {clientName} · {serviceName}
                          </span>
                        )}
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    className="absolute inset-0 z-0 cursor-crosshair bg-transparent"
                    aria-label="grid"
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const y = e.clientY - rect.top;
                      const minFromGridStart = Math.floor(y / PX_PER_MIN);
                      const absMin = GRID_START_MIN + minFromGridStart;
                      const snapped = Math.round(absMin / 5) * 5;
                      const hh = Math.floor(snapped / 60);
                      const mm = snapped % 60;
                      const time = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
                      onEmptyClick(dayKey, time);
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
