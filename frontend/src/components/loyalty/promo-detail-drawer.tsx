"use client";

import { useTranslations } from "next-intl";
import { Eye } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import type { PromoCodeRow } from "@/hooks/useLoyaltyAdmin";

function formatDateOnly(iso: string | null, locale: string): string {
  if (!iso) return "";
  try {
    const raw = iso.includes("T") ? iso : `${iso}T12:00:00`;
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(raw));
  } catch {
    return iso.slice(0, 10);
  }
}

function formatDateTime(iso: string | null, locale: string): string {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(
      new Date(iso),
    );
  } catch {
    return iso;
  }
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border py-3 last:border-0">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

export function PromoDetailDrawer({
  promo,
  open,
  onOpenChange,
  locale,
}: {
  promo: PromoCodeRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locale: string;
}) {
  const t = useTranslations("pages.discounts");
  const unlimited = t("promoUnlimited");

  if (!promo) return null;

  const typeLabel =
    promo.discount_type === "percent" ? t("promoTypePercent") : t("promoTypeFixed");
  const valueLabel =
    promo.discount_type === "percent"
      ? `${promo.discount_value}%`
      : `€${promo.discount_value}`;

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent className="inset-x-auto inset-y-0 right-0 left-auto top-0 mt-0 h-full w-full max-w-md rounded-none rounded-l-xl border-l [&>div:first-child]:hidden">
        <DrawerHeader className="border-b border-border text-left">
          <DrawerTitle className="font-playfair text-xl">{t("promoDetailTitle")}</DrawerTitle>
          <p className="font-mono text-lg text-primary">{promo.code}</p>
        </DrawerHeader>
        <div className="flex-1 overflow-y-auto px-4 pb-8">
          <DetailRow label={t("promoCode")} value={promo.code} />
          <DetailRow label={t("type")} value={typeLabel} />
          <DetailRow label={t("value")} value={valueLabel} />
          <DetailRow
            label={t("promoFieldMinBooking")}
            value={
              promo.min_booking_amount
                ? `€${promo.min_booking_amount}`
                : unlimited
            }
          />
          <DetailRow
            label={t("promoFieldMaxUses")}
            value={promo.max_uses != null ? String(promo.max_uses) : unlimited}
          />
          <DetailRow label={t("uses")} value={String(promo.uses_count)} />
          <DetailRow
            label={t("promoFieldMaxUsesPerClient")}
            value={
              promo.max_uses_per_client != null
                ? String(promo.max_uses_per_client)
                : unlimited
            }
          />
          <DetailRow
            label={t("promoFieldValidFrom")}
            value={
              promo.valid_from
                ? formatDateOnly(promo.valid_from, locale)
                : t("promoNotSet")
            }
          />
          <DetailRow
            label={t("promoValidUntil")}
            value={
              promo.valid_until
                ? formatDateOnly(promo.valid_until, locale)
                : t("promoNotSet")
            }
          />
          <DetailRow
            label={t("promoFieldStatus")}
            value={promo.is_active ? t("promoActive") : t("promoInactive")}
          />
          <DetailRow
            label={t("promoFieldCreatedAt")}
            value={formatDateTime(promo.created_at, locale)}
          />
        </div>
        <div className="border-t border-border p-4">
          <DrawerClose asChild>
            <Button type="button" variant="outline" className="w-full">
              {t("cancel")}
            </Button>
          </DrawerClose>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

export function PromoViewButton({
  onClick,
  label,
}: {
  onClick: () => void;
  label: string;
}) {
  return (
    <Button type="button" variant="ghost" size="icon" aria-label={label} onClick={onClick}>
      <Eye className="h-4 w-4" />
    </Button>
  );
}
