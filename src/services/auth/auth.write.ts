import { supabaseClient } from "@/infra/supabase.client";
import { ServiceError } from "@/shared/errors";

export async function signInWithPassword(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email: normalizedEmail,
    password,
  });

  if (error) {
    throw new ServiceError("SUPABASE_ERROR", error.message, error);
  }

  return data;
}

function clearSupabaseSessionStorage() {
  if (typeof window === "undefined") {
    return;
  }

  const stores: Storage[] = [window.localStorage, window.sessionStorage];

  for (const store of stores) {
    for (const key of Object.keys(store)) {
      const normalized = key.toLowerCase();
      if (
        normalized.includes("supabase.auth.token") ||
        normalized.includes("supabase-auth-token") ||
        normalized.startsWith("sb-")
      ) {
        store.removeItem(key);
      }
    }
  }
}

function clearSupabaseSessionCookies() {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return;
  }

  const cookieNames = document.cookie
    .split(";")
    .map((part) => part.trim().split("=")[0])
    .filter(Boolean);

  for (const name of cookieNames) {
    if (!name.startsWith("sb-") && name !== "supabase-auth-token") {
      continue;
    }

    document.cookie = `${name}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
    document.cookie = `${name}=; Path=/; Domain=${window.location.hostname}; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
  }
}

export async function logout() {
  const { error } = await supabaseClient.auth.signOut({ scope: "local" });

  clearSupabaseSessionStorage();
  clearSupabaseSessionCookies();

  if (error) {
    throw new ServiceError("SUPABASE_ERROR", error.message, error);
  }
}

export const signOut = logout;
