"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiJson } from "@/lib/api";
import type { SalarySettings } from "@/types/admin-api";

type Props = {
  masterId: string;
  sampleRevenue?: number;
};

export function MasterSalarySection({ masterId, sampleRevenue = 4200 }: Props) {
  const t = useTranslations("pages.reports");
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["salary-settings", masterId],
    queryFn: () => apiJson<SalarySettings>(`/admin/masters/${masterId}/salary-settings`),
  });

  const [salaryType, setSalaryType] = useState<"percent" | "fixed" | "mixed">("percent");
  const [percentValue, setPercentValue] = useState("40");
  const [fixedAmount, setFixedAmount] = useState("");
  const [monthlyNorm, setMonthlyNorm] = useState("");

  useEffect(() => {
    if (!data) return;
    setSalaryType(data.salary_type);
    if (data.percent_value != null) setPercentValue(String(data.percent_value));
    if (data.fixed_amount != null) setFixedAmount(String(data.fixed_amount));
    if (data.monthly_norm != null) setMonthlyNorm(String(data.monthly_norm));
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      apiJson(`/admin/masters/${masterId}/salary-settings`, {
        method: "PUT",
        body: JSON.stringify({
          salary_type: salaryType,
          percent_value: percentValue ? Number(percentValue) : null,
          fixed_amount: fixedAmount ? Number(fixedAmount) : null,
          monthly_norm: monthlyNorm ? Number(monthlyNorm) : null,
        }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["salary-settings", masterId] });
      toast.success(t("saved"));
    },
    onError: () => toast.error(t("saveError")),
  });

  const hint = useMemo(() => {
    const rev = sampleRevenue;
    if (salaryType === "fixed" && fixedAmount) {
      return t("hintFixed", { amount: fixedAmount });
    }
    if (salaryType === "percent" && percentValue) {
      const sal = ((rev * Number(percentValue)) / 100).toFixed(0);
      return t("hintPercent", { revenue: rev, salary: sal });
    }
    if (salaryType === "mixed" && fixedAmount && monthlyNorm && percentValue) {
      const norm = Number(monthlyNorm);
      const base = Number(fixedAmount);
      const sal =
        rev <= norm ? base : base + ((rev - norm) * Number(percentValue)) / 100;
      return t("hintMixed", {
        base: fixedAmount,
        norm: monthlyNorm,
        pct: percentValue,
        salary: sal.toFixed(0),
      });
    }
    return null;
  }, [salaryType, percentValue, fixedAmount, monthlyNorm, sampleRevenue, t]);

  return (
    <Card className="rounded-[2px]">
      <CardHeader>
        <CardTitle className="font-serif text-lg">{t("salarySection")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>{t("salaryType")}</Label>
          <Select value={salaryType} onValueChange={(v) => setSalaryType(v as typeof salaryType)}>
            <SelectTrigger className="mt-1 h-9 rounded-[2px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="percent">{t("stype_percent")}</SelectItem>
              <SelectItem value="fixed">{t("stype_fixed")}</SelectItem>
              <SelectItem value="mixed">{t("stype_mixed")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {(salaryType === "percent" || salaryType === "mixed") && (
          <div>
            <Label>{t("percentOfRevenue")}</Label>
            <Input
              type="number"
              className="mt-1 h-9 rounded-[2px]"
              value={percentValue}
              onChange={(e) => setPercentValue(e.target.value)}
            />
          </div>
        )}
        {(salaryType === "fixed" || salaryType === "mixed") && (
          <div>
            <Label>{t("fixedSalary")}</Label>
            <Input
              type="number"
              className="mt-1 h-9 rounded-[2px]"
              value={fixedAmount}
              onChange={(e) => setFixedAmount(e.target.value)}
            />
          </div>
        )}
        {salaryType === "mixed" && (
          <div>
            <Label>{t("revenueNorm")}</Label>
            <Input
              type="number"
              className="mt-1 h-9 rounded-[2px]"
              value={monthlyNorm}
              onChange={(e) => setMonthlyNorm(e.target.value)}
            />
          </div>
        )}
        {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
        <Button
          type="button"
          className="h-9 rounded-[2px] bg-[#C9A84C]"
          disabled={save.isPending}
          onClick={() => save.mutate()}
        >
          {t("save")}
        </Button>
      </CardContent>
    </Card>
  );
}
