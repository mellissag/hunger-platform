"use client";

import { type ColumnDef, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, ChevronLeft, ChevronRight, LayoutList, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { AdminEmptyState } from "@/components/admin/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import type {
  BookingOut,
  CalendarBooking,
  CalendarResponse,
  ClientOut,
  MasterOut,
  Paginated,
  ServiceOut,
} from "@/types/admin-api";

const bookingCreateSchema = z.object({
  client_id: z.string().uuid(),
  master_id: z.string().uuid(),
  service_id: z.string().uuid(),
  starts_at_local: z.string().min(1),
});

type BookingCreateValues = z.infer<typeof bookingCreateSchema>;

export function BookingsView() {
  const t = useTranslations("pages.bookings");
  const locale = useLocale();
  const qc = useQueryClient();
  const [view, setView] = useState<"calendar" | "table">("calendar");
  const [weekStart, setWeekStart] = useState(() => utcStartOfDay(new Date()));
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const range = useMemo(() => {
    const from = weekStart;
    const to = utcAddDays(weekStart, 7);
    return { from, to };
  }, [weekStart]);

  const { data: cal, isLoading: calLoading } = useQuery({
    queryKey: [
      "schedule",
      "calendar",
      "bookings",
      range.from.toISOString(),
      range.to.toISOString(),
    ],
    queryFn: () =>
      apiJson<CalendarResponse>(
        `/schedule/calendar?from=${encodeURIComponent(toIsoParam(range.from))}&to=${encodeURIComponent(toIsoParam(range.to))}`,
      ),
  });

  const { data: tableData, isLoading: tableLoading } = useQuery({
    queryKey: ["bookings", "table", page],
    queryFn: () => apiJson<Paginated<BookingOut>>(`/bookings?page=${page}&page_size=${pageSize}`),
    enabled: view === "table",
  });

  const { data: mastersPg } = useQuery({
    queryKey: ["masters", "all"],
    queryFn: () => apiJson<Paginated<MasterOut>>("/masters?page=1&page_size=100"),
  });
  const { data: clientsPg } = useQuery({
    queryKey: ["clients", "all"],
    queryFn: () => apiJson<Paginated<ClientOut>>("/clients?page=1&page_size=200"),
  });
  const { data: servicesPg } = useQuery({
    queryKey: ["services", "all"],
    queryFn: () => apiJson<Paginated<ServiceOut>>("/services?page=1&page_size=200"),
  });

  const masters = mastersPg?.items ?? [];
  const clients = clientsPg?.items ?? [];
  const services = servicesPg?.items ?? [];

  const nameClient = (id: string) => {
    const c = clients.find((x) => x.id === id);
    return [c?.first_name, c?.last_name].filter(Boolean).join(" ") || c?.phone || id.slice(0, 8);
  };
  const nameMaster = (id: string) =>
    masters.find((m) => m.id === id)?.display_name ?? id.slice(0, 8);
  const nameService = (id: string) =>
    services.find((s) => s.id === id)?.name_i18n[locale] ??
    services.find((s) => s.id === id)?.name_i18n.en ??
    id.slice(0, 8);

  const weekBookings = useMemo(() => {
    const list = cal?.bookings ?? [];
    const days: Date[] = Array.from({ length: 7 }, (_, i) => utcAddDays(weekStart, i));
    return days.map((day) => ({
      day,
      items: list
        .filter((b) => {
          const d = new Date(b.starts_at);
          return (
            d.getUTCFullYear() === day.getUTCFullYear() &&
            d.getUTCMonth() === day.getUTCMonth() &&
            d.getUTCDate() === day.getUTCDate()
          );
        })
        .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()),
    }));
  }, [cal?.bookings, weekStart]);

  const columns = useMemo<ColumnDef<BookingOut>[]>(
    () => [
      {
        accessorKey: "starts_at",
        header: t("colWhen"),
        cell: ({ row }) =>
          new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(
            new Date(row.original.starts_at),
          ),
      },
      {
        id: "client",
        header: t("colClient"),
        cell: ({ row }) => nameClient(row.original.client_id),
      },
      {
        id: "master",
        header: t("colMaster"),
        cell: ({ row }) => nameMaster(row.original.master_id),
      },
      {
        id: "service",
        header: t("colService"),
        cell: ({ row }) => nameService(row.original.service_id),
      },
      {
        accessorKey: "price",
        header: t("colPrice"),
      },
      {
        accessorKey: "status",
        header: t("colStatus"),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/clients/${row.original.client_id}`}>{t("openClient")}</Link>
          </Button>
        ),
      },
    ],
    [clients, locale, masters, services, t],
  );

  const table = useReactTable({
    data: tableData?.items ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const createBooking = useMutation({
    mutationFn: async (values: BookingCreateValues) => {
      const starts = new Date(values.starts_at_local);
      return apiJson<BookingOut>("/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: values.client_id,
          master_id: values.master_id,
          service_id: values.service_id,
          starts_at: starts.toISOString(),
          created_via: "admin",
        }),
      });
    },
    onSuccess: async () => {
      toast.success(t("toastCreated"));
      await qc.invalidateQueries({ queryKey: ["schedule", "calendar"] });
      await qc.invalidateQueries({ queryKey: ["bookings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const form = useForm<BookingCreateValues>({
    resolver: zodResolver(bookingCreateSchema),
    defaultValues: {
      client_id: "",
      master_id: "",
      service_id: "",
      starts_at_local: "",
    },
  });

  const loading = calLoading || (view === "table" && tableLoading);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-2">
            <Button
              type="button"
              variant={view === "calendar" ? "default" : "outline"}
              size="sm"
              onClick={() => setView("calendar")}
            >
              <CalendarDays className="mr-1 h-4 w-4" />
              {t("tabCalendar")}
            </Button>
            <Button
              type="button"
              variant={view === "table" ? "default" : "outline"}
              size="sm"
              onClick={() => setView("table")}
            >
              <LayoutList className="mr-1 h-4 w-4" />
              {t("tabTable")}
            </Button>
          </div>
          <BookingCreateDrawer
            form={form}
            onSubmit={(v) => createBooking.mutate(v)}
            pending={createBooking.isPending}
            clients={clients}
            masters={masters}
            services={services}
            t={t}
          />
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-[480px] w-full" />
      ) : view === "calendar" ? (
        <Card data-testid="booking-calendar">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
            <div>
              <CardTitle>{t("weekTitle")}</CardTitle>
              <CardDescription>{t("weekDesc")}</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setWeekStart((w) => utcAddDays(w, -7))}
                aria-label="prev"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setWeekStart((w) => utcAddDays(w, 7))}
                aria-label="next"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {weekBookings.every((d) => d.items.length === 0) ? (
              <AdminEmptyState title={t("emptyWeek")} description={t("emptyWeekDesc")} />
            ) : (
              <div className="grid gap-3 md:grid-cols-7">
                {weekBookings.map(({ day, items }) => (
                  <div
                    key={day.toISOString()}
                    className="min-h-[120px] rounded-lg border bg-card p-2"
                  >
                    <p className="mb-2 text-center text-xs font-semibold text-muted-foreground">
                      {new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric" }).format(
                        day,
                      )}
                    </p>
                    <div className="space-y-2">
                      {items.map((b: CalendarBooking) => {
                        const col =
                          masters.find((m) => m.id === b.master_id)?.color_hex ?? "#D97757";
                        return (
                          <div
                            key={b.id}
                            className="rounded-md border px-2 py-1.5 text-xs shadow-sm"
                            style={{ borderColor: col }}
                          >
                            <p className="font-medium leading-tight" style={{ color: col }}>
                              {new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(
                                new Date(b.starts_at),
                              )}
                            </p>
                            <p className="truncate text-muted-foreground">
                              {nameClient(b.client_id)}
                            </p>
                            <p className="truncate">{nameService(b.service_id)}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t("tableTitle")}</CardTitle>
            <CardDescription>{t("tableDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            {!tableData?.items.length ? (
              <AdminEmptyState title={t("emptyTable")} description={t("emptyTableDesc")} />
            ) : (
              <>
                <Table>
                  <TableHeader>
                    {table.getHeaderGroups().map((hg) => (
                      <TableRow key={hg.id}>
                        {hg.headers.map((h) => (
                          <TableHead key={h.id}>
                            {flexRender(h.column.columnDef.header, h.getContext())}
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
                <div className="mt-4 flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    {t("pagination", {
                      from: (page - 1) * pageSize + 1,
                      to: Math.min(page * pageSize, tableData.total),
                      total: tableData.total,
                    })}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      {t("prev")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page * pageSize >= tableData.total}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      {t("next")}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function BookingCreateDrawer({
  form,
  onSubmit,
  pending,
  clients,
  masters,
  services,
  t,
}: {
  form: ReturnType<typeof useForm<BookingCreateValues>>;
  onSubmit: (v: BookingCreateValues) => void;
  pending: boolean;
  clients: ClientOut[];
  masters: MasterOut[];
  services: ServiceOut[];
  t: ReturnType<typeof useTranslations<"pages.bookings">>;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = form;

  return (
    <Drawer>
      <DrawerTrigger asChild>
        <Button data-testid="booking-create-open">
          <Plus className="mr-1 h-4 w-4" />
          {t("create")}
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{t("createTitle")}</DrawerTitle>
        </DrawerHeader>
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="mx-auto w-full max-w-lg space-y-4 px-4 pb-8"
        >
          <div className="space-y-2">
            <Label htmlFor="client_id">{t("fieldClient")}</Label>
            <select
              id="client_id"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              {...register("client_id")}
            >
              <option value="">{t("selectPlaceholder")}</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {[c.first_name, c.last_name].filter(Boolean).join(" ") || c.phone || c.id}
                </option>
              ))}
            </select>
            {errors.client_id && (
              <p className="text-xs text-destructive">{errors.client_id.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="master_id">{t("fieldMaster")}</Label>
            <select
              id="master_id"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              {...register("master_id")}
            >
              <option value="">{t("selectPlaceholder")}</option>
              {masters.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.display_name}
                </option>
              ))}
            </select>
            {errors.master_id && (
              <p className="text-xs text-destructive">{errors.master_id.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="service_id">{t("fieldService")}</Label>
            <select
              id="service_id"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              {...register("service_id")}
            >
              <option value="">{t("selectPlaceholder")}</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name_i18n.en ?? s.id}
                </option>
              ))}
            </select>
            {errors.service_id && (
              <p className="text-xs text-destructive">{errors.service_id.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="starts_at_local">{t("fieldStart")}</Label>
            <Input id="starts_at_local" type="datetime-local" {...register("starts_at_local")} />
            {errors.starts_at_local && (
              <p className="text-xs text-destructive">{errors.starts_at_local.message}</p>
            )}
          </div>
          <DrawerFooter className="px-0">
            <Button type="submit" disabled={pending} data-testid="booking-create-submit">
              {t("submit")}
            </Button>
            <DrawerClose asChild>
              <Button variant="outline" type="button">
                {t("cancel")}
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
