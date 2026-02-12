import { useEffect, useState } from "react";
import { supabase } from "@/infra/supabase.client";

type Props = {
  eventId: string;
  guestId: string;
  verified: boolean;
};

type ErrorCode =
  | "NOT_VERIFIED"
  | "EVENT_NOT_ACTIVE"
  | "GUEST_ACCESS_DISABLED"
  | "RSVP_DEADLINE_PASSED"
  | "GUEST_NOT_FOUND"
  | "INTERNAL_ERROR";

export default function RSVPButtons({
  eventId,
  guestId,
  verified,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ErrorCode | null>(null);
  const [rsvpStatus, setRsvpStatus] = useState<"yes" | "no" | null>(null);

  // --------------------------------------------------
  // RESTORE RSVP FROM DB ON MOUNT
  // --------------------------------------------------

  useEffect(() => {
    async function loadRSVP() {
      const { data } = await supabase
        .from("guests")
        .select("rsvp")
        .eq("id", guestId)
        .single();

      if (!data) return;

      if (data.rsvp && data.rsvp !== "pending") {
        setRsvpStatus(data.rsvp);
      }
    }

    if (guestId) {
      loadRSVP();
    }
  }, [guestId]);

  async function submit(status: "yes" | "no") {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/rsvp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          guestId,
          rsvpStatus: status,
          verified,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "INTERNAL_ERROR");
        setLoading(false);
        return;
      }

      setRsvpStatus(status);
    } catch {
      setError("INTERNAL_ERROR");
    } finally {
      setLoading(false);
    }
  }

  // --------------------------------------------------
  // RENDER
  // --------------------------------------------------

  if (rsvpStatus) {
    return (
      <p className="mt-4">
        Ačiū, jūsų atsakymas išsaugotas.
      </p>
    );
  }

  return (
    <div className="mt-6 space-y-3">
      <button
        disabled={loading}
        onClick={() => submit("yes")}
        className="w-full bg-black text-white py-2"
      >
        Dalyvausiu
      </button>

      <button
        disabled={loading}
        onClick={() => submit("no")}
        className="w-full border py-2"
      >
        Nedalyvausiu
      </button>

      {error && (
        <p className="text-sm text-red-600 mt-2">
          {error}
        </p>
      )}
    </div>
  );
}
