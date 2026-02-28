import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseServiceRole } from "@/infra/supabase.service";

type PhotoRow = {
  id: string;
  storage_path: string;
  created_at: string;
};

type PhotoResponse = {
  id: string;
  signedUrl: string;
  created_at: string;
};

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  }

  const { eventId } = req.query;

  if (typeof eventId !== "string" || !eventId.trim()) {
    return res.status(400).json({ error: "INVALID_EVENT_ID" });
  }

  const { data: event, error: eventError } = await supabaseServiceRole
    .from("events")
    .select(
      "id,state,guest_access_enabled,event_date,tier,post_event_enabled,storage_grace_until"
    )
    .eq("id", eventId)
    .maybeSingle();

  if (eventError) {
    return res.status(500).json({ error: eventError.message });
  }

  if (!event) {
    return res.status(404).json({ error: "EVENT_NOT_FOUND" });
  }

  if (event.tier < 3 || event.post_event_enabled !== true) {
    return res.status(403).json({ error: "POST_EVENT_NOT_ALLOWED" });
  }

  const eventDateMs = new Date(event.event_date).getTime();
  if (Number.isNaN(eventDateMs)) {
    return res.status(400).json({ error: "INVALID_EVENT_DATE" });
  }

  const nowMs = Date.now();
  const postEventStartMs = eventDateMs + TWELVE_HOURS_MS;

  if (nowMs >= postEventStartMs) {
    const graceMs = event.storage_grace_until
      ? new Date(event.storage_grace_until).getTime()
      : Number.NaN;

    if (Number.isNaN(graceMs) || nowMs >= graceMs) {
      return res.status(403).json({ error: "STORAGE_EXPIRED" });
    }
  } else if (
    event.state !== "active" ||
    event.guest_access_enabled !== true
  ) {
    return res.status(403).json({ error: "EVENT_NOT_VISIBLE" });
  }

  const { data: photos, error: photosError } = await supabaseServiceRole
    .from("event_photos")
    .select("id,storage_path,created_at")
    .eq("event_id", eventId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (photosError) {
    return res.status(500).json({ error: photosError.message });
  }

  const signedPhotos: PhotoResponse[] = [];

  for (const photo of (photos ?? []) as PhotoRow[]) {
    const { data: signedData, error: signedError } = await supabaseServiceRole
      .storage
      .from("event-photos")
      .createSignedUrl(photo.storage_path, 60);

    if (signedError || !signedData?.signedUrl) {
      return res.status(500).json({
        error: signedError?.message ?? "FAILED_TO_SIGN_PHOTO_URL",
      });
    }

    signedPhotos.push({
      id: photo.id,
      signedUrl: signedData.signedUrl,
      created_at: photo.created_at,
    });
  }

  return res.status(200).json(signedPhotos);
}
