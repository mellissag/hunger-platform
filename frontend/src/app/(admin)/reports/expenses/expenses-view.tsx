"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
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
import type { ReportExpense } from "@/types/admin-api";

import { useReportsPeriod } from "../reports-context";
import { ExpenseFormDialog } from "./expense-form-dialog";

export function ExpensesView() {
  const t = useTranslations("pages.reports");
  const locale = useLocale();
  const { qs } = useReportsPeriod();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<ReportExpense | undefined>();

  const { data, isLoading } = useQuery({
    queryKey: ["reports", "expenses", qs],
    queryFn: () => apiJson<ReportExpense[]>(`/reports/expenses?${qs}`),
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      apiJson(`/reports/expenses/${id}`, { method: "DELETE" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["reports"] }),
  });

  const fmt = (s: string) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(
      Number.parseFloat(s),
    );

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  const items = data ?? [];
  const byCat = items.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] ?? 0) + Number.parseFloat(e.amount);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <Button
        type="button"
        className="h-9 rounded-[2px] bg-[#C9A84C] text-xs font-semibold uppercase"
        onClick={() => {
          setEdit(undefined);
          setOpen(true);
        }}
      >
        {t("addExpense")}
      </Button>

      <div className="flex flex-wrap gap-2">
        {Object.entries(byCat).map(([cat, sum]) => (
          <div
            key={cat}
            className="rounded-[2px] border border-[#E5E7EB] bg-white px-3 py-2 text-xs shadow-sm"
          >
            <span className="text-[#6B7280]">{t(`cat_${cat}`)}</span>{" "}
            <span className="font-semibold">{fmt(String(sum))}</span>
          </div>
        ))}
      </div>

      <div className="rounded-[2px] border border-[#E5E7EB] bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("date")}</TableHead>
              <TableHead>{t("category")}</TableHead>
              <TableHead className="text-right">{t("amount")}</TableHead>
              <TableHead>{t("description")}</TableHead>
              <TableHead>{t("addedBy")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((e) => (
              <TableRow key={e.id}>
                <TableCell>{e.date}</TableCell>
                <TableCell>{t(`cat_${e.category}`)}</TableCell>
                <TableCell className="text-right">{fmt(e.amount)}</TableCell>
                <TableCell>{e.description}</TableCell>
                <TableCell className="text-muted-foreground">
                  {e.created_by_name ?? "—"}
                </TableCell>
                <TableCell className="space-x-1 text-right">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8"
                    onClick={() => {
                      setEdit(e);
                      setOpen(true);
                    }}
                  >
                    {t("edit")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 text-destructive"
                    onClick={() => remove.mutate(e.id)}
                  >
                    {t("delete")}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ExpenseFormDialog
        open={open}
        onOpenChange={setOpen}
        edit={
          edit
            ? {
                id: edit.id,
                category: edit.category,
                amount: edit.amount,
                description: edit.description,
                date: edit.date,
              }
            : undefined
        }
      />
    </div>
  );
}
