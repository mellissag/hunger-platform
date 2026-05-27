"use client";

import { useTranslations } from "next-intl";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useReportsPeriod, type ReportsPreset } from "./reports-context";

const PRESETS: ReportsPreset[] = ["thisMonth", "lastMonth", "quarter", "custom"];

export function ReportsPeriodBar() {
  const t = useTranslations("pages.reports");
  const { preset, setPreset, from, to, setCustomRange } = useReportsPeriod();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={preset} onValueChange={(v) => setPreset(v as ReportsPreset)}>
        <SelectTrigger className="h-9 w-[200px] rounded-[2px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PRESETS.map((p) => (
            <SelectItem key={p} value={p}>
              {t(`period_${p}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {preset === "custom" && (
        <>
          <Input
            type="date"
            className="h-9 w-[140px] rounded-[2px]"
            value={from}
            onChange={(e) => setCustomRange(e.target.value, to)}
          />
          <span className="text-muted-foreground">—</span>
          <Input
            type="date"
            className="h-9 w-[140px] rounded-[2px]"
            value={to}
            onChange={(e) => setCustomRange(from, e.target.value)}
          />
        </>
      )}
    </div>
  );
}
