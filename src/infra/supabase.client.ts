import { createClient } from "@supabase/supabase-js";
import { ENV } from "@/src/shared/env";

export const supabaseClient = createClient(
  ENV.SUPABASE_URL,
  ENV.SUPABASE_ANON_KEY
);
