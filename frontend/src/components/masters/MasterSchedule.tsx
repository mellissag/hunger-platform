"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiJson } from "@/lib/api";
import type { CalendarResponse } from "@/types/admin-api";

type BookingRow = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  client?: { first_name?: string | null; last_name?: string | null } | null;
  service?: { name_i18n?: Record<string, string> | null; name?: string | null } | null;
};

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = Array.from({ length: 14 }, (_, i) => i + 8);
const PX_PER_HOUR = 60;
const GRID_START_HOUR = 8;
const STATUS_COLORS: Record<string, string> = {
  confirmed: "#9A7230",
  pending: "#b8922a",
  cancelled_by_client: "#aaa",
  cancelled_by_salon: "#aaa",
  completed: "#5a8a5a",
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
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

function isSameDay(iso: string, day: Date) {
  const d = new Date(iso);
  return d.getDate() === day.getDate() && d.getMonth() === day.getMonth() && d.getFullYear() === day.getFullYear();
}

export function MasterSchedule({ masterId }: { masterId: string }) {
  const t = useTranslations("pages.masterDetail");
  const qc = useQueryClient();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [blockForm, setBlockForm] = useState({ starts_at_local: "", ends_at_local: "", note: "" });

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const month = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, "0")}`;

  const { data: bookingsResp } = useQuery({
    queryKey: ["master", masterId, "bookings"],
    queryFn: () => apiJson<{ items?: BookingRow[] }>(`/masters/${masterId}/bookings`),
  });
  const bookings = bookingsResp?.items ?? [];

  const { data: calendar } = useQuery({
    queryKey: ["master", masterId, "calendar", month],
    queryFn: () => apiJson<CalendarResponse>(`/masters/${masterId}/calendar?month=${month}`),
  });
  const blocks = calendar?.slots ?? [];

  const saveBlock = useMutation({
    mutationFn: (body: { starts_at: string; ends_at: string; note?: string }) =>
      apiJson("/schedule/block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, master_id: masterId, slot_type: "vacation" }),
      }),
    onSuccess: async () => {
      toast.success(t("toastBlockSaved"));
      setBlockForm({ starts_at_local: "", ends_at_local: "", note: "" });
      await qc.invalidateQueries({ queryKey: ["master", masterId, "calendar"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function eventStyle(startsAt: string, endsAt: string) {
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    const startMin = (start.getHours() - GRID_START_HOUR) * 60 + start.getMinutes();
    const durationMin = (end.getTime() - start.getTime()) / 60000;
    return {
      top: `${(startMin / 60) * PX_PER_HOUR}px`,
      height: `${Math.max((durationMin / 60) * PX_PER_HOUR, 20)}px`,
    };
  }

  const gridHeight = HOURS.length * PX_PER_HOUR;
  const weekBookings = bookings.filter((b) => weekDays.some((d) => isSameDay(b.starts_at, d)));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setWeekStart((w) => addDays(w, -7))}>←</Button>
        <span className="text-sm font-medium">
          {weekStart.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })} —{" "}
          {addDays(weekStart, 6).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}
        </span>
        <Button variant="outline" size="sm" onClick={() => setWeekStart((w) => addDays(w, 7))}>→</Button>
        <Button variant="outline" size="sm" onClick={() => setWeekStart(startOfWeek(new Date()))}>
          {t("today")}
        </Button>
      </div>

      <div className="overflow-x-auto rounded-md border bg-card">
        <div className="grid min-w-[980px]" style={{ gridTemplateColumns: "48px repeat(7, 1fr)" }}>
          <div className="border-b bg-muted/30" />
          {weekDays.map((day, i) => (
            <div key={i} className="border-b border-l bg-muted/30 p-2 text-center">
              <div className="text-xs font-semibold text-muted-foreground">{DAY_NAMES[i]}</div>
              <div className="text-base font-bold">{day.getDate()}</div>
            </div>
          ))}
          {HOURS.map((hour) => (
            <div key={hour} className="contents">
              <div className="flex h-[60px] items-start justify-center border-b bg-muted/20 pt-1 text-[11px] text-muted-foreground">
                {hour}:00
              </div>
              {weekDays.map((day, di) => (
                <div key={`${hour}-${di}`} className="relative h-[60px] border-b border-l" data-day={day.toISOString()} />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-[-884px] grid min-w-[980px] pointer-events-none" style={{ gridTemplateColumns: "48px repeat(7, 1fr)", height: `${gridHeight + 44}px` }}>
        <div />
        {weekDays.map((day, di) => (
          <div key={di} className="relative mt-[44px]" style={{ height: `${gridHeight}px` }}>
            {bookings.filter((b) => isSameDay(b.starts_at, day)).map((b) => (
              <div
                key={b.id}
                className="absolute left-[2px] right-[2px] z-[2] overflow-hidden rounded px-1.5 py-1 text-[11px] text-white pointer-events-auto"
                style={{ ...eventStyle(b.starts_at, b.ends_at), background: STATUS_COLORS[b.status] ?? "#9A7230" }}
              >
                <div className="font-semibold leading-tight">{formatTime(b.starts_at)}</div>
                <div className="truncate opacity-90">
                  {b.client?.first_name ?? "—"} {b.client?.last_name ?? ""}
                </div>
              </div>
            ))}
            {blocks.filter((bl) => isSameDay(bl.starts_at, day)).map((bl) => (
              <div
                key={bl.id}
                className="absolute left-[2px] right-[2px] z-[1] rounded border px-1.5 py-1 text-[11px] text-muted-foreground"
                style={{
                  ...eventStyle(bl.starts_at, bl.ends_at),
                  background:
                    "repeating-linear-gradient(45deg, rgba(0,0,0,0.06) 0px, rgba(0,0,0,0.06) 4px, transparent 4px, transparent 8px)",
                }}
              >
                {bl.note || t("vacation")}
              </div>
            ))}
          </div>
        ))}
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
                  <div className="text-sm font-semibold">{b.client?.first_name ?? "—"} {b.client?.last_name ?? ""}</div>
                  <div className="text-xs text-muted-foreground">{b.service?.name_i18n?.ru ?? b.service?.name ?? ""}</div>
                </div>
                <div className="text-right text-xs">
                  <div>{new Date(b.starts_at).toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "short" })}</div>
                  <div className="text-muted-foreground">{formatTime(b.starts_at)} - {formatTime(b.ends_at)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-md border p-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-primary">{t("vacation")}</h3>
        <p className="mb-3 text-xs text-muted-foreground">{t("vacationDesc")}</p>
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
          disabled={saveBlock.isPending || !blockForm.starts_at_local || !blockForm.ends_at_local}
          onClick={() =>
            saveBlock.mutate({
              starts_at: new Date(blockForm.starts_at_local).toISOString(),
              ends_at: new Date(blockForm.ends_at_local).toISOString(),
              note: blockForm.note || undefined,
            })
          }
        >
          {saveBlock.isPending ? t("saving") : t("saveBlock")}
        </Button>
      </div>
    </div>
  );
}
