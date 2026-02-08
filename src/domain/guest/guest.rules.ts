import { GuestVerificationRecord } from "@/domain/guest/guest.types";

export const MAX_VERIFICATION_ATTEMPTS = 5;
export const VERIFICATION_TTL_MS = 1000 * 60 * 60 * 24;

export function isLockedOut(attempts: number): boolean {
  return attempts >= MAX_VERIFICATION_ATTEMPTS;
}

export function validateGuestVerification(
  inputName: string,
  inputPhrase: string,
  expectedPhrase: string
): { ok: true; name: string } | { ok: false } {
  const name = inputName.trim();
  const phrase = inputPhrase.trim().toLowerCase();
  const expected = expectedPhrase.toLowerCase();

  if (name.length < 2 || name.length > 80 || phrase !== expected) {
    return { ok: false };
  }

  return { ok: true, name };
}

export function parseVerificationRecord(
  raw: string | null
): GuestVerificationRecord | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as GuestVerificationRecord;
    if (parsed?.name && parsed?.verifiedAt) {
      return parsed;
    }
  } catch {
    return null;
  }

  return null;
}

export function isVerificationExpired(
  verifiedAtIso: string,
  now: number
): boolean {
  const verifiedAt = new Date(verifiedAtIso).getTime();
  return now - verifiedAt >= VERIFICATION_TTL_MS;
}
