"use client";

import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useBooking, useCancelBooking, useConfirmBooking, usePatchBooking } from "@/hooks/useBookings";
import { useDebounce } from "@/hooks/useDebounce";
import { durationMinutes } from "@/lib/date-local";
import type { BookingDetailOut } from "@/types/admin-api";
import { cn } from "@/lib/utils";

function initials(c: { first_name: string | null; last_name: string | null }): string {
  const a = c.first_name?.[0] ?? "";
  const b = c.last_name?.[0] ?? "";
  return (a + b).toUpperCase() || "?";
}

const STATUS_OPTIONS = ["pending", "confirmed", "completed", "no_show"] as const;

type Props = {
  bookingId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  salonTz: string;
  onEdit?: (id: string) => void;
};

export function BookingDetailDrawer({
  bookingId,
  open,
  onOpenChange,
  salonTz,
  onEdit,
}: Props) {
  const locale = useLocale();
  const t = useTranslations("pages.bookings");
  const qc = useQueryClient();
  const { data, isLoading, isError, error, refetch } = useBooking(bookingId);
  const patch = usePatchBooking();
  const cancel = useCancelBooking();
  const confirm = useConfirmBooking();

  const [notes, setNotes] = useState("");
  const debouncedNotes = useDebounce(notes, 600);
  const lastSaved = useRef<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);

  // Stable ref to always-current patch.mutate — prevents it from being a dep
  const patchMutateRef = useRef(patch.mutate);
  useEffect(() => { patchMutateRef.current = patch.mutate; });

  useEffect(() => {
    if (data?.notes != null) {
      setNotes(data.notes);
      lastSaved.current = data.notes;
    } else {
      setNotes("");
      lastSaved.current = "";
    }
  }, [data?.id, data?.notes]);

  useEffect(() => {
    if (!bookingId || !open) return;
    if (debouncedNotes === (data?.notes ?? "")) return;
    if (debouncedNotes === lastSaved.current) return;
    patchMutateRef.current(
      { id: bookingId, body: { notes: debouncedNotes || null } },
      {
        onSuccess: () => {
          lastSaved.current = debouncedNotes;
        },
        onError: () => {
          toast.error(t("notesSaveError"));
        },
      },
    );
  // patch.mutate via ref — не нужен как зависимость
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedNotes, bookingId, open, data?.notes, t]);

  const onStatusChange = (next: string) => {
    if (!bookingId || !data) return;
    const prev = data;
    qc.setQueryData<BookingDetailOut>(["bookings", "detail", bookingId], {
      ...prev,
      status: next,
    });
    patch.mutate(
      { id: bookingId, body: { status: next } },
      {
        onError: () => {
          qc.setQueryData(["bookings", "detail", bookingId], prev);
          toast.error(t("statusError"));
        },
      },
    );
  };

  const fmtWhen = useMemo(() => {
    if (!data?.starts_at) return data?.needs_consultation ? "Созвон (уточняется)" : "—";
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: salonTz,
    }).format(new Date(data.starts_at));
  }, [data, locale, salonTz]);

  const dur = data?.starts_at && data?.ends_at ? durationMinutes(data.starts_at, data.ends_at) : 0;

  const tgDomain = data?.client.tg_username?.replace(/^@/, "") ?? "";

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange} direction="right" shouldScaleBackground={false}>
        <DrawerContent className="left-auto right-2 top-2 z-50 ml-auto flex h-[calc(100vh-16px)] w-full max-w-[480px] flex-col rounded-lg border bg-background p-0 shadow-xl data-[vaul-drawer-direction=right]:mt-0 data-[vaul-drawer-direction=right]:max-w-[480px]">
          <DrawerHeader className="border-b border-border px-6 text-left">
            <div className="flex items-center justify-between gap-2">
              <DrawerTitle className="font-playfair text-xl font-medium">
                {data ? t("detailTitle", { id: shortId(data.id) }) : t("detailLoadingTitle")}
              </DrawerTitle>
              <DrawerClose asChild>
                <button
                  type="button"
                  aria-label="Закрыть"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </DrawerClose>
            </div>
          </DrawerHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            {isLoading && (
              <div className="space-y-4">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            )}
            {isError && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
                <p>{error instanceof Error ? error.message : t("errorLoad")}</p>
                <Button variant="outline" size="sm" className="mt-2" onClick={() => refetch()}>
                  {t("retry")}
                </Button>
              </div>
            )}
            {data && !isLoading && (
              <div className="space-y-6">
                <div className="flex gap-3">
                  <div
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-medium text-white"
                    style={{ background: data.master.color_hex }}
                  >
                    {initials(data.client)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium leading-tight">
                      {[data.client.first_name, data.client.last_name].filter(Boolean).join(" ") ||
                        t("unnamedClient")}
                    </p>
                    <p className="text-xs text-muted-foreground">{data.client.phone ?? "—"}</p>
                    {data.client.tg_username && (
                      <p className="text-xs text-muted-foreground">@{data.client.tg_username}</p>
                    )}
                    {tgDomain && (
                      <a
                        className="mt-1 inline-flex text-xs font-medium text-primary underline"
                        href={`tg://resolve?domain=${encodeURIComponent(tgDomain)}`}
                      >
                        {t("writeTg")}
                      </a>
                    )}
                  </div>
                </div>

                <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3 text-sm">
                  <Row label={t("detailService")} value={pickName(data.service.name_i18n, locale)} />
                  <Row label={t("detailMaster")} value={data.master.display_name} />
                  <Row label={t("detailWhen")} value={fmtWhen} />
                  <Row label={t("detailDuration")} value={t("durationMin", { n: dur })} />
                  <Row label={t("detailPrice")} value={`€${data.price}`} />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide",
                      statusPillClass(data.status),
                    )}
                  >
                    {data.status}
                  </span>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs">{t("changeStatus")}</Label>
                    <select
                      className="h-9 rounded-md border border-input bg-background px-2 text-xs"
                      value={
                        STATUS_OPTIONS.includes(data.status as (typeof STATUS_OPTIONS)[number])
                          ? data.status
                          : "confirmed"
                      }
                      onChange={(e) => onStatusChange(e.target.value)}
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">{t("fieldNotes")}</Label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} />
                </div>

                {data.status === "pending" && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
                    <p className="mb-2 text-xs font-medium text-amber-700">
                      ⏳ Запись ожидает подтверждения
                    </p>
                    <Button
                      type="button"
                      className="w-full gap-2 bg-green-600 text-white hover:bg-green-700"
                      disabled={confirm.isPending}
                      onClick={() =>
                        confirm.mutate(data.id, {
                          onSuccess: () => {
                            toast.success("Запись подтверждена ✓");
                            void qc.invalidateQueries({ queryKey: ["bookings", "detail", data.id] });
                          },
                        })
                      }
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Подтвердить запись
                    </Button>
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  {onEdit && (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        onEdit(data.id);
                        onOpenChange(false);
                      }}
                    >
                      {t("reschedule")}
                    </Button>
                  )}
                  <Button type="button" variant="destructive" onClick={() => setCancelOpen(true)}>
                    {t("cancelBooking")}
                  </Button>
                  <DrawerClose asChild>
                    <Button type="button" variant="outline">
                      {t("close")}
                    </Button>
                  </DrawerClose>
                </div>
              </div>
            )}
          </div>
        </DrawerContent>
      </Drawer>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("confirmCancelTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t("confirmCancelBody")}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>
              {t("back")}
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!bookingId) return;
                await cancel.mutateAsync({ id: bookingId, reason: null });
                setCancelOpen(false);
                onOpenChange(false);
                toast.success(t("toastCancelled"));
              }}
            >
              {t("confirmCancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function pickName(m: Record<string, string>, locale: string) {
  return m[locale] ?? m.en ?? Object.values(m)[0] ?? "—";
}

function shortId(id: string) {
  return id.replace(/-/g, "").slice(0, 8);
}

function statusPillClass(status: string) {
  if (status.includes("cancel")) return "bg-red-500/15 text-red-700";
  if (status === "completed") return "bg-emerald-500/15 text-emerald-800";
  if (status === "no_show") return "bg-amber-500/15 text-amber-900";
  return "bg-[hsl(37_53%_40%/0.15)] text-[hsl(37_40%_25%)]";
}
