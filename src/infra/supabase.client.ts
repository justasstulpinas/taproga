import { createBrowserClient } from "@supabase/ssr";
import { ENV } from "@/shared/env";

export const supabaseClient = createBrowserClient(
  ENV.SUPABASE_URL,
  ENV.SUPABASE_ANON_KEY
);

export const supabase = supabaseClient;
