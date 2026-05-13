"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

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
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDebounce } from "@/hooks/useDebounce";
import { useBooking, useCreateBooking, usePatchBooking, useScheduleSlots } from "@/hooks/useBookings";
import { useCreateClient } from "@/hooks/useClients";
import { apiJson } from "@/lib/api";
import { isoToDateInZone, isoToTimeInZone, zonedToUtcIso, durationMinutes } from "@/lib/date-local";
import type { ClientOut, MasterOut, Paginated, ServiceOut } from "@/types/admin-api";
import { toast } from "sonner";

const schema = z.object({
  client_id: z.string().uuid({ message: " " }),
  service_id: z.string().uuid({ message: " " }),
  master_id: z.string().uuid({ message: " " }),
  date: z.string().min(1, { message: " " }),
  time: z.string().regex(/^\d{2}:\d{2}$/, { message: " " }),
  notes: z.string().optional(),
});

export type BookingCreateForm = z.infer<typeof schema>;

const TAG_OPTIONS_CREATE = [
  "VIP",
  "Постоянный",
  "Новый",
  "No-show",
  "Использует бот",
] as const;

function formatClientLabel(c: ClientOut): string {
  const fullName = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  if (fullName && c.phone) return `${fullName} · ${c.phone}`;
  if (fullName) return fullName;
  if (c.phone) return c.phone;
  return c.id;
}

function formatTimeInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}


type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  services: ServiceOut[];
  initial?: { date: string; time: string } | null;
  editBookingId?: string | null;
  /** Создание записи с заранее выбранным клиентом (например, с карточки клиента). */
  prefilledClient?: { id: string; name: string } | null;
  onSuccess?: () => void;
  /** Timezone of the salon (e.g. "Europe/Sofia"). Times are entered and displayed in this zone. */
  salonTz?: string;
};

export function BookingCreateDrawer({
  open,
  onOpenChange,
  services,
  initial,
  editBookingId,
  prefilledClient,
  onSuccess,
  salonTz = "Europe/Sofia",
}: Props) {
  const locale = useLocale();
  const t = useTranslations("pages.bookings");
  const create = useCreateBooking();
  const createClient = useCreateClient();
  const patch = usePatchBooking();
  const { data: editDetail } = useBooking(editBookingId ?? null);

  const [clientSearch, setClientSearch] = useState("");
  const debouncedQ = useDebounce(clientSearch, 300);
  const [clientLabel, setClientLabel] = useState("");
  const [showNewClientModal, setShowNewClientModal] = useState(false);
  const [newClientError, setNewClientError] = useState("");
  const [editPriceStr, setEditPriceStr] = useState("");
  const [editDurationMinStr, setEditDurationMinStr] = useState("");
  const [newClientForm, setNewClientForm] = useState({
    first_name: "",
    last_name: "",
    phone: "",
    tg_username: "",
    birthday: "",
    tags: [] as string[],
  });

  const { data: clientsPg } = useQuery({
    queryKey: ["clients", "search", debouncedQ],
    queryFn: () =>
      apiJson<Paginated<ClientOut>>(
        `/clients?page=1&page_size=30&q=${encodeURIComponent(debouncedQ)}`,
      ),
    enabled: debouncedQ.trim().length >= 1,
  });
  const clientHits = clientsPg?.items ?? [];

  const form = useForm<BookingCreateForm>({
    resolver: zodResolver(schema),
    defaultValues: {
      client_id: "",
      service_id: "",
      master_id: "",
      date: "",
      time: "",
      notes: "",
    },
  });

  const serviceId = form.watch("service_id");
  const masterId = form.watch("master_id");
  const date = form.watch("date");

  const { data: mastersPg } = useQuery({
    queryKey: ["masters", "all-for-booking"],
    queryFn: () =>
      apiJson<Paginated<MasterOut>>("/masters?page=1&page_size=500"),
  });
  const masters = mastersPg?.items ?? [];

  const { data: slotsData } = useScheduleSlots(masterId || null, serviceId || null, date || null);

  const servicePrice = useMemo(() => {
    const s = services.find((x) => x.id === serviceId);
    return s?.price ?? null;
  }, [services, serviceId]);

  useEffect(() => {
    if (initial?.date) form.setValue("date", initial.date);
    if (initial?.time) form.setValue("time", initial.time);
  }, [initial, form]);

  useEffect(() => {
    if (prefilledClient && open && !editBookingId) {
      form.setValue("client_id", prefilledClient.id);
      setClientLabel(prefilledClient.name);
    }
  }, [prefilledClient, open, editBookingId, form]);

  useEffect(() => {
    if (!editDetail || !editBookingId) return;
    setEditPriceStr(String(editDetail.price ?? ""));
    if (editDetail.starts_at && editDetail.ends_at) {
      setEditDurationMinStr(String(durationMinutes(editDetail.starts_at, editDetail.ends_at)));
    } else {
      setEditDurationMinStr("");
    }
    form.reset({
      client_id: editDetail.client.id,
      service_id: editDetail.service_id,
      master_id: editDetail.master_id ?? undefined,
      date: editDetail.starts_at ? isoToDateInZone(editDetail.starts_at, salonTz) : "",
      time: editDetail.starts_at ? isoToTimeInZone(editDetail.starts_at, salonTz) : "",
      notes: editDetail.notes ?? "",
    });
    setClientLabel(
      [editDetail.client.first_name, editDetail.client.last_name].filter(Boolean).join(" ") ||
        editDetail.client.phone ||
        "",
    );
  }, [editDetail, editBookingId, form, salonTz]);

  useEffect(() => {
    if (!open) {
      setClientSearch("");
      setClientLabel("");
      setShowNewClientModal(false);
      setNewClientError("");
      setEditPriceStr("");
      setEditDurationMinStr("");
      form.reset();
    }
  }, [open, form]);

  const slotOptions = slotsData?.slots?.length ? slotsData.slots : [];

  const submitNewClient = async () => {
    setNewClientError("");
    if (!newClientForm.first_name.trim()) {
      setNewClientError(t("validationRequired"));
      return;
    }
    try {
      const c = await createClient.mutateAsync({
        first_name: newClientForm.first_name.trim(),
        last_name: newClientForm.last_name.trim() || null,
        phone: newClientForm.phone.trim() || null,
        tg_username: newClientForm.tg_username.trim().replace(/^@/, "") || null,
        birthday: newClientForm.birthday || null,
        tags: newClientForm.tags,
        source: "manual",
        lang: "en",
      });
      form.setValue("client_id", c.id, { shouldValidate: true });
      setClientLabel(formatClientLabel(c));
      setClientSearch("");
      setShowNewClientModal(false);
      setNewClientForm({
        first_name: "",
        last_name: "",
        phone: "",
        tg_username: "",
        birthday: "",
        tags: [],
      });
    } catch (e) {
      setNewClientError(e instanceof Error ? e.message : t("errorClientCreate"));
    }
  };

  const onSubmit = form.handleSubmit(async (values) => {
    // Convert the user's locally-entered date+time (in the salon's timezone) to UTC ISO.
    // Using new Date(`${date}T${time}:00`) is WRONG: it uses the browser's local timezone,
    // which may differ from the salon's timezone and causes hour offset bugs.
    const startsAtUtc = zonedToUtcIso(values.date, values.time, salonTz);
    if (editBookingId) {
      const patchBody: {
        starts_at: string;
        notes: string | null;
        price?: number;
        ends_at?: string;
      } = {
        starts_at: startsAtUtc,
        notes: values.notes?.trim() || null,
      };
      const p = Number(editPriceStr.replace(",", "."));
      if (!Number.isNaN(p) && p >= 0) {
        patchBody.price = p;
      }
      const dm = Number.parseInt(editDurationMinStr, 10);
      if (Number.isFinite(dm) && dm >= 1 && dm <= 24 * 60) {
        patchBody.ends_at = new Date(new Date(startsAtUtc).getTime() + dm * 60_000).toISOString();
      }
      await patch.mutateAsync({
        id: editBookingId,
        body: patchBody,
      });
      toast.success(t("toastUpdated"));
    } else {
      await create.mutateAsync({
        client_id: values.client_id,
        master_id: values.master_id,
        service_id: values.service_id,
        starts_at: startsAtUtc,
        notes: values.notes?.trim() || null,
      });
      toast.success(t("toastCreated"));
    }
    onOpenChange(false);
    onSuccess?.();
  });

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange} direction="right" shouldScaleBackground={false}>
      <DrawerContent className="left-auto right-2 top-2 z-50 ml-auto flex h-[calc(100vh-16px)] w-full max-w-[480px] flex-col rounded-lg border bg-background p-0 shadow-xl data-[vaul-drawer-direction=right]:mt-0 data-[vaul-drawer-direction=right]:max-w-[480px]">
        <DrawerHeader className="border-b border-border px-6 text-left">
          <DrawerTitle className="font-playfair text-xl font-medium">
            {editBookingId ? t("editTitle") : t("createTitle")}
          </DrawerTitle>
        </DrawerHeader>
        <form onSubmit={onSubmit} className="flex flex-1 flex-col overflow-y-auto px-6 py-4">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t("fieldClient")}</Label>
              {editBookingId || prefilledClient ? (
                <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
                  {clientLabel || prefilledClient?.name || "—"}
                </p>
              ) : (
                <div className="flex gap-2">
                  <Input
                    placeholder={t("clientSearchPlaceholder")}
                    value={clientSearch}
                    onChange={(e) => setClientSearch(e.target.value)}
                  />
                  <Button type="button" variant="outline" onClick={() => setShowNewClientModal(true)}>
                    {t("newClient")}
                  </Button>
                </div>
              )}
              {!editBookingId && !prefilledClient && clientHits.length > 0 && (
                <div className="max-h-40 overflow-auto rounded-md border border-border bg-card text-sm">
                  {clientHits.map((c) => {
                    const label =
                      [c.first_name, c.last_name].filter(Boolean).join(" ") || c.phone || c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className="block w-full px-3 py-2 text-left hover:bg-muted"
                        onClick={() => {
                          form.setValue("client_id", c.id);
                          setClientLabel(label);
                          setClientSearch("");
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}
              {!editBookingId && !prefilledClient && clientLabel && (
                <p className="text-xs text-muted-foreground">
                  {t("selected")}: {clientLabel}
                </p>
              )}
              <input type="hidden" {...form.register("client_id")} />
              {form.formState.errors.client_id && (
                <p className="text-[11px] text-destructive">{t("validationRequired")}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>{t("fieldService")}</Label>
              <Controller
                name="service_id"
                control={form.control}
                render={({ field }) => (
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={field.value}
                    disabled={Boolean(editBookingId)}
                    onChange={(e) => {
                      field.onChange(e.target.value);
                      form.setValue("master_id", "");
                      form.setValue("time", "");
                    }}
                  >
                    <option value="">{t("selectPlaceholder")}</option>
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name_i18n[locale] ?? s.name_i18n.en ?? s.id}
                      </option>
                    ))}
                  </select>
                )}
              />
              {servicePrice && (
                <p className="text-[11px] text-muted-foreground">
                  {t("priceHint")} €{servicePrice}
                </p>
              )}
              {form.formState.errors.service_id && (
                <p className="text-[11px] text-destructive">{t("validationRequired")}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>{t("fieldMaster")}</Label>
              <Controller
                name="master_id"
                control={form.control}
                render={({ field }) => (
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={field.value}
                    disabled={Boolean(editBookingId)}
                    onChange={(e) => {
                      field.onChange(e.target.value);
                      form.setValue("time", "");
                    }}
                  >
                    <option value="">{t("selectPlaceholder")}</option>
                    {masters.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.display_name}
                      </option>
                    ))}
                  </select>
                )}
              />
              {form.formState.errors.master_id && (
                <p className="text-[11px] text-destructive">{t("validationRequired")}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("fieldDate")}</Label>
                <Input
                  type="date"
                  {...form.register("date")}
                  onFocus={(e) => e.currentTarget.showPicker?.()}
                  onClick={(e) => e.currentTarget.showPicker?.()}
                />
                {form.formState.errors.date && (
                  <p className="text-[11px] text-destructive">{t("validationRequired")}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>{t("fieldTime")}</Label>
                <Controller
                  name="time"
                  control={form.control}
                  render={({ field }) => (
                    <Input
                      type="text"
                      inputMode="numeric"
                      placeholder="HH:MM"
                      maxLength={5}
                      list="booking-time-slots"
                      value={field.value}
                      onChange={(e) => field.onChange(formatTimeInput(e.target.value))}
                      disabled={!masterId || !serviceId || !date}
                    />
                  )}
                />
                <datalist id="booking-time-slots">
                  {slotOptions
                    .filter((s) => s.available)
                    .map((s) => (
                      <option key={s.time} value={s.time} />
                    ))}
                </datalist>
                {form.formState.errors.time && (
                  <p className="text-[11px] text-destructive">{t("validationRequired")}</p>
                )}
              </div>
            </div>

            {editBookingId ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t("detailPrice")} (€)</Label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={editPriceStr}
                    onChange={(e) => setEditPriceStr(e.target.value)}
                  />
                  <p className="text-[11px] text-muted-foreground">{t("editPriceHint")}</p>
                </div>
                <div className="space-y-1.5">
                  <Label>{t("editDurationLabel")}</Label>
                  <Input
                    type="number"
                    min={1}
                    max={1440}
                    disabled={!editDetail?.starts_at || !editDetail?.ends_at}
                    value={editDurationMinStr}
                    onChange={(e) => setEditDurationMinStr(e.target.value)}
                  />
                </div>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <Label>{t("fieldNotes")}</Label>
              <textarea
                className="min-h-[88px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                {...form.register("notes")}
              />
            </div>
          </div>

          <DrawerFooter className="mt-6 flex flex-row gap-2 px-0 pb-0">
            <Button
              type="submit"
              disabled={
                create.isPending || patch.isPending || Boolean(editBookingId && !editDetail)
              }
              className="flex-1"
            >
              {editBookingId ? t("saveChanges") : t("submit")}
            </Button>
            <DrawerClose asChild>
              <Button type="button" variant="outline">
                {t("cancel")}
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </form>
      </DrawerContent>
      </Drawer>
      <Dialog open={showNewClientModal} onOpenChange={setShowNewClientModal}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>{t("newClientTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t("newClientFirstName")}</Label>
              <Input
                value={newClientForm.first_name}
                onChange={(e) => setNewClientForm((f) => ({ ...f, first_name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("newClientLastName")}</Label>
              <Input
                value={newClientForm.last_name}
                onChange={(e) => setNewClientForm((f) => ({ ...f, last_name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("newClientPhone")}</Label>
              <Input
                placeholder="+359..."
                value={newClientForm.phone}
                onChange={(e) => setNewClientForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("newClientTg")}</Label>
              <Input
                placeholder="@username"
                value={newClientForm.tg_username}
                onChange={(e) => setNewClientForm((f) => ({ ...f, tg_username: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("newClientBirthday")}</Label>
              <Input
                type="date"
                value={newClientForm.birthday}
                onChange={(e) => setNewClientForm((f) => ({ ...f, birthday: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("newClientTags")}</Label>
              <select
                multiple
                value={newClientForm.tags}
                onChange={(e) =>
                  setNewClientForm((f) => ({
                    ...f,
                    tags: Array.from(e.target.selectedOptions).map((o) => o.value),
                  }))
                }
                className="min-h-[96px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {TAG_OPTIONS_CREATE.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
            </div>
            {newClientError ? (
              <p className="text-sm text-destructive">{newClientError}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowNewClientModal(false)}>
              {t("cancel")}
            </Button>
            <Button type="button" disabled={createClient.isPending} onClick={() => void submitNewClient()}>
              {createClient.isPending ? t("saving") : t("submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
