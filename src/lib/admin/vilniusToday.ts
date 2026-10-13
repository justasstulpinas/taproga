const VILNIUS_TZ = "Europe/Vilnius";

/** Today's calendar date in Vilnius as YYYY-MM-DD, whatever timezone the device is in. */
export function vilniusTodayIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: VILNIUS_TZ }).format(now);
}

/** Local-midnight Date for a YYYY-MM-DD string, the shape the calendar helpers expect. */
export function parseIsoDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}
