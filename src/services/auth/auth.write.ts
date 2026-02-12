import { supabaseClient } from "@/infra/supabase.client";
import { ServiceError } from "@/shared/errors";

export async function signInWithPassword(email: string, password: string) {
  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
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

  const storageKeys = Object.keys(window.localStorage);
  for (const key of storageKeys) {
    const normalized = key.toLowerCase();
    if (
      normalized.includes("supabase.auth.token") ||
      normalized.includes("supabase-auth-token") ||
      normalized.startsWith("sb-")
    ) {
      window.localStorage.removeItem(key);
    }
  }

  const sessionKeys = Object.keys(window.sessionStorage);
  for (const key of sessionKeys) {
    const normalized = key.toLowerCase();
    if (
      normalized.includes("supabase.auth.token") ||
      normalized.includes("supabase-auth-token") ||
      normalized.startsWith("sb-")
    ) {
      window.sessionStorage.removeItem(key);
    }
  }
}

function clearSupabaseSessionCookies() {
  if (typeof document === "undefined") {
    return;
  }

  const cookieNames = document.cookie
    .split(";")
    .map((entry) => entry.trim().split("=")[0])
    .filter(Boolean);

  for (const name of cookieNames) {
    if (name.startsWith("sb-") || name === "supabase-auth-token") {
      document.cookie = `${name}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
      document.cookie = `${name}=; Path=/; Domain=${window.location.hostname}; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
    }
  }
}

export async function signOut() {
  const { error } = await supabaseClient.auth.signOut({ scope: "local" });

  // Always attempt local cleanup to prevent session persistence if stale tokens remain.
  clearSupabaseSessionStorage();
  clearSupabaseSessionCookies();

  if (error) {
    throw new ServiceError("SUPABASE_ERROR", error.message, error);
  }
}
