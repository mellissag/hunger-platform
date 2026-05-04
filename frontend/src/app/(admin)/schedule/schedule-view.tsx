"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarDays, List, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { AdminEmptyState } from "@/components/admin/empty-state";
import { WeekScheduler, type WeekScheduleData } from "@/components/schedule/WeekScheduler";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiJson } from "@/lib/api";
import { utcAddDays, utcStartOfDay, toIsoParam } from "@/lib/date-utc";
import { cn } from "@/lib/utils";
import type { CalendarResponse, MasterOut, Paginated } from "@/types/admin-api";

import { BookingDetailDrawer } from "../bookings/booking-detail-drawer";

function mondayOfWeek(d: Date): Date {
  const day = d.getUTCDay();
  const diff = (day === 0 ? -6 : 1 - day);
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() + diff);
  monday.setUTCHours(0, 0, 0, 0);
  return monday;
}

function toIsoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function ScheduleView() {
  const t = useTranslations("pages.schedule");
  const locale = useLocale();
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [weekMonday, setWeekMonday] = useState<Date>(() => mondayOfWeek(new Date()));
  const [focusMasterId, setFocusMasterId] = useState<string | null>(null);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const weekDateStr = toIsoDate(weekMonday);

  const { data: weekData, isLoading: weekLoading } = useQuery({
    queryKey: ["schedule", "week", weekDateStr, focusMasterId ?? "all"],
    queryFn: () => {
      const params = new URLSearchParams({ date: weekDateStr });
      if (focusMasterId) params.set("master_id", focusMasterId);
      return apiJson<WeekScheduleData>(`/schedule/week?${params.toString()}`);
    },
    enabled: viewMode === "grid",
    refetchInterval: 30_000,
  });

  // List view data
  const range = useMemo(() => {
    const from = utcStartOfDay(weekMonday);
    const to = utcAddDays(from, 7);
    return { from, to };
  }, [weekMonday]);

  const { data: mastersPg } = useQuery({
    queryKey: ["masters", "schedule-list"],
    queryFn: () => apiJson<Paginated<MasterOut>>("/masters?page=1&page_size=100"),
    enabled: viewMode === "list",
  });

  const { data: cal, isLoading: calLoading } = useQuery({
    queryKey: ["schedule", "calendar", "all", range.from.toISOString(), range.to.toISOString()],
    queryFn: () =>
      apiJson<CalendarResponse>(
        `/schedule/calendar?from=${encodeURIComponent(toIsoParam(range.from))}&to=${encodeURIComponent(toIsoParam(range.to))}`,
      ),
    enabled: viewMode === "list",
  });

  const listRows = useMemo(() => {
    const masters = mastersPg?.items ?? [];
    const bookings = cal?.bookings ?? [];
    const slots = cal?.slots ?? [];
    return masters.map((m) => ({
      master: m,
      bookingCount: bookings.filter((b) => b.master_id === m.id).length,
      slotCount: slots.filter((s) => s.master_id === m.id).length,
    }));
  }, [cal?.bookings, cal?.slots, mastersPg?.items]);

  const salonTz = weekData?.timezone ?? "Europe/Sofia";

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-playfair text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-lg border border-border bg-muted/40 p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={cn(
                "flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors",
                viewMode === "grid"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <CalendarDays className="h-3.5 w-3.5" />
              Сетка
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={cn(
                "flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors",
                viewMode === "list"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <List className="h-3.5 w-3.5" />
              Список
            </button>
          </div>
        </div>
      </div>

      {/* Grid view */}
      {viewMode === "grid" && (
        <>
          {weekLoading && !weekData ? (
            <Skeleton className="h-[600px] w-full" />
          ) : weekData ? (
            <WeekScheduler
              data={weekData}
              focusMasterId={focusMasterId}
              onFocusMaster={setFocusMasterId}
              onPrevWeek={() => setWeekMonday((w) => { const d = new Date(w); d.setUTCDate(d.getUTCDate() - 7); return d; })}
              onNextWeek={() => setWeekMonday((w) => { const d = new Date(w); d.setUTCDate(d.getUTCDate() + 7); return d; })}
              onToday={() => setWeekMonday(mondayOfWeek(new Date()))}
              onSelectBooking={(id) => {
                setSelectedBookingId(id);
                setDrawerOpen(true);
              }}
              locale={locale}
            />
          ) : (
            <AdminEmptyState title={t("empty")} description={t("emptyDesc")} />
          )}
        </>
      )}

      {/* List view */}
      {viewMode === "list" && (
        <Card>
          <CardHeader className="space-y-0">
            <CardTitle>{t("weekTitle")}</CardTitle>
            <CardDescription>
              {new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(range.from)} —{" "}
              {new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(utcAddDays(range.from, 6))}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {calLoading && !cal ? (
              <Skeleton className="h-48 w-full" />
            ) : !listRows.length ? (
              <AdminEmptyState title={t("empty")} description={t("emptyDesc")} />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("colMaster")}</TableHead>
                    <TableHead>{t("colBookings")}</TableHead>
                    <TableHead>{t("colBlocks")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listRows.map((r) => (
                    <TableRow key={r.master.id}>
                      <TableCell className="font-medium">
                        <span
                          className="mr-2 inline-block h-2 w-2 rounded-full"
                          style={{ backgroundColor: r.master.color_hex }}
                        />
                        {r.master.display_name}
                      </TableCell>
                      <TableCell>{r.bookingCount}</TableCell>
                      <TableCell>{r.slotCount}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Booking detail drawer */}
      <BookingDetailDrawer
        bookingId={selectedBookingId}
        open={drawerOpen}
        onOpenChange={(v) => {
          setDrawerOpen(v);
          if (!v) setSelectedBookingId(null);
        }}
        salonTz={salonTz}
      />
    </div>
  );
}
