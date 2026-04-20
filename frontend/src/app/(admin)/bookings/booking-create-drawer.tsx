"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button } from "@/components/ui/button";
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
import { apiJson } from "@/lib/api";
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

function isoToDate(iso: string) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isoToTime(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  services: ServiceOut[];
  initial?: { date: string; time: string } | null;
  editBookingId?: string | null;
  onSuccess?: () => void;
};

export function BookingCreateDrawer({
  open,
  onOpenChange,
  services,
  initial,
  editBookingId,
  onSuccess,
}: Props) {
  const locale = useLocale();
  const t = useTranslations("pages.bookings");
  const create = useCreateBooking();
  const patch = usePatchBooking();
  const { data: editDetail } = useBooking(editBookingId ?? null);

  const [clientSearch, setClientSearch] = useState("");
  const debouncedQ = useDebounce(clientSearch, 300);
  const [clientLabel, setClientLabel] = useState("");

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
    queryKey: ["masters", "for-service", serviceId],
    queryFn: () =>
      apiJson<Paginated<MasterOut>>(
        `/masters?page=1&page_size=100&service_id=${encodeURIComponent(serviceId)}`,
      ),
    enabled: Boolean(serviceId),
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
    if (!editDetail || !editBookingId) return;
    form.reset({
      client_id: editDetail.client.id,
      service_id: editDetail.service_id,
      master_id: editDetail.master_id,
      date: isoToDate(editDetail.starts_at),
      time: isoToTime(editDetail.starts_at),
      notes: editDetail.notes ?? "",
    });
    setClientLabel(
      [editDetail.client.first_name, editDetail.client.last_name].filter(Boolean).join(" ") ||
        editDetail.client.phone ||
        "",
    );
  }, [editDetail, editBookingId, form]);

  useEffect(() => {
    if (!open) {
      setClientSearch("");
      setClientLabel("");
      form.reset();
    }
  }, [open, form]);

  const slotOptions = slotsData?.slots?.length ? slotsData.slots : [];

  const onSubmit = form.handleSubmit(async (values) => {
    const local = new Date(`${values.date}T${values.time}:00`);
    if (editBookingId) {
      await patch.mutateAsync({
        id: editBookingId,
        body: {
          starts_at: local.toISOString(),
          notes: values.notes?.trim() || null,
        },
      });
      toast.success(t("toastUpdated"));
    } else {
      await create.mutateAsync({
        client_id: values.client_id,
        master_id: values.master_id,
        service_id: values.service_id,
        starts_at: local.toISOString(),
        notes: values.notes?.trim() || null,
      });
      toast.success(t("toastCreated"));
    }
    onOpenChange(false);
    onSuccess?.();
  });

  return (
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
              {editBookingId ? (
                <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
                  {clientLabel || "—"}
                </p>
              ) : (
              <Input
                placeholder={t("clientSearchPlaceholder")}
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
              />
              )}
              {!editBookingId && clientHits.length > 0 && (
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
              {!editBookingId && clientLabel && (
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
                    disabled={!serviceId || Boolean(editBookingId)}
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
                <Input type="date" {...form.register("date")} />
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
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={field.value}
                      onChange={(e) => field.onChange(e.target.value)}
                      disabled={!masterId || !serviceId || !date}
                    >
                      <option value="">{t("selectPlaceholder")}</option>
                      {slotOptions.map((s) => (
                        <option key={s.time} value={s.time} disabled={!s.available}>
                          {s.time}
                          {!s.available ? ` (${t("slotBusy")})` : ""}
                        </option>
                      ))}
                    </select>
                  )}
                />
                {form.formState.errors.time && (
                  <p className="text-[11px] text-destructive">{t("validationRequired")}</p>
                )}
              </div>
            </div>

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
  );
}
