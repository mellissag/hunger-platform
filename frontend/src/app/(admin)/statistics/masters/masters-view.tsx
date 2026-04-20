"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import type { StatsMastersResponse } from "@/types/admin-api";

import { useStatisticsPeriod } from "../statistics-context";

export function MastersStatsView() {
  const t = useTranslations("pages.statistics");
  const locale = useLocale();
  const { qs } = useStatisticsPeriod();

  const { data, isLoading } = useQuery({
    queryKey: ["stats", "masters", qs],
    queryFn: () => apiJson<StatsMastersResponse>(`/stats/masters?${qs}`),
  });

  if (isLoading || !data) {
    return <Skeleton className="h-64 w-full" />;
  }

  const fmt = (s: string) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(
      Number.parseFloat(s),
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("mastersTable")}</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("colMaster")}</TableHead>
              <TableHead>{t("colRevenue")}</TableHead>
              <TableHead>{t("colBookings")}</TableHead>
              <TableHead>{t("colRating")}</TableHead>
              <TableHead>{t("colUtil")}</TableHead>
              <TableHead>{t("colPayroll")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.masters.map((m) => (
              <TableRow key={m.master_id}>
                <TableCell className="font-medium">{m.display_name}</TableCell>
                <TableCell>{fmt(m.revenue)}</TableCell>
                <TableCell>{m.completed_bookings}</TableCell>
                <TableCell>{m.rating_avg ?? "—"}</TableCell>
                <TableCell>{m.utilization_pct}%</TableCell>
                <TableCell>{fmt(m.payroll_amount)}</TableCell>
                <TableCell>
                  <Button variant="secondary" size="sm" asChild>
                    <Link href={`/statistics/masters/${m.master_id}?${qs}`}>{t("openDetail")}</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
