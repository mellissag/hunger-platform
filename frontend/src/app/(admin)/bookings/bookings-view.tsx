"use client";

import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Eye,
  List,
  Pencil,
  Plus,
  X,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  type BookingFiltersState,
  useBookingStats,
  useBookings,
  useCancelBooking,
} from "@/hooks/useBookings";
import { apiFetch, apiJson } from "@/lib/api";
import { addDaysLocal, durationMinutes, startOfWeekMondayLocal, zonedToUtcIso } from "@/lib/date-local";
import { toIsoParam } from "@/lib/date-utc";
import type {
  BookingOut,
  CalendarResponse,
  CalendarSlotRow,
  ClientOut,
  MasterOut,
  Paginated,
  SalonBundle,
  ServiceOut,
  UserMe,
} from "@/types/admin-api";
import { cn } from "@/lib/utils";

import { BookingCreateDrawer } from "./booking-create-drawer";
import { BookingDetailDrawer } from "./booking-detail-drawer";
import { WeekCalendar } from "./week-calendar";

const DEFAULT_FILTERS: BookingFiltersState = {
  master_id: "",
  status: "",
  service_id: "",
  date_from: "",
  date_to: "",
};

function clientName(c: ClientOut | undefined, fallback: string) {
  if (!c) return fallback;
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || c.phone || fallback;
}

export function BookingsView() {
  const t = useTranslations("pages.bookings");
  const locale = useLocale();
  const searchParams = useSearchParams();

  const [view, setView] = useState<"calendar" | "table">("calendar");
  const [weekStart, setWeekStart] = useState(() => startOfWeekMondayLocal(new Date()));
  const [filters, setFilters] = useState<BookingFiltersState>(DEFAULT_FILTERS);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false);
  const [createInitialTime, setCreateInitialTime] = useState<{ date: string; time: string } | null>(
    null,
  );
  const [editBookingId, setEditBookingId] = useState<string | null>(null);
  const [tablePage, setTablePage] = useState(1);
  const [sorting, setSorting] = useState<SortingState>([{ id: "starts_at", desc: true }]);
  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null);
  const [blockOpen, setBlockOpen] = useState(false);
  const [blockMasterId, setBlockMasterId] = useState("");
  const [blockDate, setBlockDate] = useState("");
  const [blockStart, setBlockStart] = useState("09:00");
  const [blockEnd, setBlockEnd] = useState("13:00");
  const [blockNote, setBlockNote] = useState("");
  const cancelMut = useCancelBooking();

  useEffect(() => {
    if (searchParams.get("create") === "1") {
      setCreateDrawerOpen(true);
    }
  }, [searchParams]);

  useEffect(() => {
    setTablePage(1);
  }, [filters]);

  const { data: salon } = useQuery({
    queryKey: ["salon-bundle"],
    queryFn: () => apiJson<SalonBundle>("/salon"),
  });
  const { data: me } = useQuery({
    queryKey: ["auth", "me", "bookings-view"],
    queryFn: () => apiJson<UserMe>("/auth/me"),
  });
  const timeZone =
    salon?.salon.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";

  const calRange = useMemo(() => {
    const from = weekStart;
    const to = addDaysLocal(weekStart, 7);
    return { from, to };
  }, [weekStart]);

  const {
    data: calData,
    isLoading: calLoading,
    isError: calError,
    refetch: refetchCal,
  } = useQuery({
    queryKey: [
      "schedule",
      "calendar",
      toIsoParam(calRange.from),
      toIsoParam(calRange.to),
      filters.master_id,
    ],
    queryFn: () => {
      let url = `/schedule/calendar?from=${encodeURIComponent(toIsoParam(calRange.from))}&to=${encodeURIComponent(toIsoParam(calRange.to))}`;
      if (filters.master_id) url += `&master_id=${encodeURIComponent(filters.master_id)}`;
      return apiJson<CalendarResponse>(url);
    },
    enabled: view === "calendar",
    staleTime: 30_000,
    refetchInterval: view === "calendar" ? 5000 : false,
  });

  const listQuery = useBookings(filters, weekStart, view, view === "table" ? tablePage : 1, timeZone);
  const statsQuery = useBookingStats();

  const { data: mastersPg } = useQuery({
    queryKey: ["masters", "all"],
    queryFn: () => apiJson<Paginated<MasterOut>>("/masters?page=1&page_size=200"),
  });
  const { data: servicesPg } = useQuery({
    queryKey: ["services", "all"],
    queryFn: () => apiJson<Paginated<ServiceOut>>("/services?page=1&page_size=200"),
  });
  const { data: clientsPg } = useQuery({
    queryKey: ["clients", "all"],
    queryFn: () => apiJson<Paginated<ClientOut>>("/clients?page=1&page_size=500"),
  });

  const masters = useMemo(() => mastersPg?.items ?? [], [mastersPg?.items]);
  const services = useMemo(() => servicesPg?.items ?? [], [servicesPg?.items]);
  const clients = useMemo(() => clientsPg?.items ?? [], [clientsPg?.items]);

  const clientById = useMemo(() => {
    const m = new Map<string, ClientOut>();
    for (const c of clients) m.set(c.id, c);
    return m;
  }, [clients]);

  const nameClient = useCallback(
    (id: string) => clientName(clientById.get(id), id.slice(0, 8)),
    [clientById],
  );
  const nameMaster = useCallback(
    (id: string) => masters.find((x) => x.id === id)?.display_name ?? id.slice(0, 8),
    [masters],
  );
  const nameService = useCallback(
    (id: string) =>
      services.find((s) => s.id === id)?.name_i18n[locale] ??
      services.find((s) => s.id === id)?.name_i18n.en ??
      id.slice(0, 8),
    [services, locale],
  );

  const tableRows = listQuery.data?.items ?? [];
  const totalPages = Math.max(1, Math.ceil((listQuery.data?.total ?? 0) / 20));

  const columns = useMemo<ColumnDef<BookingOut>[]>(
    () => [
      {
        accessorKey: "starts_at",
        id: "starts_at",
        header: t("colWhen"),
        enableSorting: true,
        cell: ({ row }) =>
          new Intl.DateTimeFormat(locale, {
            dateStyle: "short",
            timeStyle: "short",
            timeZone,
          }).format(new Date(row.original.starts_at)),
      },
      {
        id: "client",
        header: t("colClient"),
        cell: ({ row }) => {
          const c = clientById.get(row.original.client_id);
          const label = clientName(c, "—");
          const initials =
            `${c?.first_name?.[0] ?? ""}${c?.last_name?.[0] ?? ""}`.toUpperCase() || "?";
          return (
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
                {initials}
              </div>
              <span className="truncate">{label}</span>
            </div>
          );
        },
      },
      {
        id: "service",
        header: t("colService"),
        cell: ({ row }) => nameService(row.original.service_id),
      },
      {
        id: "master",
        header: t("colMaster"),
        cell: ({ row }) => nameMaster(row.original.master_id),
      },
      {
        id: "duration",
        header: t("colDuration"),
        cell: ({ row }) =>
          t("durationMin", {
            n: durationMinutes(row.original.starts_at, row.original.ends_at),
          }),
      },
      {
        accessorKey: "price",
        header: t("colPriceEur"),
        cell: ({ row }) => `€${row.original.price}`,
      },
      {
        accessorKey: "status",
        header: t("colStatus"),
      },
      {
        id: "actions",
        header: t("colActions"),
        cell: ({ row }) => (
          <div className="flex gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setSelectedBookingId(row.original.id)}
              aria-label="open"
            >
              <Eye className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => {
                setEditBookingId(row.original.id);
                setCreateDrawerOpen(true);
              }}
              aria-label="edit"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive"
              onClick={() => setCancelTargetId(row.original.id)}
              aria-label="cancel"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ),
      },
    ],
    [clientById, locale, nameMaster, nameService, t, timeZone],
  );

  const table = useReactTable({
    data: tableRows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const todayKey = useMemo(() => new Date().toLocaleDateString("en-CA", { timeZone }), [timeZone]);

  const legendCounts = useMemo(() => {
    const calBookings = calData?.bookings ?? [];
    const counts = new Map<string, number>();
    for (const m of masters) counts.set(m.id, 0);
    for (const b of calBookings) {
      const dk = new Date(b.starts_at).toLocaleDateString("en-CA", { timeZone });
      if (dk !== todayKey) continue;
      counts.set(b.master_id, (counts.get(b.master_id) ?? 0) + 1);
    }
    return masters.map((m) => ({ master: m, n: counts.get(m.id) ?? 0 }));
  }, [calData?.bookings, masters, timeZone, todayKey]);

  const resetFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setTablePage(1);
  };

  const calendarBookings = listQuery.data?.items ?? [];
  const canManageBlocks = me?.role === "owner" || me?.role === "admin" || me?.role === "master";
  const blockCandidates = useMemo(
    () =>
      (calData?.slots ?? []).filter((s) =>
        ["block", "vacation", "sick", "break_"].includes(s.slot_type),
      ),
    [calData?.slots],
  );

  const createBlock = useMutation({
    mutationFn: async () => {
      const mid = me?.role === "master" ? me.master_id : blockMasterId;
      if (!mid) throw new Error(t("fieldMaster"));
      if (!blockDate || !blockStart || !blockEnd) throw new Error(t("validationRequired"));
      // Convert salon-local times to UTC before sending to the API.
      // new Date(`${date}T${time}:00`) uses the BROWSER timezone — not the salon's timezone.
      const startsUtc = zonedToUtcIso(blockDate, blockStart, timeZone);
      const endsUtc = zonedToUtcIso(blockDate, blockEnd, timeZone);
      if (new Date(startsUtc) >= new Date(endsUtc)) {
        throw new Error(t("blockHoursInvalidTime"));
      }
      return apiJson<CalendarSlotRow>("/schedule/block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          master_id: mid,
          starts_at: startsUtc,
          ends_at: endsUtc,
          slot_type: "block",
          note: blockNote.trim() || null,
        }),
      });
    },
    onSuccess: async () => {
      toast.success(t("toastSaved"));
      setBlockOpen(false);
      setBlockNote("");
      await refetchCal();
      await listQuery.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteBlock = useMutation({
    mutationFn: async (slotId: string) => {
      const res = await apiFetch(`/schedule/block/${slotId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { detail?: string };
        throw new Error(body.detail ?? `Delete failed: ${res.status}`);
      }
    },
    onSuccess: async () => {
      toast.success(t("toastCancelled"));
      await refetchCal();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            {t("pageEyebrow")}
          </p>
          <h1 className="font-playfair mt-1 text-[32px] font-medium leading-tight tracking-tight">
            {t("pageTitle")}
          </h1>
          <p className="mt-1 text-[10px] uppercase tracking-[0.25em] text-muted-foreground/60">
            {t("ornament")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border border-border p-0.5">
            <button
              type="button"
              onClick={() => setView("calendar")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-xs font-medium transition-colors",
                view === "calendar"
                  ? "bg-[hsl(37_53%_40%)] text-white shadow-sm"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              <Calendar className="h-4 w-4" />
              {t("tabCalendar")}
            </button>
            <button
              type="button"
              onClick={() => setView("table")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-xs font-medium transition-colors",
                view === "table"
                  ? "bg-[hsl(37_53%_40%)] text-white shadow-sm"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              <List className="h-4 w-4" />
              {t("tabTable")}
            </button>
          </div>
          <Button
            className="bg-[hsl(37_53%_40%)] text-white hover:bg-[hsl(37_53%_34%)]"
            onClick={() => {
              setEditBookingId(null);
              setCreateInitialTime(null);
              setCreateDrawerOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            {t("create")}
          </Button>
          {canManageBlocks && (
            <Button
              variant="outline"
              onClick={() => {
                const fallbackMaster = me?.role === "master" ? (me.master_id ?? "") : (filters.master_id || masters[0]?.id || "");
                setBlockMasterId(fallbackMaster);
                setBlockDate(new Date().toLocaleDateString("en-CA", { timeZone }));
                setBlockOpen(true);
              }}
            >
              {t("blockHoursBtn")}
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <Card className="border-border">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">{t("filterDateFrom")}</label>
              <InputNativeDate
                value={filters.date_from}
                onChange={(v) => setFilters((f) => ({ ...f, date_from: v }))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">{t("filterDateTo")}</label>
              <InputNativeDate
                value={filters.date_to}
                onChange={(v) => setFilters((f) => ({ ...f, date_to: v }))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">{t("fieldMaster")}</label>
              <select
                className="flex h-10 min-w-[160px] rounded-md border border-input bg-background px-3 text-sm"
                value={filters.master_id}
                onChange={(e) => setFilters((f) => ({ ...f, master_id: e.target.value }))}
              >
                <option value="">{t("allMasters")}</option>
                {masters.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.display_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">{t("colStatus")}</label>
              <select
                className="flex h-10 min-w-[140px] rounded-md border border-input bg-background px-3 text-sm"
                value={filters.status}
                onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
              >
                <option value="">{t("allStatuses")}</option>
                <option value="confirmed">confirmed</option>
                <option value="pending">pending</option>
                <option value="cancelled">cancelled</option>
                <option value="completed">completed</option>
                <option value="no_show">no_show</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">{t("fieldService")}</label>
              <select
                className="flex h-10 min-w-[180px] rounded-md border border-input bg-background px-3 text-sm"
                value={filters.service_id}
                onChange={(e) => setFilters((f) => ({ ...f, service_id: e.target.value }))}
              >
                <option value="">{t("allServices")}</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name_i18n[locale] ?? s.name_i18n.en}
                  </option>
                ))}
              </select>
            </div>
            <Button type="button" variant="outline" onClick={resetFilters}>
              {t("resetFilters")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* KPI */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label={t("kpiToday")}
          value={statsQuery.data?.today}
          loading={statsQuery.isLoading}
          error={statsQuery.isError}
          onRetry={() => statsQuery.refetch()}
        />
        <KpiCard
          label={t("kpiWeek")}
          value={statsQuery.data?.week}
          loading={statsQuery.isLoading}
          error={statsQuery.isError}
          onRetry={() => statsQuery.refetch()}
        />
        <KpiCard
          label={t("kpiMonth")}
          value={statsQuery.data?.month}
          loading={statsQuery.isLoading}
          error={statsQuery.isError}
          onRetry={() => statsQuery.refetch()}
        />
        <KpiCard
          label={t("kpiCancellations")}
          value={statsQuery.data?.cancellations}
          loading={statsQuery.isLoading}
          error={statsQuery.isError}
          onRetry={() => statsQuery.refetch()}
          danger
        />
      </div>

      {/* Main */}
      {view === "calendar" && (
        <div className="flex flex-col gap-4 lg:flex-row">
          <Card className="min-w-0 flex-1 border-border">
            <CardContent className="p-4">
              {listQuery.isLoading || calLoading ? (
                <Skeleton className="h-[720px] w-full" />
              ) : listQuery.isError || calError ? (
                <ErrorBanner
                  message={(listQuery.error as Error)?.message ?? t("errorLoad")}
                  onRetry={() => {
                    void listQuery.refetch();
                    void refetchCal();
                  }}
                />
              ) : (
                <WeekCalendar
                  weekStart={weekStart}
                  timeZone={timeZone}
                  bookings={calendarBookings}
                  masters={masters}
                  scheduleSlots={calData?.slots ?? []}
                  masterFilter={filters.master_id}
                  nameClient={nameClient}
                  nameService={nameService}
                  onSelectBooking={(id) => setSelectedBookingId(id)}
                  onEmptyClick={(date, time) => {
                    setCreateInitialTime({ date, time });
                    setEditBookingId(null);
                    setCreateDrawerOpen(true);
                  }}
                  onPrevWeek={() => setWeekStart((w) => addDaysLocal(w, -7))}
                  onNextWeek={() => setWeekStart((w) => addDaysLocal(w, 7))}
                  onToday={() => setWeekStart(startOfWeekMondayLocal(new Date()))}
                />
              )}
            </CardContent>
          </Card>

          <div className="w-full shrink-0 space-y-2 lg:w-[140px]">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("legendTitle")}
            </p>
            <ul className="space-y-2 text-sm">
              {legendCounts.map(({ master, n }) => (
                <li key={master.id} className="flex items-start gap-2">
                  <span
                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                    style={{ background: master.color_hex }}
                  />
                  <span className="min-w-0 leading-tight">
                    <span className="block truncate font-medium">{master.display_name}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {t("legendTodayCount", { n })}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {view === "table" && (
        <Card className="border-border">
          <CardContent className="p-4">
            {listQuery.isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : listQuery.isError ? (
              <ErrorBanner
                message={(listQuery.error as Error)?.message ?? t("errorLoad")}
                onRetry={() => listQuery.refetch()}
              />
            ) : (
              <>
                <Table>
                  <TableHeader>
                    {table.getHeaderGroups().map((hg) => (
                      <TableRow key={hg.id}>
                        {hg.headers.map((h) => (
                          <TableHead
                            key={h.id}
                            className={h.column.getCanSort() ? "cursor-pointer select-none" : ""}
                            onClick={h.column.getToggleSortingHandler()}
                          >
                            {flexRender(h.column.columnDef.header, h.getContext())}
                            {h.column.getIsSorted() === "asc" ? " ↑" : ""}
                            {h.column.getIsSorted() === "desc" ? " ↓" : ""}
                          </TableHead>
                        ))}
                      </TableRow>
                    ))}
                  </TableHeader>
                  <TableBody>
                    {table.getRowModel().rows.map((row) => (
                      <TableRow key={row.id}>
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id}>
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    {t("pageOf", { page: tablePage, total: totalPages })}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={tablePage <= 1}
                      onClick={() => setTablePage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      {t("prev")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={tablePage >= totalPages}
                      onClick={() => setTablePage((p) => p + 1)}
                    >
                      {t("next")}
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <BookingDetailDrawer
        bookingId={selectedBookingId}
        open={Boolean(selectedBookingId)}
        onOpenChange={(o) => {
          if (!o) setSelectedBookingId(null);
        }}
        salonTz={timeZone}
        onEdit={(id) => {
          setEditBookingId(id);
          setCreateDrawerOpen(true);
        }}
      />

      <BookingCreateDrawer
        open={createDrawerOpen}
        onOpenChange={(o) => {
          setCreateDrawerOpen(o);
          if (!o) {
            setCreateInitialTime(null);
            setEditBookingId(null);
          }
        }}
        services={services}
        initial={createInitialTime}
        editBookingId={editBookingId}
        salonTz={timeZone}
        onSuccess={() => {
          void listQuery.refetch();
        }}
      />

      <Dialog open={Boolean(cancelTargetId)} onOpenChange={(o) => !o && setCancelTargetId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("confirmCancelTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t("confirmCancelBody")}</p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCancelTargetId(null)}>
              {t("back")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={cancelMut.isPending}
              onClick={async () => {
                if (!cancelTargetId) return;
                await cancelMut.mutateAsync({ id: cancelTargetId, reason: null });
                setCancelTargetId(null);
                toast.success(t("toastCancelled"));
                void listQuery.refetch();
              }}
            >
              {t("confirmCancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={blockOpen} onOpenChange={setBlockOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("blockHoursTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">{t("fieldMaster")}</label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={me?.role === "master" ? (me.master_id ?? "") : blockMasterId}
                onChange={(e) => setBlockMasterId(e.target.value)}
                disabled={me?.role === "master"}
              >
                <option value="">—</option>
                {masters.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.display_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">{t("fieldDate")}</label>
                <InputNativeDate value={blockDate} onChange={setBlockDate} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">{t("fieldFrom")}</label>
                <InputNativeTime value={blockStart} onChange={setBlockStart} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">{t("fieldTo")}</label>
                <InputNativeTime value={blockEnd} onChange={setBlockEnd} />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">{t("fieldNotes")}</label>
              <input
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={blockNote}
                onChange={(e) => setBlockNote(e.target.value)}
                placeholder={t("blockHoursNotePlaceholder")}
              />
            </div>
            <div className="max-h-48 space-y-1 overflow-auto rounded-md border border-border p-2">
              {blockCandidates.map((slot) => (
                <div key={slot.id} className="flex items-center justify-between gap-2 rounded border border-border px-2 py-1 text-xs">
                  <span className="truncate">
                    {masters.find((m) => m.id === slot.master_id)?.display_name ?? slot.master_id.slice(0, 6)} ·{" "}
                    {new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short", timeZone }).format(new Date(slot.starts_at))} -{" "}
                    {new Intl.DateTimeFormat(locale, { timeStyle: "short", timeZone }).format(new Date(slot.ends_at))}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={deleteBlock.isPending}
                    onClick={() => deleteBlock.mutate(slot.id)}
                  >
                    {t("removeRow")}
                  </Button>
                </div>
              ))}
              {!blockCandidates.length && (
                <p className="text-xs text-muted-foreground">{t("blockHoursEmpty")}</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBlockOpen(false)}>
              {t("back")}
            </Button>
            <Button
              onClick={() => createBlock.mutate()}
              disabled={createBlock.isPending}
            >
              {t("blockHoursSave")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InputNativeDate({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="date"
      className="flex h-10 rounded-md border border-input bg-background px-3 text-sm"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function InputNativeTime({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="time"
      className="flex h-10 rounded-md border border-input bg-background px-3 text-sm"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function KpiCard({
  label,
  value,
  loading,
  error,
  onRetry,
  danger,
}: {
  label: string;
  value: number | undefined;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  danger?: boolean;
}) {
  const t = useTranslations("pages.bookings");
  return (
    <div
      className={cn(
        "kpi-card-premium rounded-lg border bg-card p-4 shadow-sm",
        danger && "border-red-400/60",
      )}
    >
      {loading ? (
        <Skeleton className="h-14 w-full" />
      ) : error ? (
        <div className="text-xs">
          <p className="text-destructive">{t("errorLoad")}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
            {t("retry")}
          </Button>
        </div>
      ) : (
        <>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="kpi-value-premium mt-1 text-3xl font-semibold">{value ?? 0}</p>
        </>
      )}
    </div>
  );
}

function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  const t = useTranslations("pages.bookings");
  return (
    <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4">
      <p className="text-sm">{message}</p>
      <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
        {t("retry")}
      </Button>
    </div>
  );
}
