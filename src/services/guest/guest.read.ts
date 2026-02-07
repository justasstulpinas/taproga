import { GuestVerificationRecord } from "@/src/domain/guest/guest.types";
import { parseVerificationRecord } from "@/src/domain/guest/guest.rules";

export function getVerificationRecord(
  key: string
): GuestVerificationRecord | null {
  const raw = sessionStorage.getItem(key);
  if (!raw) return null;

  const parsed = parseVerificationRecord(raw);
  if (!parsed) {
    sessionStorage.removeItem(key);
    return null;
  }

  return parsed;
}

export function getVerificationAttempts(key: string): number {
  const rawAttempts = sessionStorage.getItem(key);
  if (!rawAttempts) return 0;

  const parsed = parseInt(rawAttempts, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}
