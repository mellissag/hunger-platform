"use client";

import { useState } from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";
import { useLocale } from "next-intl";

import { Button } from "@/components/ui/button";
import { useDeleteService } from "@/hooks/useServices";
import type { ServiceOut } from "@/types/admin-api";

interface ServiceDeleteModalProps {
  service: ServiceOut | null;
  onClose: () => void;
}

export function ServiceDeleteModal({ service, onClose }: ServiceDeleteModalProps) {
  const locale = useLocale();
  const deleteSvc = useDeleteService();
  const [confirmed, setConfirmed] = useState(false);

  if (!service) return null;

  const name =
    service.name_i18n[locale] ?? service.name_i18n.en ?? service.name_i18n.ru ?? "Услуга";

  const hasBookings = (service.bookings_count ?? 0) > 0;

  function handleDelete() {
    if (!service) return;
    deleteSvc.mutate(service.id, {
      onSuccess: () => {
        onClose();
        setConfirmed(false);
      },
    });
  }

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-50 bg-[rgba(28,20,9,.4)]" onClick={onClose} />

      {/* Dialog */}
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded border border-border bg-card p-6 shadow-[0_8px_32px_rgba(28,20,9,.12)]">
        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-playfair text-lg font-medium leading-snug">Удалить «{name}»?</h2>
            <p className="mt-1 text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
              · Подтверждение удаления ·
            </p>
          </div>
        </div>

        {hasBookings ? (
          /* Blocked: has active bookings */
          <>
            <div className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <p className="font-medium">
                ⚠️ У этой услуги {service.bookings_count} подтверждённых записей.
              </p>
              <p className="mt-1 text-[12px]">Удаление недоступно пока есть активные брони.</p>
            </div>
            <Button
              variant="outline"
              onClick={onClose}
              className="w-full text-[11px] uppercase tracking-wider"
            >
              Закрыть
            </Button>
          </>
        ) : !confirmed ? (
          /* Step 1: confirmation prompt */
          <>
            <p className="mb-5 text-sm text-muted-foreground">
              Услуга будет скрыта из бота. История броней сохраняется.
            </p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={onClose}
                className="flex-1 text-[11px] uppercase tracking-wider"
              >
                Отмена
              </Button>
              <Button
                variant="destructive"
                onClick={() => setConfirmed(true)}
                className="flex-1 text-[11px] uppercase tracking-wider"
              >
                Удалить
              </Button>
            </div>
          </>
        ) : (
          /* Step 2: final confirm with loading */
          <>
            <p className="mb-5 text-sm text-muted-foreground">
              Это действие необратимо. Вы уверены?
            </p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setConfirmed(false)}
                className="flex-1 text-[11px] uppercase tracking-wider"
                disabled={deleteSvc.isPending}
              >
                Назад
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deleteSvc.isPending}
                className="flex-1 text-[11px] uppercase tracking-wider"
              >
                {deleteSvc.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Подтвердить удаление
              </Button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
