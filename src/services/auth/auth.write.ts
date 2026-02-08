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
