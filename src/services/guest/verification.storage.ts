import { GuestVerificationRecord } from "@/domain/guest/guest.types";
import { parseVerificationRecord } from "@/domain/guest/guest.rules";

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

export function setVerificationRecord(
  key: string,
  record: GuestVerificationRecord
) {
  sessionStorage.setItem(key, JSON.stringify(record));
}

export function clearVerificationRecord(key: string) {
  sessionStorage.removeItem(key);
}

export function getVerificationAttempts(key: string): number {
  const rawAttempts = sessionStorage.getItem(key);
  if (!rawAttempts) return 0;

  const parsed = parseInt(rawAttempts, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function setVerificationAttempts(key: string, attempts: number) {
  sessionStorage.setItem(key, String(attempts));
}

export function clearVerificationAttempts(key: string) {
  sessionStorage.removeItem(key);
}
