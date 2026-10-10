import { apiFetch } from "@/lib/api/client";
import type { ContactValue } from "@/lib/vaises/dateInquiry";

export type DateAvailability = "available" | "reserved";

const LOCALE = "lt";

type SubmitOptions = { idempotencyKey: string; turnstileToken: string };

export async function checkDateAvailability(isoDate: string): Promise<DateAvailability> {
  const result = await apiFetch<{ availability: DateAvailability }>(
    `/vaises/availability?date=${encodeURIComponent(isoDate)}`,
  );
  return result.availability;
}

export type DateInquiry = {
  isoDate: string;
  availability: DateAvailability;
  contact: ContactValue;
};

// The server recomputes availability, so the client's view of it is deliberately not sent.
export async function submitDateInquiry(inquiry: DateInquiry & SubmitOptions): Promise<void> {
  await apiFetch("/vaises/date-inquiries", {
    method: "POST",
    body: JSON.stringify({
      date: inquiry.isoDate,
      contact: inquiry.contact.value,
      locale: LOCALE,
      idempotency_key: inquiry.idempotencyKey,
      turnstile_token: inquiry.turnstileToken,
    }),
  });
}

export async function submitConsultationRequest(
  contact: ContactValue,
  opts: SubmitOptions,
): Promise<void> {
  await apiFetch("/vaises/consultation-requests", {
    method: "POST",
    body: JSON.stringify({
      contact: contact.value,
      locale: LOCALE,
      idempotency_key: opts.idempotencyKey,
      turnstile_token: opts.turnstileToken,
    }),
  });
}
