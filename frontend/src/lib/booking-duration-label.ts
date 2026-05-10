/** Shared duration label logic: fixed minutes vs range → “confirm by phone” copy. */

export function miniAppBookingDurationLabel(
  svc: {
    duration_minutes: number;
    duration_max_minutes?: number | null;
    duration_type: string;
  },
  tDurationMinutes: (values: { minutes: number }) => string,
  tRangeNote: () => string,
): string {
  if (
    svc.duration_type === 'range' &&
    svc.duration_max_minutes != null &&
    svc.duration_max_minutes > svc.duration_minutes
  ) {
    return tRangeNote();
  }
  return tDurationMinutes({ minutes: svc.duration_minutes });
}

export function adminBookingDurationLabel(
  svc: {
    duration_minutes: number;
    duration_max_minutes?: number | null;
    duration_type?: string;
  },
  tMinutesLabel: (minutes: number) => string,
  tRangeNote: () => string,
): string {
  if (
    svc.duration_type === 'range' &&
    svc.duration_max_minutes != null &&
    svc.duration_max_minutes > svc.duration_minutes
  ) {
    return tRangeNote();
  }
  return tMinutesLabel(svc.duration_minutes);
}
