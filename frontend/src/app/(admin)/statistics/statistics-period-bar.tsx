"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { useStatisticsPeriod } from "./statistics-context";

export function StatisticsPeriodBar() {
  const t = useTranslations("pages.statistics");
  const { from, to, setFrom, setTo } = useStatisticsPeriod();

  return (
    <div className="mt-4 flex flex-wrap items-end gap-4">
      <div className="space-y-1">
        <Label htmlFor="stat-from">{t("from")}</Label>
        <Input id="stat-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="stat-to">{t("to")}</Label>
        <Input id="stat-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      <Button type="button" variant="secondary" className="hidden sm:inline-flex">
        {t("apply")}
      </Button>
    </div>
  );
}
