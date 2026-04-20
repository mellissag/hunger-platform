"use client";

import { Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ServiceCategoryOut, ServiceOut } from "@/types/admin-api";
import { ServiceToggle } from "./ServiceToggle";

interface ServiceCardProps {
  service: ServiceOut;
  categories: ServiceCategoryOut[];
  locale?: string;
  onEdit: (id: string) => void;
  onDelete: (service: ServiceOut) => void;
}

export function ServiceCard({
  service,
  categories,
  locale = "ru",
  onEdit,
  onDelete,
}: ServiceCardProps) {
  const name = service.name_i18n[locale] ?? service.name_i18n.en ?? service.name_i18n.ru ?? "—";

  const category = categories.find((c) => c.id === service.category_id);
  const catName = category
    ? (category.name_i18n[locale] ?? category.name_i18n.en ?? category.name_i18n.ru ?? "")
    : "";

  const price = Number.parseFloat(service.price);
  const priceLabel = Number.isNaN(price) ? "—" : `${Math.round(price)} €`;

  return (
    <div
      data-testid="service-card"
      className={cn(
        "rounded border border-border bg-card p-5 shadow-[0_1px_4px_rgba(28,20,9,.06)] transition-all duration-200",
        "hover:border-primary/30 hover:shadow-[0_4px_16px_rgba(28,20,9,.08)]",
        !service.is_active && "opacity-65",
      )}
    >
      {/* Header: name + buttons */}
      <div className="mb-2.5 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-playfair truncate text-base font-medium leading-snug">{name}</p>
          {catName && (
            <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-primary">
              {catName}
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            title="Редактировать"
            onClick={() => onEdit(service.id)}
            className="flex h-7 w-7 items-center justify-center rounded border border-border bg-muted text-muted-foreground transition-all duration-150 hover:border-primary/30 hover:text-primary"
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            type="button"
            title="Удалить"
            onClick={() => onDelete(service)}
            className="flex h-7 w-7 items-center justify-center rounded border border-border bg-muted text-muted-foreground transition-all duration-150 hover:border-red-300 hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Price */}
      <p className="font-playfair text-2xl font-medium text-primary">{priceLabel}</p>

      {/* Meta */}
      <div className="mt-2.5 flex flex-wrap gap-3.5 border-t border-dashed border-border pt-2.5">
        <span className="text-[11px] text-muted-foreground">
          Длит.:{" "}
          <strong className="font-semibold text-foreground">{service.duration_minutes} мин</strong>
        </span>
        {service.masters_count !== undefined && (
          <span className="text-[11px] text-muted-foreground">
            Мастеров:{" "}
            <strong className="font-semibold text-foreground">{service.masters_count}</strong>
          </span>
        )}
        {service.bookings_count !== undefined && (
          <span className="text-[11px] text-muted-foreground">
            Броней:{" "}
            <strong className="font-semibold text-foreground">{service.bookings_count}</strong>
          </span>
        )}
      </div>

      {/* Toggle */}
      <div className="mt-3 flex items-center gap-2">
        <ServiceToggle serviceId={service.id} isActive={service.is_active} />
        <span className="text-[11px] uppercase tracking-[0.05em] text-muted-foreground">
          {service.is_active ? "Активна в боте" : "Скрыта в боте"}
        </span>
      </div>
    </div>
  );
}

/** Skeleton for a service card */
export function ServiceCardSkeleton() {
  return (
    <div className="animate-pulse rounded border border-border bg-card p-5">
      <div className="mb-2.5 flex items-start justify-between">
        <div className="flex-1 space-y-2">
          <div className="h-4 w-3/4 rounded bg-muted" />
          <div className="h-2.5 w-1/3 rounded bg-muted" />
        </div>
        <div className="flex gap-1">
          <div className="h-7 w-7 rounded bg-muted" />
          <div className="h-7 w-7 rounded bg-muted" />
        </div>
      </div>
      <div className="mt-1 h-7 w-20 rounded bg-muted" />
      <div className="mt-3 h-px bg-border" />
      <div className="mt-2.5 flex gap-3">
        <div className="h-3 w-20 rounded bg-muted" />
        <div className="h-3 w-16 rounded bg-muted" />
      </div>
      <div className="mt-3 h-4.5 w-28 rounded bg-muted" />
    </div>
  );
}
