"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { AdminEmptyState } from "@/components/admin/empty-state";
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
import type { CalendarResponse, MasterOut, Paginated } from "@/types/admin-api";

export function ScheduleView() {
  const t = useTranslations("pages.schedule");
  const locale = useLocale();
  const [weekStart, setWeekStart] = useState(() => utcStartOfDay(new Date()));

  const range = useMemo(() => {
    const from = weekStart;
    const to = utcAddDays(weekStart, 7);
    return { from, to };
  }, [weekStart]);

  const { data: mastersPg } = useQuery({
    queryKey: ["masters", "schedule"],
    queryFn: () => apiJson<Paginated<MasterOut>>("/masters?page=1&page_size=100"),
  });

  const { data: cal, isLoading } = useQuery({
    queryKey: ["schedule", "calendar", "all", range.from.toISOString(), range.to.toISOString()],
    queryFn: () =>
      apiJson<CalendarResponse>(
        `/schedule/calendar?from=${encodeURIComponent(toIsoParam(range.from))}&to=${encodeURIComponent(toIsoParam(range.to))}`,
      ),
  });

  const rows = useMemo(() => {
    const masters = mastersPg?.items ?? [];
    const bookings = cal?.bookings ?? [];
    const slots = cal?.slots ?? [];
    return masters.map((m) => {
      const bc = bookings.filter((b) => b.master_id === m.id).length;
      const sc = slots.filter((s) => s.master_id === m.id).length;
      return { master: m, bookingCount: bc, slotCount: sc };
    });
  }, [cal?.bookings, cal?.slots, mastersPg?.items]);

  if (isLoading && !cal) {
    return <Skeleton className="h-96 w-full" />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <div>
            <CardTitle>{t("weekTitle")}</CardTitle>
            <CardDescription>{t("weekDesc")}</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setWeekStart((w) => utcAddDays(w, -7))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setWeekStart((w) => utcAddDays(w, 7))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!rows.length ? (
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
                {rows.map((r) => (
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
          <p className="mt-4 text-xs text-muted-foreground">
            {t("rangeLabel", {
              from: new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(range.from),
              to: new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
                utcAddDays(range.from, 6),
              ),
            })}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
