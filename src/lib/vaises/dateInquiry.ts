export const LT_MONTHS = [
  "Sausis",
  "Vasaris",
  "Kovas",
  "Balandis",
  "Gegužė",
  "Birželis",
  "Liepa",
  "Rugpjūtis",
  "Rugsėjis",
  "Spalis",
  "Lapkritis",
  "Gruodis",
] as const;

/** Monday first, matching buildMonthCells. */
export const LT_WEEKDAYS_SHORT = ["Pr", "An", "Tr", "Kt", "Pn", "Št", "Sk"] as const;

const DAYS_IN_WEEK = 7;
// Always six rows, so the calendar keeps the same height whichever month is shown.
const GRID_CELLS = DAYS_IN_WEEK * 6;

export type MonthCursor = { year: number; month: number };

export type CalendarCell =
  | { kind: "blank"; key: string }
  | { kind: "day"; key: string; date: Date; day: number; isPast: boolean };

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function shiftMonth(cursor: MonthCursor, delta: number): MonthCursor {
  const shifted = new Date(cursor.year, cursor.month + delta, 1);
  return { year: shifted.getFullYear(), month: shifted.getMonth() };
}

export function isSameMonth(a: MonthCursor, b: MonthCursor): boolean {
  return a.year === b.year && a.month === b.month;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Monday-first 6x7 grid; leading blanks align the 1st under its weekday. */
export function buildMonthCells(cursor: MonthCursor, today: Date): CalendarCell[] {
  const firstWeekday = (new Date(cursor.year, cursor.month, 1).getDay() + 6) % DAYS_IN_WEEK;
  const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();

  const blanks: CalendarCell[] = Array.from({ length: firstWeekday }, (_, index) => ({
    kind: "blank",
    key: `blank-${index}`,
  }));
  const days: CalendarCell[] = Array.from({ length: daysInMonth }, (_, index) => {
    const date = new Date(cursor.year, cursor.month, index + 1);
    return { kind: "day", key: `day-${index + 1}`, date, day: index + 1, isPast: date < today };
  });
  const trailing: CalendarCell[] = Array.from(
    { length: GRID_CELLS - blanks.length - days.length },
    (_, index) => ({ kind: "blank", key: `trailing-${index}` })
  );
  return [...blanks, ...days, ...trailing];
}

/** Calendar date as YYYY-MM-DD, independent of timezone (a wedding date has no time). */
export function toIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function formatLongDateLt(date: Date): string {
  return new Intl.DateTimeFormat("lt-LT", { dateStyle: "long" }).format(date);
}

/** With the weekday, for screen readers: the visible grid shows it as a column header instead. */
export function formatFullDateLt(date: Date): string {
  return new Intl.DateTimeFormat("lt-LT", { dateStyle: "full" }).format(date);
}

export type ContactValue =
  | { kind: "email"; value: string }
  | { kind: "phone"; value: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+?\d{8,15}$/;
const PHONE_SEPARATORS = /[\s\-().]/g;

/** How we'll reach them, in the instrumental case: "el. paštu …" / "telefonu …". */
export function describeContactLt(contact: ContactValue): string {
  return contact.kind === "email" ? `el. paštu ${contact.value}` : `telefonu ${contact.value}`;
}

/** One field accepts either an email or a phone number; returns null if it's neither. */
export function parseContact(raw: string): ContactValue | null {
  const trimmed = raw.trim();
  if (trimmed.includes("@")) {
    return EMAIL_PATTERN.test(trimmed) ? { kind: "email", value: trimmed.toLowerCase() } : null;
  }
  const phone = trimmed.replace(PHONE_SEPARATORS, "");
  return PHONE_PATTERN.test(phone) ? { kind: "phone", value: phone } : null;
}

// Mirrors the API's message limits (api/app/schemas/vaises.py); the two must agree.
export const MESSAGE_MAX_WORDS = 50;
export const MESSAGE_MAX_CHARS = 600;

/** Words as the API counts them: runs of non-whitespace. */
export function countWords(text: string): number {
  return text.match(/\S+/gu)?.length ?? 0;
}
