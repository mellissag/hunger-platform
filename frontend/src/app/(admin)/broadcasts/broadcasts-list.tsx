"use client";

import Link from "next/link";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { BarChart3, CheckCheck, CircleAlert, Eye, Plus, SendHorizonal, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

import { AdminEmptyState } from "@/components/admin/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { BroadcastOut, Paginated } from "@/types/admin-api";
import { useBroadcasts, useDeleteBroadcast } from "@/hooks/useBroadcasts";
import { cn } from "@/lib/utils";

function statusLabel(t: ReturnType<typeof useTranslations>, raw: string): string {
  switch (raw) {
    case "draft":
      return t("statusDraft");
    case "scheduled":
      return t("statusScheduled");
    case "sending":
      return t("statusSending");
    case "sent":
      return t("statusSent");
    case "failed":
      return t("statusFailed");
    default:
      return raw;
  }
}

function segmentLabel(t: ReturnType<typeof useTranslations>, seg: Record<string, unknown>): string {
  const ty = typeof seg.type === "string" ? seg.type : "";
  const map: Record<string, string> = {
    all: t("segmentAll"),
    new_last_n: t("segmentNew"),
    dormant: t("segmentDormant"),
    birthday_range: t("segmentBirthday"),
    by_service: t("segmentByService"),
    by_master: t("segmentByMaster"),
    vip: t("segmentVip"),
    regular: t("segmentRegular"),
    by_tag: t("segmentTag"),
    by_lang: t("segmentLang"),
    no_show: t("segmentNoShow"),
  };
  return map[ty] || ty || "—";
}

const statusConfig: Record<
  string,
  { labelKey: string; className: string }
> = {
  draft: { labelKey: "statusDraft", className: "bg-muted text-muted-foreground" },
  scheduled: {
    labelKey: "statusScheduled",
    className: "border border-amber-200 bg-amber-50 text-amber-700",
  },
  sending: {
    labelKey: "statusSending",
    className: "border border-blue-200 bg-blue-50 text-blue-700",
  },
  sent: { labelKey: "statusSent", className: "border border-green-200 bg-green-50 text-green-700" },
  failed: { labelKey: "statusFailed", className: "border border-red-200 bg-red-50 text-red-700" },
};

type FilterKey = "all" | "draft" | "scheduled" | "sent";

export function BroadcastsList() {
  const t = useTranslations("pages.broadcasts");
  const locale = useLocale();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<FilterKey>("all");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const pageSize = 20;

  const { data, isLoading } = useBroadcasts(page, pageSize);
  const deleteMutation = useDeleteBroadcast();

  if (isLoading && !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const total = data?.total ?? 0;
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const filtered = (data?.items ?? []).filter((x) =>
    statusFilter === "all" ? true : x.status === statusFilter,
  );
  const tabs: { key: FilterKey; label: string }[] = [
    { key: "all", label: t("segmentAll") },
    { key: "draft", label: t("statusDraft") },
    { key: "scheduled", label: t("statusScheduled") },
    { key: "sent", label: t("statusSent") },
  ];

  return (
    <>
      <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-playfair text-3xl tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button className="rounded-lg bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90" asChild>
          <Link href="/broadcasts/new">
            <Plus className="mr-1 h-4 w-4" />
            {t("new")}
          </Link>
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setStatusFilter(tab.key)}
            className={cn(
              "rounded-full border border-border px-3 py-1.5 text-sm",
              statusFilter === tab.key
                ? "border-primary bg-primary/10 text-primary"
                : "text-muted-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {!filtered.length ? (
        <div className="space-y-4">
          <AdminEmptyState title={t("empty")} description={t("emptyDesc")} />
          <div className="flex justify-center">
            <Button asChild>
              <Link href="/broadcasts/new">{t("new")}</Link>
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-3">
            {filtered.map((row) => {
              const when = row.sent_at ?? row.scheduled_at ?? row.created_at;
              const sent = Number(row.stats?.sent ?? 0);
              const delivered = Number(row.stats?.delivered ?? 0);
              const totalRecipients = Number(row.stats?.total ?? 0);
              const progress = totalRecipients > 0 ? Math.round((delivered / totalRecipients) * 100) : 0;
              const cfg = statusConfig[row.status] ?? statusConfig["draft"]!;
              return (
                <div
                  key={row.id}
                  className="rounded-xl border border-border bg-card p-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)] transition-colors hover:border-primary"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{row.title}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {(row.message_i18n[locale] ?? row.message_i18n.en ?? "").slice(0, 80)}
                      </p>
                    </div>
                    <span className={cn("rounded-full px-2.5 py-1 text-xs", cfg.className)}>
                      {t(cfg.labelKey)}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" /> {totalRecipients}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <SendHorizonal className="h-3.5 w-3.5" /> {sent}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <CheckCheck className="h-3.5 w-3.5" /> {delivered}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Eye className="h-3.5 w-3.5" /> {new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(when))}
                    </span>
                  </div>
                  {row.status === "sending" ? (
                    <div className="mt-3">
                      <div className="h-2 w-full rounded-full bg-muted">
                        <div className="h-2 rounded-full bg-primary" style={{ width: `${progress}%` }} />
                      </div>
                    </div>
                  ) : null}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="secondary" asChild>
                      <Link href={`/broadcasts/new?duplicate=${row.id}`}>{t("duplicate")}</Link>
                    </Button>
                    <Button size="sm" variant="secondary" asChild>
                      <Link href={`/broadcasts/${row.id}`}>
                        <BarChart3 className="mr-1 h-3.5 w-3.5" /> {t("analytics")}
                      </Link>
                    </Button>
                    {(row.status === "draft" || row.status === "scheduled") && (
                      <Button size="sm" variant="outline" asChild>
                        <Link href={`/broadcasts/new?edit=${row.id}`}>{t("edit")}</Link>
                      </Button>
                    )}
                    {row.status !== "sending" && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className={cn(
                              "h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10",
                              row.status === "sent" && "opacity-60",
                            )}
                            disabled={deleteMutation.isPending && deletingId === row.id}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Удалить рассылку?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Рассылка &ldquo;{row.title}&rdquo; и все данные об отправке будут удалены безвозвратно.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Отмена</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-white hover:bg-destructive/90"
                              onClick={() => {
                                setDeletingId(row.id);
                                deleteMutation.mutate(row.id, {
                                  onSuccess: () => {
                                    toast.success("Рассылка удалена");
                                    setDeletingId(null);
                                  },
                                  onError: (e) => {
                                    const msg = (e as Error).message;
                                    toast.error(
                                      msg.includes("во время отправки") || msg.includes("sending")
                                        ? "Нельзя удалить рассылку во время отправки"
                                        : msg || "Ошибка",
                                    );
                                    setDeletingId(null);
                                  },
                                });
                              }}
                            >
                              Удалить
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
            <span>
              {from}–{to} / {total}
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                ←
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={to >= total}
                onClick={() => setPage((p) => p + 1)}
              >
                →
              </Button>
            </div>
          </div>
        </>
      )}
      </div>
      <Button
        asChild
        className="fixed bottom-6 right-6 z-20 rounded-full bg-primary px-5 py-3 text-primary-foreground shadow-[0_8px_20px_rgba(154,114,48,0.28)] hover:bg-primary/90"
      >
        <Link href="/broadcasts/new">
          <Plus className="mr-1 h-4 w-4" />
          {t("new")}
        </Link>
      </Button>
    </>
  );
}
