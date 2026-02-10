import { createClient } from "@supabase/supabase-js";
import { ENV } from "@/shared/env";

export const supabaseClient = createClient(
  ENV.SUPABASE_URL,
  ENV.SUPABASE_ANON_KEY
);

export const supabase = supabaseClient;
