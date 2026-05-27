"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { ReportKpiCard } from "@/components/reports/report-kpi-card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiFetch, apiJson } from "@/lib/api";
import type { ReportsPnl } from "@/types/admin-api";

import { useReportsPeriod } from "../reports-context";

export function PnlView() {
  const t = useTranslations("pages.reports");
  const locale = useLocale();
  const { qs } = useReportsPeriod();

  const { data, isLoading } = useQuery({
    queryKey: ["reports", "pnl", qs],
    queryFn: () => apiJson<ReportsPnl>(`/reports/pnl?${qs}`),
  });

  const fmt = (s: string) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(
      Number.parseFloat(s),
    );

  const download = async (format: "xlsx") => {
    const res = await apiFetch(`/reports/export/pnl?${qs}&format=${format}`);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pnl.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading || !data) return <Skeleton className="h-64 w-full" />;

  const growth = data.growth_percent;
  const growthHint =
    growth != null
      ? `${growth >= 0 ? "↑" : "↓"} ${Math.abs(growth)}% ${t("vsPrev")}`
      : undefined;

  const expenseRows: { key: keyof ReportsPnl["expenses"]; label: string }[] = [
    { key: "salaries", label: t("expSalaries") },
    { key: "rent", label: t("expRent") },
    { key: "utilities", label: t("expUtilities") },
    { key: "supplies", label: t("expSupplies") },
    { key: "advertising", label: t("expAdvertising") },
    { key: "equipment", label: t("expEquipment") },
    { key: "taxes", label: t("expTaxes") },
    { key: "software", label: t("expSoftware") },
    { key: "training", label: t("expTraining") },
    { key: "other", label: t("expOther") },
  ];

  const revTotal = Number.parseFloat(data.revenue.total);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          className="h-9 rounded-[2px] bg-[#C9A84C] text-xs font-semibold uppercase tracking-wider text-[#1A1A1A] hover:bg-[#C9A84C]/90"
          onClick={() => void download("xlsx")}
        >
          {t("exportExcel")}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <ReportKpiCard label={t("revenue")} value={fmt(data.revenue.total)} accent="gold" />
        <ReportKpiCard label={t("expenses")} value={fmt(data.expenses.total)} accent="red" />
        <ReportKpiCard
          label={t("profit")}
          value={fmt(data.gross_profit)}
          hint={growthHint}
          accent="green"
        />
        <ReportKpiCard
          label={t("margin")}
          value={`${data.profit_margin_percent}%`}
          accent="blue"
        />
      </div>

      <div className="rounded-[2px] border border-[#E5E7EB] bg-white p-4 shadow-sm">
        <h2 className="mb-3 font-serif text-lg font-bold">{t("expenseStructure")}</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[10px] uppercase tracking-widest text-[#6B7280]">
                {t("category")}
              </TableHead>
              <TableHead className="text-right text-[10px] uppercase tracking-widest text-[#6B7280]">
                {t("amount")}
              </TableHead>
              <TableHead className="text-right text-[10px] uppercase tracking-widest text-[#6B7280]">
                % {t("revenue")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {expenseRows.map(({ key, label }) => {
              const amt = Number.parseFloat(data.expenses[key]);
              const pct = revTotal > 0 ? ((amt / revTotal) * 100).toFixed(1) : "0";
              return (
                <TableRow key={key}>
                  <TableCell>{label}</TableCell>
                  <TableCell className="text-right">{fmt(String(amt))}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{pct}%</TableCell>
                </TableRow>
              );
            })}
            <TableRow className="font-semibold">
              <TableCell>{t("total")}</TableCell>
              <TableCell className="text-right">{fmt(data.expenses.total)}</TableCell>
              <TableCell className="text-right">
                {revTotal > 0
                  ? ((Number.parseFloat(data.expenses.total) / revTotal) * 100).toFixed(1)
                  : "0"}
                %
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
