/** Local-calendar helpers (browser timezone) for admin UI ranges. */

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
