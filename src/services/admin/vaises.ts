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
