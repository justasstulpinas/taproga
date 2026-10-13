export const DEFAULT_ADMIN_PATH = "/admin/vaises/uzklausos";

const ADMIN_PREFIX = "/admin/";

/** Only same-site admin paths are followed after sign-in; anything else is an open-redirect risk. */
export function safeNext(next: string | string[] | undefined): string {
  if (typeof next !== "string") return DEFAULT_ADMIN_PATH;
  if (!next.startsWith(ADMIN_PREFIX) || next.includes("\\")) return DEFAULT_ADMIN_PATH;
  return next;
}
