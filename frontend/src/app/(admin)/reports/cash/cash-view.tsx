"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { ReportKpiCard } from "@/components/reports/report-kpi-card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiFetch, apiJson } from "@/lib/api";
import type { ReportsCash } from "@/types/admin-api";

import { useReportsPeriod } from "../reports-context";
import { ExpenseFormDialog } from "../expenses/expense-form-dialog";

export function CashView() {
  const t = useTranslations("pages.reports");
  const locale = useLocale();
  const { qs } = useReportsPeriod();
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [expenseOpen, setExpenseOpen] = useState(false);

  const queryQs = `${qs}&payment_method=${paymentFilter}`;

  const { data, isLoading } = useQuery({
    queryKey: ["reports", "cash", queryQs],
    queryFn: () => apiJson<ReportsCash>(`/reports/cash?${queryQs}`),
  });

  const fmt = (s: string) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(
      Number.parseFloat(s),
    );

  const download = async () => {
    const res = await apiFetch(`/reports/export/cash?${qs}&format=xlsx`);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cash.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading || !data) return <Skeleton className="h-64 w-full" />;

  const s = data.summary;
  const totalIn = Number.parseFloat(s.total_income);
  const cashPct = totalIn > 0 ? ((Number.parseFloat(s.income_cash) / totalIn) * 100).toFixed(1) : "0";
  const cardPct = totalIn > 0 ? ((Number.parseFloat(s.income_card) / totalIn) * 100).toFixed(1) : "0";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={paymentFilter} onValueChange={setPaymentFilter}>
          <SelectTrigger className="h-9 w-[160px] rounded-[2px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("paymentAll")}</SelectItem>
            <SelectItem value="cash">{t("paymentCash")}</SelectItem>
            <SelectItem value="card">{t("paymentCard")}</SelectItem>
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          className="h-9 rounded-[2px] text-xs font-semibold uppercase"
          onClick={() => setExpenseOpen(true)}
        >
          {t("addExpense")}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-9 rounded-[2px] text-xs font-semibold uppercase"
          onClick={() => void download()}
        >
          {t("exportExcel")}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <ReportKpiCard label={t("income")} value={fmt(s.total_income)} accent="gold" />
        <ReportKpiCard
          label={t("cashLabel")}
          value={fmt(s.income_cash)}
          hint={`${cashPct}%`}
          accent="green"
          className="bg-[#F0FDF4]/50"
        />
        <ReportKpiCard
          label={t("cardLabel")}
          value={fmt(s.income_card)}
          hint={`${cardPct}%`}
          accent="blue"
          className="bg-[#EFF6FF]/50"
        />
        <ReportKpiCard label={t("expenses")} value={fmt(s.total_expenses)} accent="red" />
        <ReportKpiCard label={t("balance")} value={fmt(s.balance)} accent="gold" />
      </div>

      <div className="h-2 overflow-hidden rounded-[2px] bg-[#E5E7EB]">
        <div
          className="flex h-full"
          style={{
            width: "100%",
          }}
        >
          <div
            className="h-full bg-[#C9A84C]"
            style={{ width: `${cashPct}%` }}
            title={t("cashLabel")}
          />
          <div
            className="h-full bg-[#1A1A1A]"
            style={{ width: `${cardPct}%` }}
            title={t("cardLabel")}
          />
        </div>
      </div>

      <div className="rounded-[2px] border border-[#E5E7EB] bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("date")}</TableHead>
              <TableHead>{t("type")}</TableHead>
              <TableHead>{t("category")}</TableHead>
              <TableHead className="text-right">{t("amount")}</TableHead>
              <TableHead>{t("description")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.by_day.flatMap((day) =>
              day.transactions.map((tx, i) => (
                <TableRow key={`${day.date}-${i}`}>
                  <TableCell>{day.date}</TableCell>
                  <TableCell className={tx.type === "income" ? "text-[#16A34A]" : "text-[#DC2626]"}>
                    {tx.type === "income" ? t("incomeType") : t("expenseType")}
                  </TableCell>
                  <TableCell>{tx.source}</TableCell>
                  <TableCell
                    className={`text-right font-medium ${tx.type === "income" ? "text-[#16A34A]" : "text-[#DC2626]"}`}
                  >
                    {tx.type === "expense" ? "−" : ""}
                    {fmt(tx.amount)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{tx.description}</TableCell>
                </TableRow>
              )),
            )}
          </TableBody>
        </Table>
      </div>

      <ExpenseFormDialog open={expenseOpen} onOpenChange={setExpenseOpen} />
    </div>
  );
}
