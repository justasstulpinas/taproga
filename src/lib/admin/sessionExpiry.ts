import { useRouter } from "next/router";
import { useCallback } from "react";
import { ApiError } from "@/lib/api/errors";

const LOGIN_PATH = "/admin/login";
const UNAUTHENTICATED = 401;

export function adminLoginPath(next: string): string {
  return `${LOGIN_PATH}?next=${encodeURIComponent(next)}`;
}

function isSessionExpired(error: unknown): boolean {
  return error instanceof ApiError && error.status === UNAUTHENTICATED;
}

/**
 * Returns a handler for failed admin calls: when the session has expired it sends the admin to
 * sign in again and back to this page. Callers still roll back their optimistic change first.
 */
export function useSessionExpiry(): (error: unknown) => void {
  const router = useRouter();
  return useCallback(
    (error: unknown) => {
      if (isSessionExpired(error)) void router.push(adminLoginPath(router.asPath));
    },
    [router],
  );
}
