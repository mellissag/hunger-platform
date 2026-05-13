"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import { BroadcastConversion } from "@/features/broadcasts/BroadcastConversion";
import { BroadcastEngagement } from "@/features/broadcasts/BroadcastEngagement";
import { BroadcastErrors } from "@/features/broadcasts/BroadcastErrors";
import { BroadcastFunnel } from "@/features/broadcasts/BroadcastFunnel";
import { BroadcastRecipientsTable } from "@/features/broadcasts/BroadcastRecipientsTable";
import { BroadcastSpeed } from "@/features/broadcasts/BroadcastSpeed";
import { useBroadcastStats } from "@/hooks/useBroadcasts";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const STATUS_I18N: Record<string, string> = {
  draft: "statusDraft",
  scheduled: "statusScheduled",
  sending: "statusSending",
  sent: "statusSent",
  failed: "statusFailed",
};

export function BroadcastAnalytics({ id }: { id: string }) {
  const t = useTranslations("pages.broadcasts");
  const ts = useTranslations("pages.broadcasts.stats");
  const locale = useLocale();
  const { data, isPending, isError, error } = useBroadcastStats(id);

  if (isError) {
    return (
      <div className="space-y-4 p-6">
        <p className="text-destructive">{error instanceof Error ? error.message : "Error"}</p>
        <Button variant="outline" asChild>
          <Link href="/broadcasts">{t("back")}</Link>
        </Button>
      </div>
    );
  }

  if (isPending || !data) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-10 w-60" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const { broadcast, stats, recipients } = data;
  const st = broadcast.status;
  const statusLabelKey = STATUS_I18N[st] ?? "statusDraft";

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 border-b border-border pb-4 md:flex-row md:items-start md:justify-between">
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
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{ts("header_status")}</span>
          <span className="rounded-full border border-border bg-muted/50 px-3 py-1 text-xs font-medium uppercase tracking-wide">
            {t(statusLabelKey)}
          </span>
        </div>
      </div>

      <BroadcastFunnel stats={stats} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BroadcastEngagement stats={stats} />
        <BroadcastConversion stats={stats} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BroadcastErrors stats={stats} />
        <BroadcastSpeed stats={stats} />
      </div>

      <BroadcastRecipientsTable recipients={recipients} />
    </div>
  );
}
