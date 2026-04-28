"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useBroadcastRecipients } from "@/hooks/useBroadcasts";
import { apiJson } from "@/lib/api";
import type { BroadcastOut } from "@/types/admin-api";
import { useQuery } from "@tanstack/react-query";

export function BroadcastAnalytics({ id }: { id: string }) {
  const t = useTranslations("pages.broadcasts");
  const locale = useLocale();
  const [filter, setFilter] = useState<"all" | "delivered" | "error">("all");
  const { data: broadcast, isLoading: bLoading } = useQuery({
    queryKey: ["broadcast", id],
    queryFn: () => apiJson<BroadcastOut>(`/broadcasts/${id}`),
  });
  const { data: recipients, isLoading: rLoading } = useBroadcastRecipients(id);

  const rows = useMemo(() => {
    const all = recipients ?? [];
    if (filter === "delivered") return all.filter((x) => x.status === "delivered" || x.status === "sent");
    if (filter === "error") return all.filter((x) => x.status === "failed");
    return all;
  }, [filter, recipients]);

  if (bLoading || rLoading || !broadcast) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-60" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const total = Number(broadcast.stats?.total ?? 0);
  const delivered = Number(broadcast.stats?.delivered ?? 0);
  const sent = Number(broadcast.stats?.sent ?? 0);
  const failed = Number(broadcast.stats?.failed ?? 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/broadcasts">← {t("back")}</Link>
          </Button>
          <h1 className="mt-1 font-playfair text-2xl">{broadcast.title}</h1>
          <p className="text-sm text-muted-foreground">
            {new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(
              new Date(broadcast.sent_at ?? broadcast.scheduled_at ?? broadcast.created_at),
            )}
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <StatCard title={t("kpiSent")} value={String(sent)} />
        <StatCard title={t("kpiDelivered")} value={`${delivered} (${pct(delivered, total)}%)`} />
        <StatCard title={t("kpiRead")} value={`${Math.max(0, delivered - failed)} (${pct(Math.max(0, delivered - failed), total)}%)`} />
        <StatCard title={t("kpiErrors")} value={`${failed} (${pct(failed, total)}%)`} />
      </div>

      <div className="flex gap-2">
        <Button variant={filter === "all" ? "default" : "secondary"} size="sm" onClick={() => setFilter("all")}>
          {t("all")} ({total})
        </Button>
        <Button variant={filter === "delivered" ? "default" : "secondary"} size="sm" onClick={() => setFilter("delivered")}>
          {t("statusSent")} ({delivered})
        </Button>
        <Button variant={filter === "error" ? "default" : "secondary"} size="sm" onClick={() => setFilter("error")}>
          {t("statusFailed")} ({failed})
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="divide-y">
          {rows.map((r) => (
            <div key={r.client_id} className="flex items-center justify-between px-4 py-3 text-sm">
              <span>{r.client_name ?? "—"}</span>
              <span className="text-muted-foreground">
                {r.status} ·{" "}
                {r.sent_at
                  ? new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(new Date(r.sent_at))
                  : "—"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
      <p className="text-xs uppercase tracking-[0.08em] text-[var(--primary)]">{title}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function pct(a: number, b: number) {
  if (!b) return 0;
  return Math.round((a / b) * 100);
}
