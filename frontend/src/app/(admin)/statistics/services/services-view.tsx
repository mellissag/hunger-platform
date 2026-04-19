"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiJson } from "@/lib/api";
import type { StatsDeadServicesResponse, StatsServicesResponse } from "@/types/admin-api";

import { useStatisticsPeriod } from "../statistics-context";

export function ServicesStatsView() {
  const t = useTranslations("pages.statistics");
  const locale = useLocale();
  const { qs, to } = useStatisticsPeriod();

  const { data: top, isLoading: topLoading } = useQuery({
    queryKey: ["stats", "services", "top", qs],
    queryFn: () => apiJson<StatsServicesResponse>(`/stats/services/top?${qs}`),
  });

  const { data: dead, isLoading: deadLoading } = useQuery({
    queryKey: ["stats", "services", "dead", to],
    queryFn: () =>
      apiJson<StatsDeadServicesResponse>(
        `/stats/services/dead?to=${encodeURIComponent(to)}&dead_days=30`,
      ),
  });

  const loading = topLoading || deadLoading;
  if (loading || !top || !dead) {
    return <Skeleton className="h-64 w-full" />;
  }

  const name = (i18n: Record<string, string>) =>
    i18n[locale] ?? i18n.en ?? Object.values(i18n)[0] ?? "—";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("servicesTop")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Service</TableHead>
                <TableHead>{t("colRevenue")}</TableHead>
                <TableHead>{t("colBookings")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {top.top.map((s) => (
                <TableRow key={s.service_id}>
                  <TableCell>{name(s.name_i18n)}</TableCell>
                  <TableCell>{s.revenue}</TableCell>
                  <TableCell>{s.completed_bookings}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("servicesDead")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Service</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dead.dead.map((s) => (
                <TableRow key={s.service_id}>
                  <TableCell>{name(s.name_i18n)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
