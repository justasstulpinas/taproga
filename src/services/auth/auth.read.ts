import { supabaseClient } from "@/infra/supabase.client";
import { ServiceError } from "@/shared/errors";

export async function getSession() {
  const { data, error } = await supabaseClient.auth.getSession();

  if (error) {
    throw new ServiceError("SUPABASE_ERROR", error.message, error);
  }

  return data.session;
}

export async function requireSession() {
  const session = await getSession();

  if (!session) {
    throw new ServiceError("UNAUTHENTICATED", "Not authenticated");
  }

  return session;
}
