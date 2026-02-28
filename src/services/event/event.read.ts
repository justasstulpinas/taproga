import type { SupabaseClient } from "@supabase/supabase-js";
import { EventSummary } from "@/domain/event/event.types";
import { supabaseClient } from "@/infra/supabase.client";
import { ServiceError } from "@/shared/errors";

type EventReadClient = SupabaseClient;

export type HostEventRecord = {
  id: string;
  title: string;
  slug: string;
  state: string;
  event_date: string | null;
  host_email: string;
  guest_access_enabled: boolean;
  created_at: string;
};

export type HostGuestRecord = {
  id: string;
  event_id: string;
  name: string;
  email: string | null;
  created_at: string;
};

function ensureEmail(email: string): string {
  const normalized = email.trim().toLowerCase();

  if (!normalized) {
    throw new ServiceError("UNAUTHENTICATED", "Host email is required");
  }

  return normalized;
}

function ensureId(value: string, label: string): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new ServiceError("BAD_REQUEST", `${label} is required`);
  }

  return normalized;
}

function withClient(client?: EventReadClient): EventReadClient {
  return client ?? supabaseClient;
}

export async function getPublicEventBySlug(
  slug: string,
  client?: EventReadClient
) {
  const safeSlug = ensureId(slug, "Slug");

  const { data, error } = await withClient(client)
    .from("events")
    .select(
      "id,title,event_date,state,slug,tier,menu_enabled,guest_access_enabled,last_critical_update_at"
    )
    .eq("slug", safeSlug)
    .maybeSingle();

  if (error) {
    return null;
  }

  return data;
}

export async function listHostEvents(
  hostEmail: string,
  client?: EventReadClient
): Promise<EventSummary[]> {
  const email = ensureEmail(hostEmail);

  const { data, error } = await withClient(client)
    .from("events")
    .select("id,title,slug,state,guest_access_enabled")
    .eq("host_email", email)
    .order("created_at", { ascending: false });

  if (error) {
    throw new ServiceError("SUPABASE_ERROR", error.message, error);
  }

  return (data ?? []) as EventSummary[];
}

export async function getHostEventById(
  eventId: string,
  hostEmail: string,
  client?: EventReadClient
): Promise<HostEventRecord | null> {
  const id = ensureId(eventId, "Event id");
  const email = ensureEmail(hostEmail);

  const { data, error } = await withClient(client)
    .from("events")
    .select(
      "id,title,slug,state,event_date,host_email,guest_access_enabled,created_at"
    )
    .eq("id", id)
    .eq("host_email", email)
    .maybeSingle();

  if (error) {
    throw new ServiceError("SUPABASE_ERROR", error.message, error);
  }

  return (data as HostEventRecord | null) ?? null;
}

export async function listHostEventGuests(
  eventId: string,
  client?: EventReadClient
): Promise<HostGuestRecord[]> {
  const id = ensureId(eventId, "Event id");

  const { data, error } = await withClient(client)
    .from("guests")
    .select("id,event_id,name,email,created_at")
    .eq("event_id", id)
    .order("created_at", { ascending: true });

  if (error) {
    throw new ServiceError("SUPABASE_ERROR", error.message, error);
  }

  return (data ?? []) as HostGuestRecord[];
}

export async function countEventsBySlugPrefix(
  prefix: string,
  client?: EventReadClient
): Promise<number> {
  const safePrefix = ensureId(prefix, "Prefix");

  const { count, error } = await withClient(client)
    .from("events")
    .select("id", { count: "exact", head: true })
    .ilike("slug", `${safePrefix}%`);

  if (error) {
    throw new ServiceError("SUPABASE_ERROR", error.message, error);
  }

  return count ?? 0;
}
