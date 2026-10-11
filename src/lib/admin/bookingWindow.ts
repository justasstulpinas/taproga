import { parseIsoDate } from "@/lib/admin/vilniusToday";
import { toIsoDate, type MonthCursor } from "@/lib/vaises/dateInquiry";

const BOOKING_WINDOW_YEARS = 3;
const FEB_28 = 28;
/** The longest range the blocked-dates API returns in one call. */
export const BLOCKED_RANGE_DAYS = 400;

/** Last bookable date, matching the backend's booking_window_end: Feb 29 maps to Feb 28. */
export function bookingWindowEndIso(todayIso: string): string {
  const today = parseIsoDate(todayIso);
  const year = today.getFullYear() + BOOKING_WINDOW_YEARS;
  const end = new Date(year, today.getMonth(), today.getDate());
  return toIsoDate(end.getMonth() === today.getMonth() ? end : new Date(year, today.getMonth(), FEB_28));
}

export function addDaysIso(iso: string, days: number): string {
  const date = parseIsoDate(iso);
  return toIsoDate(new Date(date.getFullYear(), date.getMonth(), date.getDate() + days));
}

export function monthOfIso(iso: string): MonthCursor {
  const date = parseIsoDate(iso);
  return { year: date.getFullYear(), month: date.getMonth() };
}

export function monthRangeIso(cursor: MonthCursor): { from: string; to: string } {
  return {
    from: toIsoDate(new Date(cursor.year, cursor.month, 1)),
    to: toIsoDate(new Date(cursor.year, cursor.month + 1, 0)),
  };
}
