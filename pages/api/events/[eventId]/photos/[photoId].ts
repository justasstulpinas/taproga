import type { NextApiRequest, NextApiResponse } from "next";
import { createServerClient } from "@supabase/ssr";
import { parse, serialize } from "cookie";
import { ENV } from "@/shared/env";
import { supabaseServiceRole } from "@/infra/supabase.service";

function createApiSupabaseClient(req: NextApiRequest, res: NextApiResponse) {
  return createServerClient(ENV.SUPABASE_URL, ENV.SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        const parsed = parse(req.headers.cookie ?? "");
        return Object.entries(parsed).map(([name, value]) => ({
          name,
          value: value ?? "",
        }));
      },
      setAll(cookiesToSet) {
        const previous = res.getHeader("Set-Cookie");
        const current = Array.isArray(previous)
          ? previous.map(String)
          : previous
          ? [String(previous)]
          : [];

        const next = cookiesToSet.map(({ name, value, options }) =>
          serialize(name, value, { path: "/", ...options })
        );

        res.setHeader("Set-Cookie", [...current, ...next]);
      },
    },
  });
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "DELETE") {
    return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  }

  const { eventId, photoId } = req.query;

  if (
    typeof eventId !== "string" ||
    !eventId.trim() ||
    typeof photoId !== "string" ||
    !photoId.trim()
  ) {
    return res.status(400).json({ error: "INVALID_PARAMS" });
  }

  const supabase = createApiSupabaseClient(req, res);

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return res.status(401).json({ error: "UNAUTHENTICATED" });
  }

  const { data: event, error: eventError } = await supabaseServiceRole
    .from("events")
    .select("id,host_id")
    .eq("id", eventId)
    .maybeSingle();

  if (eventError) {
    return res.status(500).json({ error: eventError.message });
  }

  if (!event) {
    return res.status(404).json({ error: "EVENT_NOT_FOUND" });
  }

  if (event.host_id !== user.id) {
    return res.status(403).json({ error: "FORBIDDEN" });
  }

  const { data: photo, error: photoError } = await supabaseServiceRole
    .from("event_photos")
    .select("id,event_id,storage_path")
    .eq("id", photoId)
    .eq("event_id", eventId)
    .maybeSingle();

  if (photoError) {
    return res.status(500).json({ error: photoError.message });
  }

  if (!photo) {
    return res.status(404).json({ error: "PHOTO_NOT_FOUND" });
  }

  const { error: deleteError } = await supabaseServiceRole
    .from("event_photos")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", photoId)
    .eq("event_id", eventId);

  if (deleteError) {
    return res.status(500).json({ error: deleteError.message });
  }

  const { error: storageError } = await supabaseServiceRole
    .storage
    .from("event-photos")
    .remove([photo.storage_path]);

  if (storageError) {
    return res.status(500).json({ error: storageError.message });
  }

  return res.status(200).json({ ok: true });
}
