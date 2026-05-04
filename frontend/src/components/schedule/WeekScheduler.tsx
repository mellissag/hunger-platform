"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type WeekBooking = {
  id: string;
  start: string;
  end: string;
  client_name: string;
  service_name: string;
  status: string;
};

export type WeekBlock = {
  id: string;
  start: string;
  end: string;
  slot_type: string;
  note: string | null;
};

export type WeekDayHours = {
  day: number; // 0=Mon … 6=Sun
  open: string;
  close: string;
};

export type WeekMasterData = {
  id: string;
  name: string;
  color: string;
  working_hours: WeekDayHours[];
  bookings: WeekBooking[];
  blocks: WeekBlock[];
};

export type WeekScheduleData = {
  week_start: string;
  week_end: string;
  timezone: string;
  masters: WeekMasterData[];
};

type Props = {
  data: WeekScheduleData;
  focusMasterId: string | null;
  onFocusMaster: (id: string | null) => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
  onSelectBooking: (id: string) => void;
  locale: string;
};

const GRID_START_H = 9;
const GRID_END_H = 21;
const SLOT_H = 48;
const TOTAL_SLOTS = (GRID_END_H - GRID_START_H) * 2;
const GRID_HEIGHT = TOTAL_SLOTS * SLOT_H;

const DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function toMin(iso: string, tz: string): { dayIdx: number; min: number } {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    hour: "numeric",
    minute: "numeric",
    weekday: "short",
    hour12: false,
  }).formatToParts(d);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const weekdayMap: Record<string, number> = {
    Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6,
  };
  return { dayIdx: weekdayMap[weekday] ?? 0, min: hour * 60 + minute };
}

function timeLabel(slotIdx: number): string {
  const totalMin = (GRID_START_H * 60) + slotIdx * 30;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}

function CurrentTimeLine({ tz, dayIdx }: { tz: string; dayIdx: number }) {
  const [topPx, setTopPx] = useState<number | null>(null);
  const [curDay, setCurDay] = useState<number | null>(null);

  useEffect(() => {
    const update = () => {
      const now = new Date();
      const { dayIdx: d, min } = toMin(now.toISOString(), tz);
      setCurDay(d);
      const offset = min - GRID_START_H * 60;
      if (offset < 0 || offset > (GRID_END_H - GRID_START_H) * 60) {
        setTopPx(null);
      } else {
        setTopPx((offset / 30) * SLOT_H);
      }
    };
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, [tz]);

  if (topPx === null || curDay !== dayIdx) return null;

  return (
    <div
      className="pointer-events-none absolute left-0 right-0 z-30 flex items-center"
      style={{ top: topPx }}
    >
      <div className="h-2 w-2 rounded-full bg-red-500 -translate-x-1" />
      <div className="h-px flex-1 bg-red-500" />
    </div>
  );
}

function isWorking(dayIdx: number, workingHours: WeekDayHours[]): { open: string; close: string } | null {
  return workingHours.find((wh) => wh.day === dayIdx) ?? null;
}

function timeToMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function WeekScheduler({
  data,
  focusMasterId,
  onFocusMaster,
  onPrevWeek,
  onNextWeek,
  onToday,
  onSelectBooking,
  locale,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const visibleMasters = focusMasterId
    ? data.masters.filter((m) => m.id === focusMasterId)
    : data.masters;

  const weekLabel = (() => {
    const s = new Date(data.week_start + "T00:00:00");
    const e = new Date(data.week_end + "T00:00:00");
    const fmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long" });
    return `${fmt.format(s)} — ${fmt.format(e)}`;
  })();

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(data.week_start + "T00:00:00");
    d.setDate(d.getDate() + i);
    return { dayIdx: i, date: d };
  });

  const todayDayIdx = (() => {
    const now = new Date();
    const { dayIdx } = toMin(now.toISOString(), data.timezone);
    return dayIdx;
  })();

  const weekStartDate = new Date(data.week_start + "T00:00:00");
  const weekEndDate = new Date(data.week_end + "T00:00:00");
  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);
  const isCurrentWeek = todayDate >= weekStartDate && todayDate <= weekEndDate;

  return (
    <div className="flex flex-col gap-3">
      {/* Navigation bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onPrevWeek}
            className="flex h-8 w-8 items-center justify-center rounded border border-border bg-card hover:bg-muted"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="font-playfair text-base font-medium">{weekLabel}</span>
          <button
            type="button"
            onClick={onToday}
            className="rounded border border-border bg-card px-3 py-1 text-xs font-medium hover:bg-muted"
          >
            Сегодня
          </button>
          <button
            type="button"
            onClick={onNextWeek}
            className="flex h-8 w-8 items-center justify-center rounded border border-border bg-card hover:bg-muted"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Master filter chips */}
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => onFocusMaster(null)}
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-xs",
              focusMasterId === null
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-primary/50",
            )}
          >
            Все мастера
          </button>
          {data.masters.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onFocusMaster(m.id === focusMasterId ? null : m.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                focusMasterId === m.id
                  ? "border-transparent text-white"
                  : "border-border text-muted-foreground hover:border-primary/50",
              )}
              style={
                focusMasterId === m.id
                  ? { backgroundColor: m.color, borderColor: m.color }
                  : undefined
              }
            >
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: m.color }}
              />
              {m.name}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div
        ref={containerRef}
        className="overflow-auto rounded-lg border border-border bg-card shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
        style={{ maxHeight: "75vh" }}
      >
        {/* Header row: time + day×master columns */}
        <div
          className="sticky top-0 z-20 flex border-b border-border bg-card"
          style={{ minWidth: `${56 + 7 * visibleMasters.length * 120}px` }}
        >
          {/* Time corner */}
          <div className="w-14 shrink-0 border-r border-border" />
          {/* Day-master headers */}
          {days.map(({ dayIdx, date: dayDate }) => (
            <div
              key={dayIdx}
              className={cn(
                "flex flex-1 shrink-0 flex-col border-r border-border last:border-r-0",
                isCurrentWeek && dayIdx === todayDayIdx && "bg-primary/5",
              )}
              style={{ minWidth: `${visibleMasters.length * 120}px` }}
            >
              {/* Day header */}
              <div
                className={cn(
                  "border-b border-border px-2 py-1 text-center text-[11px]",
                  isCurrentWeek && dayIdx === todayDayIdx
                    ? "font-semibold text-primary"
                    : "text-muted-foreground",
                )}
              >
                {DAYS[dayIdx]}{" "}
                {new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(dayDate)}
              </div>
              {/* Master sub-headers */}
              <div className="flex">
                {visibleMasters.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onFocusMaster(m.id === focusMasterId ? null : m.id)}
                    className="flex flex-1 items-center justify-center gap-1 border-r border-border/50 py-1 text-[10px] font-medium last:border-r-0 hover:bg-muted/50"
                    style={{ minWidth: 120 }}
                    title={m.name}
                  >
                    <span
                      className="inline-block h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: m.color }}
                    />
                    <span className="truncate">{m.name}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Body */}
        <div
          className="flex"
          style={{ minWidth: `${56 + 7 * visibleMasters.length * 120}px`, height: GRID_HEIGHT }}
        >
          {/* Time column */}
          <div className="sticky left-0 z-10 w-14 shrink-0 border-r border-border bg-card">
            {Array.from({ length: TOTAL_SLOTS }, (_, i) => (
              <div
                key={i}
                className="flex items-start justify-end pr-2 text-[10px] text-muted-foreground"
                style={{ height: SLOT_H }}
              >
                {i % 2 === 0 ? timeLabel(i) : ""}
              </div>
            ))}
          </div>

          {/* Day × Master columns */}
          {days.map(({ dayIdx, date: dayDate }) => (
            <div
              key={dayIdx}
              className={cn(
                "flex flex-1 shrink-0 border-r border-border last:border-r-0",
                isCurrentWeek && dayIdx === todayDayIdx && "bg-primary/[0.02]",
              )}
              style={{ minWidth: `${visibleMasters.length * 120}px`, position: "relative" }}
            >
              {visibleMasters.map((master) => {
                const wh = isWorking(dayIdx, master.working_hours);
                const rgbColor = hexToRgb(master.color);

                const masterBookingsForDay = master.bookings.filter((b) => {
                  const { dayIdx: d } = toMin(b.start, data.timezone);
                  return d === dayIdx;
                });
                const masterBlocksForDay = master.blocks.filter((bl) => {
                  const { dayIdx: d } = toMin(bl.start, data.timezone);
                  return d === dayIdx;
                });

                const openMin = wh ? timeToMin(wh.open) : null;
                const closeMin = wh ? timeToMin(wh.close) : null;
                const gridStartMin = GRID_START_H * 60;

                return (
                  <div
                    key={master.id}
                    className="relative flex-1 border-r border-border/40 last:border-r-0"
                    style={{ minWidth: 120, height: GRID_HEIGHT }}
                  >
                    {/* Slot lines */}
                    {Array.from({ length: TOTAL_SLOTS }, (_, i) => {
                      const slotMin = gridStartMin + i * 30;
                      const isWorking =
                        openMin !== null &&
                        closeMin !== null &&
                        slotMin >= openMin &&
                        slotMin < closeMin;
                      return (
                        <div
                          key={i}
                          className={cn(
                            "absolute left-0 right-0 border-b border-border/30",
                            i % 2 === 0 ? "border-border/40" : "border-border/20",
                          )}
                          style={{
                            top: i * SLOT_H,
                            height: SLOT_H,
                            backgroundColor: isWorking
                              ? `rgba(${rgbColor},0.06)`
                              : "rgba(0,0,0,0.025)",
                          }}
                        />
                      );
                    })}

                    {/* Current time line */}
                    {isCurrentWeek && (
                      <CurrentTimeLine tz={data.timezone} dayIdx={dayIdx} />
                    )}

                    {/* Schedule blocks (vacation/break) */}
                    {masterBlocksForDay.map((block) => {
                      const { min: startMin } = toMin(block.start, data.timezone);
                      const { min: endMin } = toMin(block.end, data.timezone);
                      const top = ((startMin - gridStartMin) / 30) * SLOT_H;
                      const height = Math.max(((endMin - startMin) / 30) * SLOT_H, 20);
                      if (top < 0 || top >= GRID_HEIGHT) return null;
                      return (
                        <div
                          key={block.id}
                          className="pointer-events-none absolute left-0.5 right-0.5 z-[1] overflow-hidden rounded px-1 py-0.5 text-[10px] text-muted-foreground"
                          style={{
                            top,
                            height,
                            background:
                              "repeating-linear-gradient(-45deg, hsl(var(--muted)), hsl(var(--muted)) 6px, hsl(var(--muted-foreground)/0.1) 6px, hsl(var(--muted-foreground)/0.1) 12px)",
                          }}
                          title={block.note ?? block.slot_type}
                        >
                          {block.note ?? block.slot_type}
                        </div>
                      );
                    })}

                    {/* Bookings */}
                    {masterBookingsForDay.map((booking) => {
                      const { min: startMin } = toMin(booking.start, data.timezone);
                      const { min: endMin } = toMin(booking.end, data.timezone);
                      const top = ((startMin - gridStartMin) / 30) * SLOT_H;
                      const height = Math.max(((endMin - startMin) / 30) * SLOT_H, 22);
                      if (top < 0 || top >= GRID_HEIGHT) return null;

                      const isPending = booking.status === "pending";
                      const isCancelled = booking.status.includes("cancel");
                      const opacity = isCancelled ? 0.4 : isPending ? 0.75 : 0.92;

                      return (
                        <button
                          key={booking.id}
                          type="button"
                          className="absolute left-0.5 right-0.5 z-[2] overflow-hidden rounded px-1.5 py-0.5 text-left text-[10px] leading-tight text-white shadow-sm hover:z-[10] hover:shadow-md"
                          style={{
                            top,
                            height,
                            background: isPending
                              ? `repeating-linear-gradient(45deg, ${master.color}bb, ${master.color}bb 4px, rgba(${rgbColor},0.25) 4px, rgba(${rgbColor},0.25) 8px)`
                              : `rgba(${rgbColor},${opacity})`,
                            borderLeft: isPending
                              ? `3px dashed ${master.color}`
                              : `3px solid ${master.color}`,
                          }}
                          onClick={() => onSelectBooking(booking.id)}
                          title={`${booking.client_name} · ${booking.service_name}`}
                        >
                          <span className="line-clamp-2">
                            {isPending && "⏳ "}
                            {booking.client_name}
                            {height > 36 && (
                              <>
                                {" "}
                                <span className="opacity-80">· {booking.service_name}</span>
                              </>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
