import { NewEventInput } from "@/domain/event/event.types";
import { supabaseClient } from "@/infra/supabase.client";
import { requireSession } from "@/services/auth/auth.read";
import { ServiceError } from "@/shared/errors";
import { createDefaultPanels } from "@/lib/panels/defaultPanels";

function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[ą]/g, "a")
    .replace(/[č]/g, "c")
    .replace(/[ęė]/g, "e")
    .replace(/[į]/g, "i")
    .replace(/[š]/g, "s")
    .replace(/[ųū]/g, "u")
    .replace(/[ž]/g, "z")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function randomSuffix(): string {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  }

  return Math.random().toString(16).slice(2, 10).padEnd(8, "0").slice(0, 8);
}

function buildCleanSlug(title: string): string {
  const baseSlug = slugifyTitle(title) || "event";
  return `${baseSlug}-${randomSuffix()}`;
}

function isSlugDuplicateError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const code =
    "code" in error && typeof error.code === "string" ? error.code : "";
  const message =
    "message" in error && typeof error.message === "string" ? error.message : "";

  return code === "23505" || message.includes("events_slug_key");
}

export async function createEvent(input: NewEventInput) {
  const session = await requireSession();
  const hostId = session.user.id;
  const hostEmail = session.user.email;

  if (!hostId) {
    throw new ServiceError("UNAUTHENTICATED", "Host id is required");
  }

  if (!hostEmail) {
    throw new ServiceError("UNAUTHENTICATED", "Host email is required");
  }

  if (!input.title?.trim()) {
    throw new ServiceError("BAD_REQUEST", "Title is required");
  }

  if (!input.event_date) {
    throw new ServiceError("BAD_REQUEST", "Event date is required");
  }

  const tier = input.tier ?? 1;
  const panels = createDefaultPanels();
  const maxAttempts = 8;
  let data: { id: string; slug: string } | null = null;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const generatedSlug = buildCleanSlug(input.title);

    const { data: inserted, error } = await supabaseClient
      .from("events")
      .insert({
        title: input.title,
        slug: generatedSlug,
        event_date: input.event_date,
        tier,
        host_id: hostId,
        host_email: hostEmail,
        state: "draft",
        panels,
      })
      .select("id, slug")
      .single();

    if (!error && inserted) {
      data = inserted;
      break;
    }

    lastError = error;
    if (isSlugDuplicateError(error)) {
      continue;
    }

    throw new ServiceError(
      "SUPABASE_ERROR",
      error?.message ?? "Failed to create event",
      error
    );
  }

  if (!data) {
    throw new ServiceError(
      "SUPABASE_ERROR",
      "Failed to generate unique slug for event",
      lastError
    );
  }

  return {
    id: data.id,
    slug: data.slug,
  };
}

export async function toggleGuestAccess(eventId: string, enabled: boolean) {
  const normalizedEventId = eventId.trim();
  if (!normalizedEventId) {
    throw new ServiceError("BAD_REQUEST", "Event id is required");
  }

  const session = await requireSession();
  const hostEmail = session.user.email?.trim().toLowerCase();

  if (!hostEmail) {
    throw new ServiceError("UNAUTHENTICATED", "Host email is required");
  }

  const { data, error } = await supabaseClient
    .from("events")
    .update({
      guest_access_enabled: enabled,
      last_critical_update_at: new Date().toISOString(),
    })
    .eq("id", normalizedEventId)
    .eq("host_email", hostEmail)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new ServiceError("SUPABASE_ERROR", error.message, error);
  }

  if (!data) {
    throw new ServiceError("NOT_FOUND", "Event not found");
  }
}
