import { createClient } from "@supabase/supabase-js";
import { ENV } from "@/shared/env";

export const supabaseServiceRole = createClient(
  ENV.SUPABASE_URL,
  ENV.SUPABASE_SERVICE_ROLE_KEY
);
