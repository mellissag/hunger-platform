"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { HttpError, apiFetch, apiJson } from "@/lib/api";

type BookingRow = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  client?: { first_name?: string | null; last_name?: string | null } | null;
  service?: { name_i18n?: Record<string, string> | null; name?: string | null } | null;
};

type ScheduleBlockRow = {
  id: string;
  master_id: string;
  slot_type: string;
  starts_at: string;
  ends_at: string;
  note: string | null;
};

const DAY_NAMES = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const HOURS = Array.from({ length: 14 }, (_, i) => i + 8);
const PX_PER_HOUR = 60;
const GRID_START_HOUR = 8;
const GRID_DURATION_MIN = HOURS.length * 60;

const STATUS_COLORS: Record<string, string> = {
  confirmed: "#9A7230",
  pending: "#b8922a",
  cancelled_by_client: "#aaa",
  cancelled_by_salon: "#aaa",
  completed: "#5a8a5a",
};

function formatTime(iso: string, locale: string) {
  return new Date(iso).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}

function formatBlockRange(startsIso: string, endsIso: string, locale: string) {
  const opts: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  };
  const a = new Date(startsIso).toLocaleString(locale, opts);
  const b = new Date(endsIso).toLocaleString(locale, opts);
  return `${a} — ${b}`;
}

function startOfWeek(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, n: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function minutesFromMidnight(d: Date) {
  return d.getHours() * 60 + d.getMinutes();
}

/** Обрезка интервала на границах календарного дня «day». */
function segmentOnDay(day: Date, startsAt: Date, endsAt: Date): { start: Date; end: Date } | null {
  const ds = new Date(day);
  ds.setHours(0, 0, 0, 0);
  const de = new Date(day);
  de.setHours(23, 59, 59, 999);
  const s = startsAt > ds ? startsAt : ds;
  const e = endsAt < de ? endsAt : de;
  if (s.getTime() >= e.getTime()) return null;
  return { start: s, end: e };
}

function eventStyle(segStart: Date, segEnd: Date) {
  let startMin = minutesFromMidnight(segStart) - GRID_START_HOUR * 60;
  let endMin = minutesFromMidnight(segEnd) - GRID_START_HOUR * 60;
  startMin = Math.max(0, Math.min(GRID_DURATION_MIN, startMin));
  endMin = Math.max(0, Math.min(GRID_DURATION_MIN, endMin));
  if (endMin <= startMin) {
    endMin = startMin + 10;
  }
  const durMin = endMin - startMin;
  return {
    top: `${(startMin / 60) * PX_PER_HOUR}px`,
    height: `${Math.max((durMin / 60) * PX_PER_HOUR, 12)}px`,
  };
}

export function MasterSchedule({ masterId }: { masterId: string }) {
  const t = useTranslations("pages.masterDetail");
  const locale = useLocale();
  const qc = useQueryClient();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [blockForm, setBlockForm] = useState({ starts_at_local: "", ends_at_local: "", note: "" });

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const gridHeight = HOURS.length * PX_PER_HOUR;

  const { data: bookingsResp } = useQuery({
    queryKey: ["master", masterId, "bookings"],
    queryFn: () => apiJson<{ items?: BookingRow[] }>(`/masters/${masterId}/bookings`),
    refetchInterval: 5000,
  });
  const bookings = bookingsResp?.items ?? [];

  const { data: blocksList = [] } = useQuery({
    queryKey: ["master", masterId, "blocks"],
    queryFn: () => apiJson<ScheduleBlockRow[]>(`/masters/${masterId}/blocks`),
    refetchInterval: 5000,
  });

  const blocksForWeek = useMemo(
    () =>
      blocksList.filter((bl) => {
        const s = new Date(bl.starts_at);
        const e = new Date(bl.ends_at);
        return weekDays.some((d) => segmentOnDay(d, s, e) != null);
      }),
    [blocksList, weekDays],
  );

  const createBlock = useMutation({
    mutationFn: (body: { starts_at: string; ends_at: string; note?: string; slot_type: "vacation" }) =>
      apiJson<ScheduleBlockRow>(`/masters/${masterId}/blocks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      toast.success(t("toastBlockSaved"));
      setBlockForm({ starts_at_local: "", ends_at_local: "", note: "" });
      await qc.invalidateQueries({ queryKey: ["master", masterId, "blocks"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteBlock = useMutation({
    mutationFn: async (blockId: string) => {
      const res = await apiFetch(`/masters/${masterId}/blocks/${blockId}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new HttpError(res.status, typeof err.detail === "string" ? err.detail : res.statusText, err);
      }
      return res.json() as Promise<{ ok: boolean }>;
    },
    onSuccess: async () => {
      toast.success(t("toastBlockRemoved"));
      await qc.invalidateQueries({ queryKey: ["master", masterId, "blocks"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const weekBookings = bookings.filter((b) => weekDays.some((d) => segmentOnDay(d, new Date(b.starts_at), new Date(b.ends_at))));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setWeekStart((w) => addDays(w, -7))}>
          ←
        </Button>
        <span className="text-sm font-medium">
          {weekStart.toLocaleDateString(locale, { day: "numeric", month: "long" })} —{" "}
          {addDays(weekStart, 6).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" })}
        </span>
        <Button variant="outline" size="sm" onClick={() => setWeekStart((w) => addDays(w, 7))}>
          →
        </Button>
        <Button variant="outline" size="sm" onClick={() => setWeekStart(startOfWeek(new Date()))}>
          {t("today")}
        </Button>
      </div>

      <div className="flex max-h-[min(70vh,640px)] min-h-[360px] flex-col overflow-hidden rounded-md border bg-card">
        <div
          className="grid shrink-0 border-b bg-muted/30"
          style={{ gridTemplateColumns: "48px repeat(7, minmax(72px, 1fr))" }}
        >
          <div className="border-r" />
          {weekDays.map((day, i) => (
            <div key={i} className="border-l px-1 py-2 text-center">
              <div className="text-[11px] font-semibold uppercase text-muted-foreground">{DAY_NAMES[i]}</div>
              <div className="text-base font-bold tabular-nums">{day.getDate()}</div>
            </div>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <div className="flex min-w-[720px]">
            <div className="w-12 shrink-0 border-r bg-muted/20">
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  className="flex h-[60px] items-start justify-center border-b pt-0.5 text-[11px] text-muted-foreground"
                >
                  {hour}:00
                </div>
              ))}
            </div>
            <div className="flex min-w-0 flex-1">
              {weekDays.map((day, di) => (
                <div
                  key={di}
                  className="relative min-w-[72px] flex-1 border-l first:border-l-0"
                  style={{ height: gridHeight }}
                >
                  {HOURS.map((hour) => (
                    <div
                      key={hour}
                      className="pointer-events-none absolute left-0 right-0 border-b border-border/70"
                      style={{
                        top: `${(hour - GRID_START_HOUR) * PX_PER_HOUR}px`,
                        height: `${PX_PER_HOUR}px`,
                      }}
                    />
                  ))}

                  {bookings.map((b) => {
                    const seg = segmentOnDay(day, new Date(b.starts_at), new Date(b.ends_at));
                    if (!seg) return null;
                    return (
                      <div
                        key={`${b.id}-${di}`}
                        className="absolute left-[2px] right-[2px] z-[2] overflow-hidden rounded px-1.5 py-1 text-[11px] text-white"
                        style={{
                          ...eventStyle(seg.start, seg.end),
                          background: STATUS_COLORS[b.status] ?? "#9A7230",
                        }}
                      >
                        <div className="font-semibold leading-tight">{formatTime(b.starts_at, locale)}</div>
                        <div className="truncate opacity-90">
                          {b.client?.first_name ?? "—"} {b.client?.last_name ?? ""}
                        </div>
                      </div>
                    );
                  })}

                  {blocksForWeek.map((bl) => {
                    const seg = segmentOnDay(day, new Date(bl.starts_at), new Date(bl.ends_at));
                    if (!seg) return null;
                    return (
                      <div
                        key={`${bl.id}-${di}`}
                        className="absolute left-[2px] right-[2px] z-[1] overflow-hidden rounded border px-1.5 py-1 text-[11px] text-muted-foreground"
                        style={{
                          ...eventStyle(seg.start, seg.end),
                          background:
                            "repeating-linear-gradient(45deg, rgba(0,0,0,0.06) 0px, rgba(0,0,0,0.06) 4px, transparent 4px, transparent 8px)",
                        }}
                      >
                        {bl.note || t("vacation")}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-primary">
          {t("weekBookings")} ({weekBookings.length})
        </h3>
        {weekBookings.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noBookingsThisWeek")}</p>
        ) : (
          <div className="space-y-2">
            {weekBookings.map((b) => (
              <div key={b.id} className="flex items-center gap-3 rounded-md border p-3">
                <div className="h-9 w-1 rounded" style={{ background: STATUS_COLORS[b.status] ?? "#9A7230" }} />
                <div className="flex-1">
                  <div className="text-sm font-semibold">
                    {b.client?.first_name ?? "—"} {b.client?.last_name ?? ""}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {b.service?.name_i18n?.ru ?? b.service?.name ?? ""}
                  </div>
                </div>
                <div className="text-right text-xs">
                  <div>
                    {new Date(b.starts_at).toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" })}
                  </div>
                  <div className="text-muted-foreground">
                    {formatTime(b.starts_at, locale)} - {formatTime(b.ends_at, locale)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">{t("blocksHeading")}</p>

        {blocksList.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("blocksEmpty")}</p>
        ) : (
          <div className="space-y-2">
            {blocksList.map((block) => (
              <div
                key={block.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{formatBlockRange(block.starts_at, block.ends_at, locale)}</p>
                  {block.note ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{block.note}</p> : null}
                  <p className="mt-1 text-[10px] uppercase text-muted-foreground">{t(`slotKind_${block.slot_type}`)}</p>
                </div>
                <button
                  type="button"
                  className={cn(
                    "ml-2 flex shrink-0 rounded-lg p-2 text-muted-foreground transition-colors",
                    "hover:bg-destructive/10 hover:text-destructive",
                  )}
                  title={t("deleteBlockAria")}
                  onClick={() => deleteBlock.mutate(block.id)}
                  disabled={deleteBlock.isPending}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-xl border border-dashed border-border p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("addPeriodTitle")}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>{t("blockStart")}</Label>
              <Input
                type="datetime-local"
                value={blockForm.starts_at_local}
                onChange={(e) => setBlockForm((f) => ({ ...f, starts_at_local: e.target.value }))}
              />
            </div>
            <div>
              <Label>{t("blockEnd")}</Label>
              <Input
                type="datetime-local"
                value={blockForm.ends_at_local}
                onChange={(e) => setBlockForm((f) => ({ ...f, ends_at_local: e.target.value }))}
              />
            </div>
          </div>
          <div className="mt-3">
            <Label>{t("blockNote")}</Label>
            <Input value={blockForm.note} onChange={(e) => setBlockForm((f) => ({ ...f, note: e.target.value }))} />
          </div>
          <Button
            className="mt-3"
            disabled={createBlock.isPending || !blockForm.starts_at_local || !blockForm.ends_at_local}
            onClick={() =>
              createBlock.mutate({
                starts_at: new Date(blockForm.starts_at_local).toISOString(),
                ends_at: new Date(blockForm.ends_at_local).toISOString(),
                note: blockForm.note || undefined,
                slot_type: "vacation",
              })
            }
          >
            {createBlock.isPending ? t("saving") : t("addBlockBtn")}
          </Button>
        </div>
      </div>
    </div>
  );
}
