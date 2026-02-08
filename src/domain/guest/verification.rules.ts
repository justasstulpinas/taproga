export const MAX_VERIFICATION_ATTEMPTS = 5;
export const VERIFICATION_TTL_MS = 1000 * 60 * 60 * 24;

export function isLockedOut(attempts: number): boolean {
  return attempts >= MAX_VERIFICATION_ATTEMPTS;
}

export function nextVerificationAttempts(currentAttempts: number): number {
  return currentAttempts + 1;
}

export function isVerificationExpired(
  verifiedAtIso: string,
  nowMs: number
): boolean {
  const verifiedAt = new Date(verifiedAtIso).getTime();
  return nowMs - verifiedAt >= VERIFICATION_TTL_MS;
}

export function validateVerificationInput(
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
