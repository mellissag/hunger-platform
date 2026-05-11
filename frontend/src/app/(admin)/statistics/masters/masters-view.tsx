"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ArrowUpDown, Info } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { apiJson } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { StatsMasterRow, StatsMastersResponse } from "@/types/admin-api";

import { useStatisticsPeriod } from "../statistics-context";

type SortKey =
  | "display_name"
  | "revenue"
  | "completed_bookings"
  | "avg_check"
  | "rating_avg"
  | "utilization_pct"
  | "payroll_amount";
type SortDir = "asc" | "desc";

function numericVal(row: StatsMasterRow, key: SortKey): number {
  switch (key) {
    case "display_name":
      return 0;
    case "revenue":
      return Number.parseFloat(row.revenue);
    case "completed_bookings":
      return row.completed_bookings;
    case "avg_check":
      return Number.parseFloat(row.avg_check);
    case "rating_avg":
      return row.rating_avg ? Number.parseFloat(row.rating_avg) : -1;
    case "utilization_pct":
      return row.utilization_pct;
    case "payroll_amount":
      return Number.parseFloat(row.payroll_amount);
  }
}

function SortIcon({
  active,
  dir,
}: {
  active: boolean;
  dir: SortDir;
}) {
  if (!active) return <ArrowUpDown className="ml-1 inline h-3 w-3 opacity-50" />;
  return dir === "asc" ? (
    <ArrowUp className="ml-1 inline h-3 w-3" />
  ) : (
    <ArrowDown className="ml-1 inline h-3 w-3" />
  );
}

export function MastersStatsView() {
  const t = useTranslations("pages.statistics");
  const locale = useLocale();
  const { qs } = useStatisticsPeriod();

  const { data, isLoading } = useQuery({
    queryKey: ["stats", "masters", qs],
    queryFn: () => apiJson<StatsMastersResponse>(`/stats/masters?${qs}`),
  });

  const [sortKey, setSortKey] = useState<SortKey>("revenue");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const sorted = useMemo(() => {
    if (!data?.masters) return [];
    const rows = [...data.masters];
    rows.sort((a, b) => {
      if (sortKey === "display_name") {
        const cmp = a.display_name.localeCompare(b.display_name, locale);
        return sortDir === "asc" ? cmp : -cmp;
      }
      const av = numericVal(a, sortKey);
      const bv = numericVal(b, sortKey);
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return rows;
  }, [data?.masters, sortKey, sortDir, locale]);

  if (isLoading || !data) {
    return <Skeleton className="h-64 w-full" />;
  }

  const currency = data.currency || "EUR";
  const fmt = (s: string) =>
    new Intl.NumberFormat(locale, { style: "currency", currency }).format(
      Number.parseFloat(s),
    );

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(k);
      setSortDir(k === "display_name" ? "asc" : "desc");
    }
  };

  const totalRevenue = sorted.reduce(
    (a, r) => a + Number.parseFloat(r.revenue),
    0,
  );
  const totalBookings = sorted.reduce((a, r) => a + r.completed_bookings, 0);
  const salonAvg =
    totalBookings > 0 ? totalRevenue / totalBookings : 0;

  const sortableHead = (k: SortKey, label: string, extra?: React.ReactNode) => (
    <TableHead>
      <button
        type="button"
        onClick={() => toggleSort(k)}
        className={cn(
          "inline-flex items-center text-left font-medium hover:text-foreground",
          sortKey === k ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
        <SortIcon active={sortKey === k} dir={sortDir} />
      </button>
      {extra}
    </TableHead>
  );

  if (sorted.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("mastersTable")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <Card>
        <CardHeader>
          <CardTitle>{t("mastersTable")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                {sortableHead("display_name", t("colMaster"))}
                {sortableHead("revenue", t("colRevenue"))}
                {sortableHead("completed_bookings", t("colBookings"))}
                {sortableHead("avg_check", t("colAvgCheck"))}
                {sortableHead("rating_avg", t("colRating"))}
                {sortableHead(
                  "utilization_pct",
                  t("colUtil"),
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="ml-1 inline-flex">
                        <Info className="h-3.5 w-3.5 text-muted-foreground" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <span className="text-xs">{t("colUtilTooltip")}</span>
                    </TooltipContent>
                  </Tooltip>,
                )}
                {sortableHead("payroll_amount", t("colPayroll"))}
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((m) => (
                <TableRow key={m.master_id}>
                  <TableCell className="font-medium">{m.display_name}</TableCell>
                  <TableCell>{fmt(m.revenue)}</TableCell>
                  <TableCell>{m.completed_bookings}</TableCell>
                  <TableCell>{fmt(m.avg_check)}</TableCell>
                  <TableCell>
                    {m.rating_avg !== null ? (
                      m.rating_avg
                    ) : (
                      <span className="text-muted-foreground">{t("noRatings")}</span>
                    )}
                  </TableCell>
                  <TableCell>{m.utilization_pct}%</TableCell>
                  <TableCell>{fmt(m.payroll_amount)}</TableCell>
                  <TableCell>
                    <Button variant="secondary" size="sm" asChild>
                      <Link href={`/statistics/masters/${m.master_id}?${qs}`}>
                        {t("openDetail")}
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/30 font-semibold">
                <TableCell>{t("totalRow")}</TableCell>
                <TableCell>{fmt(totalRevenue.toFixed(2))}</TableCell>
                <TableCell>{totalBookings}</TableCell>
                <TableCell>{fmt(salonAvg.toFixed(2))}</TableCell>
                <TableCell />
                <TableCell />
                <TableCell />
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
