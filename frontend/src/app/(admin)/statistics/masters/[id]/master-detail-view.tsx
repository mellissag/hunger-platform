"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiJson } from "@/lib/api";

import { useStatisticsPeriod } from "../../statistics-context";

export function MasterDetailView({ masterId }: { masterId: string }) {
  const t = useTranslations("pages.statistics");
  const locale = useLocale();
  const sp = useSearchParams();
  const { qs: ctxQs } = useStatisticsPeriod();
  const qs = sp.toString() || ctxQs;

  const { data, isLoading } = useQuery({
    queryKey: ["stats", "master", masterId, qs],
    queryFn: () => apiJson<Record<string, unknown>>(`/stats/masters/${masterId}?${qs}`),
  });

  if (isLoading || !data) {
    return <Skeleton className="h-40 w-full" />;
  }

  const fmt = (s: string) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(
      Number.parseFloat(s),
    );

  return (
    <div className="space-y-4">
      <Button variant="secondary" asChild>
        <Link href={`/statistics/masters?${qs}`}>← {t("mastersTable")}</Link>
      </Button>
      <Card>
        <CardHeader>
          <CardTitle>{String(data.display_name ?? "")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          <div>
            <span className="text-muted-foreground">{t("colRevenue")}: </span>
            {fmt(String(data.revenue ?? "0"))}
          </div>
          <div>
            <span className="text-muted-foreground">{t("colBookings")}: </span>
            {String(data.completed_bookings ?? 0)}
          </div>
          <div>
            <span className="text-muted-foreground">{t("colPayroll")}: </span>
            {fmt(String(data.payroll_amount ?? "0"))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
