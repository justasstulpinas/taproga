import { apiFetch } from "@/lib/api/client";

const BASE = "/admin/vaises/blocked-dates";

export async function listBlockedDates(from: string, to: string): Promise<string[]> {
  const rows = await apiFetch<{ date: string }[]>(
    `${BASE}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  );
  return rows.map((row) => row.date);
}

export async function blockDate(isoDate: string, idempotencyKey: string): Promise<void> {
  await apiFetch(BASE, {
    method: "POST",
    body: JSON.stringify({ date: isoDate, idempotency_key: idempotencyKey }),
  });
}

export async function unblockDate(isoDate: string): Promise<void> {
  await apiFetch(`${BASE}/${encodeURIComponent(isoDate)}`, { method: "DELETE" });
}

export type VaisesRequestStatus = "new" | "handled";

export type VaisesServiceKind = "uzkandziai" | "renginiai" | "vestuves";

export type VaisesRequestOut = {
  id: string;
  kind: "date_inquiry" | "consultation";
  event_date: string | null;
  event_date_label: string | null;
  service: VaisesServiceKind | null;
  message: string | null;
  availability_at_submit: "available" | "reserved" | null;
  contact_kind: "email" | "phone" | null;
  contact: string | null;
  status: VaisesRequestStatus;
  created_at: string;
  handled_at: string | null;
  anonymised_at: string | null;
};

export type VaisesRequestPage = { items: VaisesRequestOut[]; next_cursor: string | null };

const REQUESTS = "/admin/vaises/requests";

export function listRequests(status: VaisesRequestStatus, cursor?: string): Promise<VaisesRequestPage> {
  const params = new URLSearchParams({ status });
  if (cursor) params.set("cursor", cursor);
  return apiFetch<VaisesRequestPage>(`${REQUESTS}?${params.toString()}`);
}

function post(id: string, action: "handled" | "reopen" | "erase"): Promise<VaisesRequestOut> {
  return apiFetch<VaisesRequestOut>(`${REQUESTS}/${encodeURIComponent(id)}/${action}`, { method: "POST" });
}

export const markHandled = (id: string) => post(id, "handled");
export const reopen = (id: string) => post(id, "reopen");
export const erase = (id: string) => post(id, "erase");
