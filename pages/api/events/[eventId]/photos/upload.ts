import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseServiceRole } from "@/infra/supabase.service";

type UploadBody = {
  fileBase64?: string;
  imageBase64?: string;
  base64?: string;
};

const TEN_MB_BYTES = 10 * 1024 * 1024;

function extractBase64(body: UploadBody): string | null {
  const raw = body.fileBase64 ?? body.imageBase64 ?? body.base64 ?? null;
  if (!raw) {
    return null;
  }

  const marker = "base64,";
  const markerIndex = raw.indexOf(marker);

  if (markerIndex !== -1) {
    return raw.slice(markerIndex + marker.length);
  }

  return raw;
}

function decodeBase64ToBuffer(value: string): Buffer | null {
  const normalized = value.trim().replace(/\s+/g, "");

  if (!normalized) {
    return null;
  }

  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
    return null;
  }

  try {
    return Buffer.from(normalized, "base64");
  } catch {
    return null;
  }
}

function devDetails(details: string) {
  return process.env.NODE_ENV === "development" ? { details } : {};
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({
      error: "SERVICE_ROLE_KEY_MISSING",
    });
  }

  try {
    const { eventId } = req.query;

    if (typeof eventId !== "string" || !eventId.trim()) {
      return res.status(400).json({ error: "INVALID_EVENT_ID" });
    }

    const { data: event, error: eventError } = await supabaseServiceRole
      .from("events")
      .select(
        "id,tier,post_event_enabled,guest_photo_upload_enabled,storage_grace_until"
      )
      .eq("id", eventId)
      .maybeSingle();

    if (eventError) {
      console.error("EVENT_FETCH_ERROR:", eventError);
      return res.status(500).json({
        error: "EVENT_FETCH_FAILED",
        ...devDetails(eventError.message),
      });
    }

    if (!event) {
      return res.status(404).json({ error: "EVENT_NOT_FOUND" });
    }

    if (event.tier < 3) {
      return res.status(403).json({ error: "TIER_3_REQUIRED" });
    }

    if (event.post_event_enabled !== true) {
      return res.status(403).json({ error: "POST_EVENT_DISABLED" });
    }

    if (event.guest_photo_upload_enabled !== true) {
      return res.status(403).json({ error: "GUEST_PHOTO_UPLOAD_DISABLED" });
    }

    const graceMs = event.storage_grace_until
      ? new Date(event.storage_grace_until).getTime()
      : Number.NaN;

    if (Number.isNaN(graceMs) || Date.now() > graceMs) {
      return res.status(403).json({ error: "STORAGE_EXPIRED" });
    }

    const base64 = extractBase64((req.body ?? {}) as UploadBody);

    if (!base64) {
      return res.status(400).json({ error: "MISSING_IMAGE_BASE64" });
    }

    const buffer = decodeBase64ToBuffer(base64);

    if (!buffer || buffer.length === 0) {
      return res.status(400).json({ error: "INVALID_IMAGE_BASE64" });
    }

    if (buffer.length > TEN_MB_BYTES) {
      return res.status(400).json({ error: "INVALID_FILE_SIZE" });
    }

    const photoId = crypto.randomUUID();
    const storagePath = `${eventId}/${photoId}.jpg`;

    const bucket = "event-photos";

    const { error: uploadError } =
      await supabaseServiceRole.storage
        .from(bucket)
        .upload(storagePath, buffer, {
          contentType: "image/jpeg",
          upsert: false,
        });

    if (uploadError) {
      console.error("STORAGE_UPLOAD_ERROR:", uploadError);
      return res.status(500).json({
        error: "STORAGE_UPLOAD_FAILED",
        details: uploadError.message,
      });
    }

    const { error: insertError } = await supabaseServiceRole
      .from("event_photos")
      .insert({
        id: photoId,
        event_id: eventId,
        storage_path: storagePath,
      });

    if (insertError) {
      console.error("PHOTO_DB_INSERT_ERROR:", insertError);
      await supabaseServiceRole.storage.from(bucket).remove([storagePath]);
      return res.status(500).json({
        error: "PHOTO_DB_INSERT_FAILED",
        ...devDetails(insertError.message),
      });
    }

    return res.status(200).json({ id: photoId });
  } catch (error) {
    console.error("UPLOAD_HANDLER_UNCAUGHT_ERROR:", error);

    const details =
      error instanceof Error
        ? error.stack ?? error.message
        : "Unknown upload error";

    return res.status(500).json({
      error: "INTERNAL_ERROR",
      ...devDetails(details),
    });
  }
}
