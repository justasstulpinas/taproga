import type { ContactValue } from "@/lib/vaises/dateInquiry";

export type DateAvailability = "available" | "reserved";

// Placeholder until the FastAPI endpoint exists: reserved dates will come from the database.
// Add "YYYY-MM-DD" entries here to preview the "reserved" state locally.
const PLACEHOLDER_RESERVED_DATES: ReadonlySet<string> = new Set<string>([]);

export async function checkDateAvailability(isoDate: string): Promise<DateAvailability> {
  return PLACEHOLDER_RESERVED_DATES.has(isoDate) ? "reserved" : "available";
}

export type DateInquiry = {
  isoDate: string;
  availability: DateAvailability;
  contact: ContactValue;
};

// Placeholder until the FastAPI endpoint exists: the inquiry is not stored or sent anywhere yet.
export async function submitDateInquiry(inquiry: DateInquiry): Promise<void> {
  void inquiry;
}

// Placeholder until the FastAPI endpoint exists: the request is not stored or sent anywhere yet.
export async function submitConsultationRequest(contact: ContactValue): Promise<void> {
  void contact;
}
