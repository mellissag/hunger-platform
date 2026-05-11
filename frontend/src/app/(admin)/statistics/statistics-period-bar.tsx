"use client";

import { Download } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

import {
  useStatisticsPeriod,
  type PresetKey,
} from "./statistics-context";

const PRESETS: { key: PresetKey; tKey: string }[] = [
  { key: "today", tKey: "presetToday" },
  { key: "yesterday", tKey: "presetYesterday" },
  { key: "thisWeek", tKey: "presetThisWeek" },
  { key: "lastWeek", tKey: "presetLastWeek" },
  { key: "thisMonth", tKey: "presetThisMonth" },
  { key: "lastMonth", tKey: "presetLastMonth" },
  { key: "last30", tKey: "presetLast30" },
  { key: "last90", tKey: "presetLast90" },
];

export function StatisticsPeriodBar() {
  const t = useTranslations("pages.statistics");
  const { from, to, setFrom, setTo, applyPreset, activePreset, qs } = useStatisticsPeriod();

  const download = async (format: "csv" | "pdf") => {
    const res = await apiFetch(`/stats/export?${qs}&format=${format}`);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `statistics-${from}-${to}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => applyPreset(p.key)}
            className={cn(
              "rounded-md px-3 py-1 text-xs transition-colors",
              activePreset === p.key
                ? "bg-primary text-primary-foreground"
                : "bg-muted/60 text-muted-foreground hover:bg-muted",
            )}
          >
            {t(p.tKey as Parameters<typeof t>[0])}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <Label htmlFor="stat-from">{t("from")}</Label>
          <Input
            id="stat-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="stat-to">{t("to")}</Label>
          <Input
            id="stat-to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <div className="ml-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="secondary" className="gap-2">
                <Download className="h-4 w-4" />
                {t("exportButton")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => void download("csv")}>
                {t("exportCsv")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void download("pdf")}>
                {t("exportPdfFull")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
