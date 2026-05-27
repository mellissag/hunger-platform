"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { apiFetch, apiJson } from "@/lib/api";
import type { ReportsSalaries } from "@/types/admin-api";
import { cn } from "@/lib/utils";

import { useReportsPeriod } from "../reports-context";

export function SalariesView() {
  const t = useTranslations("pages.reports");
  const locale = useLocale();
  const { qs, from, to } = useReportsPeriod();
  const qc = useQueryClient();
  const [payRow, setPayRow] = useState<ReportsSalaries["masters"][0] | null>(null);
  const [paidAmount, setPaidAmount] = useState("");
  const [note, setNote] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["reports", "salaries", qs],
    queryFn: () => apiJson<ReportsSalaries>(`/reports/salaries?${qs}`),
  });

  const fmt = (s: string) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(
      Number.parseFloat(s),
    );

  const markPaid = useMutation({
    mutationFn: async () => {
      if (!payRow) return;
      return apiJson("/reports/salaries/mark-paid", {
        method: "POST",
        body: JSON.stringify({
          master_id: payRow.master_id,
          period_start: from,
          period_end: to,
          paid_amount: paidAmount || payRow.calculated_salary,
          note: note || null,
        }),
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["reports", "salaries"] });
      setPayRow(null);
      toast.success(t("paid"));
    },
  });

  const downloadPdf = async () => {
    const res = await apiFetch(`/reports/export/salaries?${qs}&format=pdf`);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "salaries.pdf";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading || !data) return <Skeleton className="h-64 w-full" />;

  const remaining =
    Number.parseFloat(data.total_calculated) - Number.parseFloat(data.total_paid);

  return (
    <div className="space-y-4">
      <Button
        type="button"
        variant="outline"
        className="h-9 rounded-[2px] text-xs font-semibold uppercase"
        onClick={() => void downloadPdf()}
      >
        {t("exportPdf")}
      </Button>

      <p className="text-sm text-[#4B5563]">
        {t("toPay")}: <strong>{fmt(data.total_calculated)}</strong> · {t("paidSum")}:{" "}
        <strong>{fmt(data.total_paid)}</strong> · {t("remainder")}:{" "}
        <strong>{fmt(String(remaining))}</strong>
      </p>

      <div className="rounded-[2px] border border-[#E5E7EB] bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("master")}</TableHead>
              <TableHead>{t("salaryType")}</TableHead>
              <TableHead className="text-right">{t("revenue")}</TableHead>
              <TableHead className="text-right">{t("bookings")}</TableHead>
              <TableHead className="text-right">{t("salary")}</TableHead>
              <TableHead>{t("status")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.masters.map((m) => (
              <TableRow
                key={m.master_id}
                className={cn(!m.paid && "bg-[#FEF3C7]/40")}
              >
                <TableCell>{m.name}</TableCell>
                <TableCell>{t(`stype_${m.salary_type}`)}</TableCell>
                <TableCell className="text-right">{fmt(m.revenue)}</TableCell>
                <TableCell className="text-right">{m.bookings_count}</TableCell>
                <TableCell className="text-right font-medium">
                  {fmt(m.calculated_salary)}
                </TableCell>
                <TableCell>
                  {m.paid ? (
                    <span className="text-[#16A34A]">✓ {t("paid")}</span>
                  ) : (
                    <span className="text-[#B45309]">⚠ {t("notPaid")}</span>
                  )}
                </TableCell>
                <TableCell>
                  {!m.paid && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 rounded-[2px] text-xs"
                      onClick={() => {
                        setPayRow(m);
                        setPaidAmount(m.calculated_salary);
                        setNote("");
                      }}
                    >
                      {t("markPaid")}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!payRow} onOpenChange={(o) => !o && setPayRow(null)}>
        <DialogContent className="rounded-[2px]">
          <DialogHeader>
            <DialogTitle className="font-serif">{t("markPaid")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t("amount")}</Label>
              <Input
                className="mt-1 h-9 rounded-[2px]"
                value={paidAmount}
                onChange={(e) => setPaidAmount(e.target.value)}
              />
            </div>
            <div>
              <Label>{t("note")}</Label>
              <Input
                className="mt-1 h-9 rounded-[2px]"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              className="h-9 rounded-[2px] bg-[#C9A84C]"
              disabled={markPaid.isPending}
              onClick={() => markPaid.mutate()}
            >
              {t("confirmPay")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
