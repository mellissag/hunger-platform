import type { Booking } from "../hooks/useMiniAppData";
import type { AppTranslations } from "../i18n/translations";

/** Prefer API `duration_minutes` (from booking window); else derive from starts_at / ends_at. */
export function effectiveBookingDurationMinutes(
  b: Pick<Booking, "duration_minutes" | "starts_at" | "ends_at">,
): number | null {
  if (typeof b.duration_minutes === "number" && b.duration_minutes > 0) {
    return b.duration_minutes;
  }
  if (b.starts_at && b.ends_at) {
    const m = Math.round(
      (new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()) / 60_000,
    );
    return m > 0 ? m : null;
  }
  return null;
}

export function formatMiniAppEuro(price: number | undefined): string {
  if (price == null || Number.isNaN(price)) return "";
  const x = Math.round(price * 100) / 100;
  if (Number.isInteger(x)) return `€${x}`;
  const s = x.toFixed(2);
  return `€${s.replace(/\.?0+$/, "")}`;
}

/** e.g. «1 ч · €200» or «45 мин · €80» — duration from booking, price from booking row. */
export function miniAppBookingPriceDurationLine(
  b: Pick<Booking, "duration_minutes" | "starts_at" | "ends_at" | "price">,
  bookDurLabel: AppTranslations["bookDurLabel"],
): string {
  const mins = effectiveBookingDurationMinutes(b);
  const dur = mins ? bookDurLabel(mins) : "";
  const p = formatMiniAppEuro(b.price);
  if (dur && p) return `${dur} · ${p}`;
  return dur || p;
}
