"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiJson } from "@/lib/api";

import { useReportsPeriod } from "../reports-context";

const CATEGORIES = [
  "rent",
  "utilities",
  "supplies",
  "advertising",
  "equipment",
  "taxes",
  "software",
  "training",
  "salary_bonus",
  "other",
] as const;

export function ExpenseFormDialog({
  open,
  onOpenChange,
  edit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  edit?: {
    id: string;
    category: string;
    amount: string;
    description: string;
    date: string;
  };
}) {
  const t = useTranslations("pages.reports");
  const qc = useQueryClient();
  const { from } = useReportsPeriod();
  const [category, setCategory] = useState(edit?.category ?? "rent");
  const [amount, setAmount] = useState(edit?.amount ?? "");
  const [date, setDate] = useState(edit?.date ?? from);
  const [description, setDescription] = useState(edit?.description ?? "");

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        category,
        amount,
        date,
        description,
      };
      if (edit) {
        return apiJson(`/reports/expenses/${edit.id}`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
      }
      return apiJson("/reports/expenses", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["reports"] });
      toast.success(t("saved"));
      onOpenChange(false);
    },
    onError: () => toast.error(t("saveError")),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-[2px] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif">
            {edit ? t("editExpense") : t("addExpense")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>{t("category")}</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="mt-1 h-9 rounded-[2px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {t(`cat_${c}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t("amount")}</Label>
            <Input
              type="number"
              step="0.01"
              className="mt-1 h-9 rounded-[2px]"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div>
            <Label>{t("date")}</Label>
            <Input
              type="date"
              className="mt-1 h-9 rounded-[2px]"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div>
            <Label>{t("description")}</Label>
            <Textarea
              className="mt-1 rounded-[2px]"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            className="h-9 rounded-[2px] bg-[#C9A84C] uppercase tracking-wider"
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
