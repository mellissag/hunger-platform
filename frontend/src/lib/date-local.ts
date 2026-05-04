/** Local-calendar helpers (browser timezone) for admin UI ranges. */

/**
 * Convert a date + time string entered by the user in the salon's timezone
 * to a UTC ISO string suitable for API transmission.
 *
 * Example: "2025-05-05" + "09:00" in "Europe/Sofia" (UTC+3) → "2025-05-05T06:00:00.000Z"
 *
 * Algorithm: create a "naive UTC" Date, format it in the target timezone via Intl
 * to measure the offset, then subtract that offset.
 */
export function zonedToUtcIso(dateStr: string, timeStr: string, timeZone: string): string {
  const naiveUtc = new Date(`${dateStr}T${timeStr}:00Z`);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(naiveUtc);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  const localMs = Date.UTC(
    +get("year"),
    +get("month") - 1,
    +get("day"),
    +get("hour"),
    +get("minute"),
    +get("second"),
  );
  const offset = localMs - naiveUtc.getTime();
  return new Date(naiveUtc.getTime() - offset).toISOString();
}

/**
 * Format a UTC ISO timestamp as a "YYYY-MM-DD" date string in the given timezone.
 * Use instead of new Date(iso).toLocaleDateString() to avoid browser-tz dependence.
 */
export function isoToDateInZone(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const y = parts.find((p) => p.type === "year")?.value ?? "";
  const m = parts.find((p) => p.type === "month")?.value ?? "";
  const d = parts.find((p) => p.type === "day")?.value ?? "";
  return `${y}-${m}-${d}`;
}

/**
 * Format a UTC ISO timestamp as "HH:MM" in the given timezone.
 * Use instead of new Date(iso).getHours() to avoid browser-tz dependence.
 */
export function isoToTimeInZone(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const h = parts.find((p) => p.type === "hour")?.value ?? "00";
  const min = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${h}:${min}`;
}


export function startOfWeekMondayLocal(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDaysLocal(d: Date, n: number): Date {
  const x = new Date(d.getTime());
  x.setDate(x.getDate() + n);
  return x;
}

/** Inclusive date string YYYY-MM-DD → UTC ISO for range start (local midnight). */
export function localDateToIsoStart(dateStr: string): string | null {
  if (!dateStr.trim()) return null;
  const x = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(x.getTime())) return null;
  return x.toISOString();
}

/** Inclusive date string → UTC ISO end of local day. */
export function localDateToIsoEnd(dateStr: string): string | null {
  if (!dateStr.trim()) return null;
  const x = new Date(`${dateStr}T23:59:59.999`);
  if (Number.isNaN(x.getTime())) return null;
  return x.toISOString();
}

export function minutesInZone(iso: string, timeZone: string): { minutes: number; dayKey: string } {
  const d = new Date(iso);
  const dayKey = d.toLocaleDateString("en-CA", { timeZone });
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  let h = 0;
  let m = 0;
  for (const p of parts) {
    if (p.type === "hour") h = Number(p.value);
    if (p.type === "minute") m = Number(p.value);
  }
  return { minutes: h * 60 + m, dayKey };
}

export function durationMinutes(isoStart: string, isoEnd: string): number {
  return Math.max(0, Math.round((new Date(isoEnd).getTime() - new Date(isoStart).getTime()) / 60000));
}

/** «N дней назад» через Intl.RelativeTimeFormat. */
export function formatVisitAgo(iso: string | null, locale: string, neverLabel: string): string {
  if (!iso) return neverLabel;
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  try {
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    return rtf.format(-days, "day");
  } catch {
    return String(days);
  }
}
