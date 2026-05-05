"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useMastersList } from "@/hooks/useMasters";
import { useScheduleSlots, usePatchBooking, useConfirmBooking } from "@/hooks/useBookings";
import { zonedToUtcIso } from "@/lib/date-local";
import type { BookingDetailOut } from "@/types/admin-api";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  booking: BookingDetailOut;
  salonTz: string;
  onConfirmed: () => void;
};

export function ConsultationScheduleModal({
  open,
  onOpenChange,
  booking,
  salonTz,
  onConfirmed,
}: Props) {
  const qc = useQueryClient();
  const [masterId, setMasterId] = useState<string>("");
  const [dateStr, setDateStr] = useState<string>("");
  const [timeStr, setTimeStr] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const { data: mastersData } = useMastersList();
  const masters = mastersData?.items ?? [];

  const { data: slotsData, isLoading: slotsLoading, isError: slotsError } = useScheduleSlots(
    masterId || null,
    booking.service_id,
    dateStr || null,
  );
  const slots = slotsData?.slots ?? [];
  const availableSlots = slots.filter((s) => s.available);

  const patch = usePatchBooking();
  const confirm = useConfirmBooking();

  const canSubmit = masterId && dateStr && timeStr && !submitting;

  async function handleConfirm() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const startsAtUtc = zonedToUtcIso(dateStr, timeStr, salonTz);

      await patch.mutateAsync({
        id: booking.id,
        body: {
          master_id: masterId,
          starts_at: startsAtUtc,
          needs_consultation: false,
        } as Parameters<typeof patch.mutateAsync>[0]["body"],
      });

      await confirm.mutateAsync(booking.id);

      await qc.invalidateQueries({ queryKey: ["bookings"] });
      await qc.invalidateQueries({ queryKey: ["schedule"] });

      toast.success("Запись подтверждена и добавлена в календарь");
      onConfirmed();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка при подтверждении");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Подтвердить и запланировать</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground -mt-1">
          Назначьте мастера, дату и время — запись появится в календаре.
        </p>

        <div className="space-y-4 pt-2">
          {/* Master select */}
          <div className="space-y-1.5">
            <Label>Мастер</Label>
            <select
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={masterId}
              onChange={(e) => { setMasterId(e.target.value); setTimeStr(""); }}
            >
              <option value="">— Выберите мастера —</option>
              {masters.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.display_name}
                </option>
              ))}
            </select>
          </div>

          {/* Date picker */}
          <div className="space-y-1.5">
            <Label>Дата</Label>
            <input
              type="date"
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={dateStr}
              min={new Date().toISOString().slice(0, 10)}
              onChange={(e) => { setDateStr(e.target.value); setTimeStr(""); }}
            />
          </div>

          {/* Time input */}
          <div className="space-y-1.5">
            <Label>Время</Label>
            <input
              type="time"
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={timeStr}
              onChange={(e) => setTimeStr(e.target.value)}
            />
          </div>

          {/* Slot quick-pick (when master+date are chosen) */}
          {masterId && dateStr && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Свободные слоты</Label>
              {slotsLoading && <p className="text-sm text-muted-foreground">Загружаем...</p>}
              {slotsError && (
                <p className="text-sm text-amber-600">
                  Мастер не привязан к этой услуге — введите время вручную.
                </p>
              )}
              {!slotsLoading && !slotsError && availableSlots.length === 0 && slotsData && (
                <p className="text-sm text-muted-foreground">Нет свободных слотов на эту дату.</p>
              )}
              {availableSlots.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {availableSlots.map((s) => (
                    <button
                      key={s.time}
                      type="button"
                      onClick={() => setTimeStr(s.time)}
                      className="px-3 py-1.5 rounded-md border text-sm font-medium transition-colors"
                      style={{
                        borderColor: timeStr === s.time ? "#9A7230" : undefined,
                        background: timeStr === s.time ? "rgba(154,114,48,.10)" : undefined,
                        color: timeStr === s.time ? "#9A7230" : undefined,
                      }}
                    >
                      {s.time}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Отмена
          </Button>
          <Button
            className="bg-green-600 text-white hover:bg-green-700"
            onClick={handleConfirm}
            disabled={!canSubmit}
          >
            {submitting ? "Подтверждаем..." : "Подтвердить запись"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
