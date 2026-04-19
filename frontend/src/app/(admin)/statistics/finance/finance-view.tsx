"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch, apiJson } from "@/lib/api";
import type { StatsFinanceResponse } from "@/types/admin-api";

import { useStatisticsPeriod } from "../statistics-context";

export function FinanceView() {
  const t = useTranslations("pages.statistics");
  const locale = useLocale();
  const { qs } = useStatisticsPeriod();

  const { data, isLoading } = useQuery({
    queryKey: ["stats", "finance", qs],
    queryFn: () => apiJson<StatsFinanceResponse>(`/stats/finance/payroll?${qs}`),
  });

  const download = async (format: "xlsx" | "pdf") => {
    const res = await apiFetch(`/stats/finance/export?${qs}&format=${format}`);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payroll.${format === "xlsx" ? "xlsx" : "pdf"}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading || !data) {
    return <Skeleton className="h-64 w-full" />;
  }

  const fmt = (s: string) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: data.currency || "EUR" }).format(
      Number.parseFloat(s),
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={() => void download("xlsx")}>
          {t("exportXlsx")}
        </Button>
        <Button type="button" variant="secondary" onClick={() => void download("pdf")}>
          {t("exportPdf")}
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t("financeTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-lg font-medium">
            {t("financeTotal")}:{" "}
            {new Intl.NumberFormat(locale, { style: "currency", currency: data.currency || "EUR" }).format(
              data.total_payroll,
            )}
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("colMaster")}</TableHead>
                <TableHead>{t("colRevenue")}</TableHead>
                <TableHead>{t("colPayroll")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((r) => (
                <TableRow key={r.master_id}>
                  <TableCell>{r.display_name}</TableCell>
                  <TableCell>{fmt(r.revenue)}</TableCell>
                  <TableCell>{fmt(r.payroll_amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
