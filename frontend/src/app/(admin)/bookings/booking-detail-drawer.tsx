"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Pencil, X } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useBooking, useCancelBooking, useConfirmBooking, usePatchBooking } from "@/hooks/useBookings";
import { useDebounce } from "@/hooks/useDebounce";
import { usePermissions } from "@/hooks/usePermissions";
import { apiJson } from "@/lib/api";
import { adminBookingDurationLabel } from "@/lib/booking-duration-label";
import { durationMinutes, isoToDateInZone, isoToTimeInZone, zonedToUtcIso } from "@/lib/date-local";
import type { BookingDetailOut, MasterOut, Paginated, ServiceOut, UserMe } from "@/types/admin-api";
import { cn } from "@/lib/utils";
import type { PermUser } from "@/lib/permissions";
import { ConsultationScheduleModal } from "./consultation-schedule-modal";

type ContactContext = "bookings" | "schedule";

function showBookingClientContacts(user: PermUser | null, context: ContactContext): boolean {
  if (!user) return true;
  if (user.role === "owner" || user.role === "admin") return true;
  const b = user.page_permissions?.bookings;
  if (!b?.enabled) return false;
  if (context === "schedule") return Boolean(b.view_calendar_booking_phones);
  return Boolean(b.view_client_contacts);
}

function formatTimeInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

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
  /** Где открыт детальный просмотр: влияет на отдельные флаги прав «Бронирования». */
  contactContext?: ContactContext;
};

export function BookingDetailDrawer({
  bookingId,
  open,
  onOpenChange,
  salonTz,
  onEdit,
  contactContext = "bookings",
}: Props) {
  const locale = useLocale();
  const t = useTranslations("pages.bookings");
  const qc = useQueryClient();
  const { permUser } = usePermissions();
  const showContacts = showBookingClientContacts(permUser, contactContext);
  const { data, isLoading, isError, error, refetch } = useBooking(bookingId);
  const patch = usePatchBooking();
  const cancel = useCancelBooking();
  const confirm = useConfirmBooking();

  const [notes, setNotes] = useState("");
  const debouncedNotes = useDebounce(notes, 600);
  const lastSaved = useRef<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [priceEditOpen, setPriceEditOpen] = useState(false);
  const [durationEditOpen, setDurationEditOpen] = useState(false);
  const [datetimeEditOpen, setDatetimeEditOpen] = useState(false);
  const [draftPrice, setDraftPrice] = useState("");
  const [draftDurationMin, setDraftDurationMin] = useState("");
  const [draftDate, setDraftDate] = useState("");
  const [draftTime, setDraftTime] = useState("");
  const [assignEditOpen, setAssignEditOpen] = useState(false);
  const [draftAssignServiceId, setDraftAssignServiceId] = useState("");
  const [draftAssignMasterId, setDraftAssignMasterId] = useState("");

  const { data: me } = useQuery({
    queryKey: ["auth", "me", "booking-detail-drawer"],
    queryFn: () => apiJson<UserMe>("/auth/me"),
    staleTime: 60_000,
  });

  const { data: mastersPg } = useQuery({
    queryKey: ["masters", "all-for-detail-drawer"],
    queryFn: () => apiJson<Paginated<MasterOut>>("/masters?page=1&page_size=500"),
  });
  const { data: servicesPg } = useQuery({
    queryKey: ["services", "all-for-detail-drawer"],
    queryFn: () => apiJson<Paginated<ServiceOut>>("/services?page=1&page_size=200"),
  });

  const mastersList = mastersPg?.items ?? [];
  const servicesList = servicesPg?.items ?? [];

  const canEditServiceAndMaster = useMemo(
    () => me?.role === "owner" || me?.role === "admin" || me?.role === "reception",
    [me?.role],
  );

  const mastersForDraftService = useMemo(
    () => mastersList.filter((m) => (m.services ?? []).some((s) => s.id === draftAssignServiceId)),
    [mastersList, draftAssignServiceId],
  );

  useEffect(() => {
    if (!assignEditOpen || !draftAssignServiceId) return;
    if (draftAssignMasterId && mastersForDraftService.some((m) => m.id === draftAssignMasterId)) return;
    setDraftAssignMasterId(mastersForDraftService[0]?.id ?? "");
  }, [assignEditOpen, draftAssignServiceId, mastersForDraftService, draftAssignMasterId]);

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
    if (!data) return "—";
    if (data.call_for_time && !data.starts_at) return t("badgeCallForTime");
    if (!data.starts_at) return data.needs_consultation ? "Созвон (уточняется)" : "—";
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: salonTz,
    }).format(new Date(data.starts_at));
  }, [data, locale, salonTz, t]);

  const dur =
    data?.starts_at && data?.ends_at
      ? durationMinutes(data.starts_at, data.ends_at)
      : data?.starts_at && data?.service
        ? data.service.duration_minutes
        : 0;

  const durDisplay = useMemo(() => {
    if (!data?.service) return "";
    return adminBookingDurationLabel(
      data.service,
      (n) => t("durationMin", { n }),
      () => t("durationRangeNote"),
    );
  }, [data?.service, t]);

  const tgDomain = data?.client.tg_username?.replace(/^@/, "") ?? "";
  const isPending = data?.status === "pending";
  const bookingCancelled = Boolean(data?.status?.includes("cancel"));
  const showReassignServiceMaster =
    canEditServiceAndMaster && Boolean(data) && !bookingCancelled;

  const sortedServices = useMemo(() => {
    const curId = data?.service_id;
    return [...servicesList]
      .filter((s) => s.is_active !== false || s.id === curId)
      .sort((a, b) =>
        (pickName(a.name_i18n, locale) || "").localeCompare(
          pickName(b.name_i18n, locale) || "",
          undefined,
          { sensitivity: "base" },
        ),
      );
  }, [servicesList, locale, data?.service_id]);

  const openAssignDialog = () => {
    if (!data) return;
    setDraftAssignServiceId(data.service_id);
    setDraftAssignMasterId(data.master_id ?? "");
    setAssignEditOpen(true);
  };

  const saveAssignEdit = () => {
    if (!bookingId || !data) return;
    if (!draftAssignServiceId || !draftAssignMasterId) {
      toast.error(t("validationRequired"));
      return;
    }
    patch.mutate(
      {
        id: bookingId,
        body: { master_id: draftAssignMasterId, service_id: draftAssignServiceId },
      },
      {
        onSuccess: () => {
          setAssignEditOpen(false);
          toast.success(t("toastUpdated"));
        },
        onError: () => toast.error(t("notesSaveError")),
      },
    );
  };

  const savePriceEdit = () => {
    if (!bookingId || !data) return;
    const n = Number(draftPrice.replace(",", "."));
    if (Number.isNaN(n) || n < 0) {
      toast.error(t("validationRequired"));
      return;
    }
    patch.mutate(
      { id: bookingId, body: { price: n } },
      {
        onSuccess: () => {
          setPriceEditOpen(false);
          toast.success(t("toastUpdated"));
        },
        onError: () => toast.error(t("notesSaveError")),
      },
    );
  };

  const saveDurationEdit = () => {
    if (!bookingId || !data?.starts_at) return;
    const mins = Number.parseInt(draftDurationMin, 10);
    if (!Number.isFinite(mins) || mins < 1 || mins > 24 * 60) {
      toast.error(t("validationRequired"));
      return;
    }
    const endsAt = new Date(new Date(data.starts_at).getTime() + mins * 60_000).toISOString();
    patch.mutate(
      { id: bookingId, body: { ends_at: endsAt } },
      {
        onSuccess: () => {
          setDurationEditOpen(false);
          toast.success(t("toastUpdated"));
        },
        onError: () => toast.error(t("notesSaveError")),
      },
    );
  };

  const saveDatetimeEdit = () => {
    if (!bookingId || !data?.starts_at) return;
    if (!/^\d{2}:\d{2}$/.test(draftTime)) {
      toast.error(t("validationRequired"));
      return;
    }
    if (!draftDate || draftDate.length < 10) {
      toast.error(t("validationRequired"));
      return;
    }
    const startsIso = zonedToUtcIso(draftDate, draftTime, salonTz);
    const mins =
      data.ends_at && data.starts_at
        ? durationMinutes(data.starts_at, data.ends_at)
        : data.service?.duration_minutes ?? 60;
    const endsIso = new Date(new Date(startsIso).getTime() + mins * 60_000).toISOString();
    patch.mutate(
      { id: bookingId, body: { starts_at: startsIso, ends_at: endsIso } },
      {
        onSuccess: () => {
          setDatetimeEditOpen(false);
          toast.success(t("toastUpdated"));
        },
        onError: () => toast.error(t("notesSaveError")),
      },
    );
  };

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
                    style={{ background: data.master?.color_hex ?? "#9A7230" }}
                  >
                    {initials(data.client)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium leading-tight">
                      {[data.client.first_name, data.client.last_name].filter(Boolean).join(" ") ||
                        t("unnamedClient")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {showContacts ? (
                        data.client.phone ? (
                          <a
                            href={`tel:${data.client.phone.replace(/\s/g, "")}`}
                            className="font-medium text-primary underline"
                          >
                            {data.client.phone}
                          </a>
                        ) : (
                          "—"
                        )
                      ) : (
                        <span className="italic">{t("contactsHiddenByPermissions")}</span>
                      )}
                    </p>
                    {showContacts && data.client.tg_username && (
                      <p className="text-xs text-muted-foreground">@{data.client.tg_username}</p>
                    )}
                    {showContacts && tgDomain && (
                      <a
                        className="mt-1 inline-flex text-xs font-medium text-primary underline"
                        href={`tg://resolve?domain=${encodeURIComponent(tgDomain)}`}
                      >
                        {t("writeTg")}
                      </a>
                    )}
                  </div>
                </div>

                {(data.any_master || data.call_for_time) && (
                  <div className="flex flex-wrap gap-2">
                    {data.any_master && (
                      <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-foreground">
                        {t("badgeAnyMaster")}
                      </span>
                    )}
                    {data.call_for_time && (
                      <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-foreground">
                        {t("badgeCallForTime")}
                      </span>
                    )}
                  </div>
                )}

                {data.client_comment?.trim() ? (
                  <div className="rounded-lg border border-border bg-muted/15 p-3 text-sm">
                    <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {t("detailClientComment")}
                    </p>
                    <p className="whitespace-pre-wrap text-foreground">{data.client_comment.trim()}</p>
                  </div>
                ) : null}

                <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3 text-sm">
                  {isPending ? (
                    <p className="text-[11px] leading-snug text-muted-foreground">{t("pendingSlotEditHint")}</p>
                  ) : null}
                  <Row
                    label={t("detailService")}
                    value={pickName(data.service.name_i18n, locale)}
                    edit={
                      showReassignServiceMaster
                        ? { ariaLabel: t("editServiceAria"), onClick: openAssignDialog }
                        : undefined
                    }
                  />
                  <Row
                    label={t("detailMaster")}
                    value={data.any_master ? t("badgeAnyMaster") : data.master?.display_name ?? "—"}
                    edit={
                      showReassignServiceMaster
                        ? { ariaLabel: t("editMasterAria"), onClick: openAssignDialog }
                        : undefined
                    }
                  />
                  <Row
                    label={t("detailWhen")}
                    value={fmtWhen}
                    edit={
                      isPending && data.starts_at
                        ? {
                            ariaLabel: t("editDateTimeAria"),
                            onClick: () => {
                              setDraftDate(isoToDateInZone(data.starts_at!, salonTz));
                              setDraftTime(isoToTimeInZone(data.starts_at!, salonTz));
                              setDatetimeEditOpen(true);
                            },
                          }
                        : undefined
                    }
                  />
                  <Row
                    label={t("detailDuration")}
                    value={durDisplay || (dur > 0 ? t("durationMin", { n: dur }) : "—")}
                    edit={
                      isPending && data.starts_at
                        ? {
                            ariaLabel: t("editDurationAria"),
                            onClick: () => {
                              const dm =
                                data.starts_at && data.ends_at
                                  ? durationMinutes(data.starts_at, data.ends_at)
                                  : (data.service?.duration_minutes ?? 60);
                              setDraftDurationMin(String(dm));
                              setDurationEditOpen(true);
                            },
                          }
                        : undefined
                    }
                  />
                  <Row
                    label={t("detailPrice")}
                    value={`€${data.price}`}
                    edit={
                      isPending
                        ? {
                            ariaLabel: t("editPriceAria"),
                            onClick: () => {
                              setDraftPrice(String(data.price ?? ""));
                              setPriceEditOpen(true);
                            },
                          }
                        : undefined
                    }
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {bookingSourceBadgeLabel(data.created_via, t) ? (
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                        bookingSourceBadgeClass(data.created_via),
                      )}
                    >
                      {bookingSourceBadgeLabel(data.created_via, t)}
                    </span>
                  ) : null}
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
                    <p className="mb-2 text-xs font-medium text-amber-700">{t("pendingAwaitingTitle")}</p>
                    {data.needs_consultation ? (
                      <Button
                        type="button"
                        className="w-full gap-2 bg-green-600 text-white hover:bg-green-700"
                        onClick={() => setScheduleOpen(true)}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        {t("scheduleAndConfirm")}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        className="w-full gap-2 bg-green-600 text-white hover:bg-green-700"
                        disabled={confirm.isPending}
                        onClick={() =>
                          confirm.mutate(data.id, {
                            onSuccess: () => {
                              toast.success(t("bookingConfirmedToast"));
                              void qc.invalidateQueries({ queryKey: ["bookings", "detail", data.id] });
                            },
                          })
                        }
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        {t("confirmBookingFull")}
                      </Button>
                    )}
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

      {data && scheduleOpen && (
        <ConsultationScheduleModal
          open={scheduleOpen}
          onOpenChange={setScheduleOpen}
          booking={data}
          salonTz={salonTz}
          onConfirmed={() => {
            void qc.invalidateQueries({ queryKey: ["bookings", "detail", bookingId] });
          }}
        />
      )}

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

      <Dialog open={priceEditOpen} onOpenChange={setPriceEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("editPriceTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="booking-edit-price">{t("detailPrice")}</Label>
            <Input
              id="booking-edit-price"
              type="text"
              inputMode="decimal"
              value={draftPrice}
              onChange={(e) => setDraftPrice(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t("editPriceHint")}</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPriceEditOpen(false)}>
              {t("close")}
            </Button>
            <Button type="button" onClick={() => void savePriceEdit()} disabled={patch.isPending}>
              {t("saveChanges")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={durationEditOpen} onOpenChange={setDurationEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("editDurationTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="booking-edit-duration">{t("editDurationLabel")}</Label>
            <Input
              id="booking-edit-duration"
              type="number"
              min={1}
              max={1440}
              value={draftDurationMin}
              onChange={(e) => setDraftDurationMin(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDurationEditOpen(false)}>
              {t("close")}
            </Button>
            <Button type="button" onClick={() => void saveDurationEdit()} disabled={patch.isPending}>
              {t("saveChanges")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={datetimeEditOpen} onOpenChange={setDatetimeEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("editDateTimeTitle")}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="space-y-2">
              <Label htmlFor="booking-edit-detail-date">{t("fieldDate")}</Label>
              <Input
                id="booking-edit-detail-date"
                type="date"
                value={draftDate}
                onChange={(e) => setDraftDate(e.target.value)}
                onFocus={(e) => e.currentTarget.showPicker?.()}
                onClick={(e) => e.currentTarget.showPicker?.()}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="booking-edit-detail-time">{t("fieldTime")}</Label>
              <Input
                id="booking-edit-detail-time"
                type="text"
                inputMode="numeric"
                placeholder="HH:MM"
                maxLength={5}
                value={draftTime}
                onChange={(e) => setDraftTime(formatTimeInput(e.target.value))}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t("editDateTimeHint")}</p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDatetimeEditOpen(false)}>
              {t("close")}
            </Button>
            <Button type="button" onClick={() => void saveDatetimeEdit()} disabled={patch.isPending}>
              {t("saveChanges")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={assignEditOpen} onOpenChange={setAssignEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("editServiceMasterTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="booking-assign-service">{t("fieldService")}</Label>
              <select
                id="booking-assign-service"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={draftAssignServiceId}
                onChange={(e) => setDraftAssignServiceId(e.target.value)}
              >
                {sortedServices.map((s) => (
                  <option key={s.id} value={s.id}>
                    {pickName(s.name_i18n, locale)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="booking-assign-master">{t("fieldMaster")}</Label>
              <select
                id="booking-assign-master"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={draftAssignMasterId}
                onChange={(e) => setDraftAssignMasterId(e.target.value)}
                disabled={mastersForDraftService.length === 0}
              >
                {mastersForDraftService.length === 0 ? (
                  <option value="">{t("noMastersForService")}</option>
                ) : (
                  mastersForDraftService.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.display_name}
                    </option>
                  ))
                )}
              </select>
            </div>
            <p className="text-xs text-muted-foreground">{t("editServiceMasterHint")}</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAssignEditOpen(false)}>
              {t("close")}
            </Button>
            <Button
              type="button"
              onClick={() => void saveAssignEdit()}
              disabled={
                patch.isPending ||
                !draftAssignMasterId ||
                mastersForDraftService.length === 0
              }
            >
              {t("saveChanges")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Row({
  label,
  value,
  edit,
}: {
  label: string;
  value: string;
  edit?: { ariaLabel: string; onClick: () => void };
}) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex min-w-0 max-w-[65%] items-center justify-end gap-1">
        <span className="text-right font-medium">{value}</span>
        {edit ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-7 w-7 shrink-0"
            aria-label={edit.ariaLabel}
            onClick={edit.onClick}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function pickName(m: Record<string, string>, locale: string) {
  return m[locale] ?? m.en ?? Object.values(m)[0] ?? "—";
}

function shortId(id: string) {
  return id.replace(/-/g, "").slice(0, 8);
}

function bookingSourceBadgeLabel(
  createdVia: string | undefined,
  translate: (key: string) => string,
): string | null {
  if (!createdVia) return null;
  switch (createdVia) {
    case "bot":
      return translate("bookingSourceTelegram");
    case "whatsapp":
      return translate("bookingSourceWhatsApp");
    case "manual":
      return translate("bookingSourceManual");
    case "admin":
      return translate("bookingSourceAdmin");
    case "mini_app":
      return translate("bookingSourceMiniApp");
    case "broadcast":
      return translate("bookingSourceBroadcast");
    default:
      return translate("bookingSourceOther");
  }
}

function bookingSourceBadgeClass(createdVia: string | undefined): string {
  if (createdVia === "whatsapp") return "bg-emerald-500/12 text-emerald-900";
  if (createdVia === "bot") return "bg-sky-500/12 text-sky-900";
  return "bg-muted text-muted-foreground";
}

function statusPillClass(status: string) {
  if (status.includes("cancel")) return "bg-red-500/15 text-red-700";
  if (status === "completed") return "bg-emerald-500/15 text-emerald-800";
  if (status === "no_show") return "bg-amber-500/15 text-amber-900";
  return "bg-[hsl(37_53%_40%/0.15)] text-[hsl(37_40%_25%)]";
}
