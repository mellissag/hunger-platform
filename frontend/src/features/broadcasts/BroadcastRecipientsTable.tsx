"use client";

import { Check, Download, Minus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import type { BroadcastRecipient } from "@/hooks/useBroadcasts";

function errorLabel(t: (key: string) => string, code: string | null | undefined): string {
  if (!code) return "—";
  const map: Record<string, string> = {
    blocked: t("error_blocked"),
    deactivated: t("error_deactivated"),
    not_found: t("error_not_found"),
    other: t("error_other"),
  };
  return map[code] ?? t("error_other");
}

function statusLabel(t: (key: string) => string, status: string): string {
  if (status === "delivered") return t("status_delivered");
  if (status === "failed") return t("status_failed");
  if (status === "sent") return t("status_pending");
  return status;
}

export function BroadcastRecipientsTable({ recipients }: { recipients: BroadcastRecipient[] }) {
  const t = useTranslations("pages.broadcasts.stats");
  const locale = useLocale();
  const [filter, setFilter] = useState<"all" | "delivered" | "failed">("all");
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    let list = recipients;
    if (filter === "delivered") {
      list = list.filter((x) => x.status === "delivered" || x.status === "sent");
    } else if (filter === "failed") {
      list = list.filter((x) => x.status === "failed");
    }
    const needle = q.trim().toLowerCase();
    if (needle) {
      list = list.filter((x) => (x.client_name ?? "").toLowerCase().includes(needle));
    }
    return list;
  }, [filter, q, recipients]);

  const exportCsv = () => {
    const header = [
      t("col_name"),
      t("col_status"),
      t("col_sent_at"),
      t("col_clicked"),
      t("col_bot_opened"),
      t("col_booking"),
      t("col_error"),
    ];
    const lines = rows.map((r) =>
      [
        r.client_name ?? "",
        r.status,
        r.sent_at ?? "",
        r.clicked_at ? "1" : "",
        r.bot_opened_at ? "1" : "",
        r.booking_id ?? "",
        r.error_type ?? "",
      ]
        .map((c) => `"${String(c).replace(/"/g, '""')}"`)
        .join(","),
    );
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "broadcast-recipients.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const deliveredCount = recipients.filter((x) => x.status === "delivered" || x.status === "sent").length;
  const failedCount = recipients.filter((x) => x.status === "failed").length;

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="font-playfair text-lg">{t("recipients_title")}</CardTitle>
          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={exportCsv}>
            <Download className="h-4 w-4" aria-hidden />
            {t("export_csv")}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant={filter === "all" ? "default" : "secondary"}
            size="sm"
            onClick={() => setFilter("all")}
          >
            {t("filter_all")} ({recipients.length})
          </Button>
          <Button
            type="button"
            variant={filter === "delivered" ? "default" : "secondary"}
            size="sm"
            onClick={() => setFilter("delivered")}
          >
            {t("filter_delivered")} ({deliveredCount})
          </Button>
          <Button
            type="button"
            variant={filter === "failed" ? "default" : "secondary"}
            size="sm"
            onClick={() => setFilter("failed")}
          >
            {t("filter_failed")} ({failedCount})
          </Button>
        </div>
        <Input
          placeholder={t("search_placeholder")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-sm"
        />
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="py-2 pr-3 font-medium">{t("col_name")}</th>
              <th className="py-2 pr-3 font-medium">{t("col_status")}</th>
              <th className="py-2 pr-3 font-medium">{t("col_sent_at")}</th>
              <th className="py-2 pr-3 font-medium">{t("col_clicked")}</th>
              <th className="py-2 pr-3 font-medium">{t("col_bot_opened")}</th>
              <th className="py-2 pr-3 font-medium">{t("col_booking")}</th>
              <th className="py-2 font-medium">{t("col_error")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-muted-foreground">
                  {t("no_data")}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.client_id} className="border-b border-border/80">
                  <td className="py-2 pr-3">{r.client_name ?? "—"}</td>
                  <td className="py-2 pr-3">{statusLabel(t, r.status)}</td>
                  <td className="py-2 pr-3 text-muted-foreground tabular-nums">
                    {r.sent_at
                      ? new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(
                          new Date(r.sent_at),
                        )
                      : "—"}
                  </td>
                  <td className="py-2 pr-3">
                    {r.clicked_at ? <Check className="h-4 w-4 text-emerald-600" aria-label="yes" /> : <Minus className="h-4 w-4 text-muted-foreground" aria-label="no" />}
                  </td>
                  <td className="py-2 pr-3">
                    {r.bot_opened_at ? (
                      <Check className="h-4 w-4 text-emerald-600" aria-label="yes" />
                    ) : (
                      <Minus className="h-4 w-4 text-muted-foreground" aria-label="no" />
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    {r.booking_id ? (
                      <Link href="/bookings" className="text-primary underline underline-offset-2">
                        {r.booking_id.slice(0, 8)}…
                      </Link>
                    ) : (
                      <Minus className="h-4 w-4 text-muted-foreground" aria-label="no" />
                    )}
                  </td>
                  <td className="py-2 text-muted-foreground">{r.status === "failed" ? errorLabel(t, r.error_type) : "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
