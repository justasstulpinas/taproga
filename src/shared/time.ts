export function nowMs(): number {
  return Date.now();
}

export function nowIsoString(): string {
  return new Date().toISOString();
}

export function toIsoString(date: Date): string {
  return date.toISOString();
}

export function formatEventDateLtLt(eventDateIso: string): string {
  const date = new Date(eventDateIso);
  return date.toLocaleDateString("lt-LT", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function calculateDaysRemaining(eventDateIso: string, now: number): number {
  const target = new Date(eventDateIso).getTime();
  const diff = target - now;
  return Math.max(Math.ceil(diff / (1000 * 60 * 60 * 24)), 0);
}
