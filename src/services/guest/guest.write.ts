import { GuestVerificationRecord } from "@/src/domain/guest/guest.types";

export function setVerificationRecord(
  key: string,
  record: GuestVerificationRecord
) {
  sessionStorage.setItem(key, JSON.stringify(record));
}

export function clearVerificationRecord(key: string) {
  sessionStorage.removeItem(key);
}

export function setVerificationAttempts(key: string, attempts: number) {
  sessionStorage.setItem(key, String(attempts));
}

export function clearVerificationAttempts(key: string) {
  sessionStorage.removeItem(key);
}
