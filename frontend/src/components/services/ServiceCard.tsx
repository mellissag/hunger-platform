"use client";

import Image from "next/image";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import type { ServiceOut } from "@/types/admin-api";
import { ServiceToggle } from "./ServiceToggle";

interface ServiceCardProps {
  service: ServiceOut;
  locale?: string;
  onDelete: (service: ServiceOut) => void;
}

function metricDisplay(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return String(value);
}

export function ServiceCard({
  service,
  locale = "ru",
  onDelete,
}: ServiceCardProps) {
  const t = useTranslations("pages.services");
  const name =
    service.name_i18n[locale] ?? service.name_i18n.en ?? service.name_i18n.ru ?? "—";

  const categoryBadges =
    service.categories && service.categories.length > 0 ? service.categories : null;

  const rawPrice = Number.parseFloat(service.price);
  const priceLabel =
    Number.isNaN(rawPrice) ? "—" : `€${rawPrice.toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

  const mastersLabel = metricDisplay(service.masters_count);
  const bookingsLabel = metricDisplay(service.bookings_30d ?? service.bookings_count);

  const photoSrc = service.photo_url?.trim() ?? "";

  return (
    <div
      data-testid="service-card"
      className={cn(
        "rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-shadow hover:shadow-md",
        !service.is_active && "opacity-80",
      )}
    >
      <div className="mb-4 flex items-start gap-3">
        {photoSrc ? (
          <Image
            src={photoSrc}
            alt={name}
            width={48}
            height={48}
            unoptimized
            className="h-12 w-12 shrink-0 rounded-xl object-cover"
          />
        ) : (
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#C9A84C] to-[#9A7230] text-lg font-semibold text-white"
            aria-hidden
          >
            {name.charAt(0) !== "—" ? name.charAt(0).toUpperCase() : "?"}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-gray-900">{name}</h3>
          <div className="mt-1 flex flex-wrap gap-1">
            {categoryBadges ? (
              categoryBadges.map((cat) => {
                const catLabel =
                  cat.name_i18n[locale] ?? cat.name_i18n.en ?? cat.name_i18n.ru ?? "";
                return (
                  <span
                    key={cat.id}
                    className="rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-[10px] text-primary"
                  >
                    {cat.icon ? `${cat.icon} ` : ""}
                    {catLabel}
                  </span>
                );
              })
            ) : (
              <span className="text-xs text-gray-400">{t("categoryNone")}</span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            title={t("serviceCardDeleteAria")}
            aria-label={t("serviceCardDeleteAria")}
            onClick={() => onDelete(service)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <ServiceToggle serviceId={service.id} isActive={service.is_active} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-gray-50 p-3">
          <p className="mb-1 text-xs text-gray-400">{t("serviceCardPrice")}</p>
          <p className="text-sm font-semibold text-gray-900">{priceLabel}</p>
        </div>
        <div className="rounded-xl bg-gray-50 p-3">
          <p className="mb-1 text-xs text-gray-400">{t("serviceCardDuration")}</p>
          <p className="text-sm font-semibold text-gray-900">
            {service.duration_minutes != null ? `${service.duration_minutes} ${t("serviceCardMinSuffix")}` : "—"}
          </p>
        </div>
        <div className="rounded-xl bg-gray-50 p-3">
          <p className="mb-1 text-xs text-gray-400">{t("serviceCardMasters")}</p>
          <p className="text-sm font-semibold text-gray-900">{mastersLabel}</p>
        </div>
        <div className="rounded-xl bg-gray-50 p-3">
          <p className="mb-1 text-xs text-gray-400">{t("serviceCardBookings30d")}</p>
          <p className="text-sm font-semibold text-gray-900">{bookingsLabel}</p>
        </div>
      </div>

      <Link
        href={`/services/${service.id}`}
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-gray-200 py-2 text-xs text-gray-600 transition-colors hover:border-[#C9A84C] hover:text-[#C9A84C]"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
        {t("serviceCardEdit")}
      </Link>
    </div>
  );
}

/** Skeleton for a service card */
export function ServiceCardSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl border border-gray-100 bg-white p-5">
      <div className="mb-4 flex gap-3">
        <div className="h-12 w-12 shrink-0 rounded-xl bg-gray-100" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-4 w-[70%] max-w-full rounded bg-gray-100" />
          <div className="h-3 w-[40%] rounded bg-gray-100" />
        </div>
        <div className="h-8 w-16 shrink-0 rounded-lg bg-gray-100" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl bg-gray-50 p-3">
            <div className="mb-2 h-3 w-12 rounded bg-gray-100" />
            <div className="h-4 w-16 rounded bg-gray-100" />
          </div>
        ))}
      </div>
      <div className="mt-3 h-9 w-full rounded-xl bg-gray-100" />
    </div>
  );
}
