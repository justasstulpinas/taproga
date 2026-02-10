import { GetServerSideProps } from "next";
import Head from "next/head";
import { useEffect, useState } from "react";

import { supabase } from "@/infra/supabase.client";
import {
  buildVerificationPhrase,
  canGuestViewEvent,
} from "@/domain/event/event.rules";
import {
  isLockedOut,
  isVerificationExpired,
  nextVerificationAttempts,
  validateVerificationInput,
} from "@/domain/guest/verification.rules";
import {
  getVerificationAttempts,
  setVerificationAttempts,
  clearVerificationAttempts,
  getVerificationRecord,
  setVerificationRecord,
  clearVerificationRecord,
} from "@/services/guest/verification.storage";
import { GuestVerificationForm } from "@/ui/guest/GuestVerificationForm";
import { Countdown } from "@/ui/guest/Countdown";

type EventState = "draft" | "paid" | "active" | "locked" | "archived";

type EventPublic = {
  id: string;
  title: string;
  event_date: string;
  state: EventState;
  guest_access_enabled: boolean;
  slug: string;
  menu_enabled: boolean;
};

type Props = {
  event: EventPublic;
};

type ErrorCode =
  | "NOT_VERIFIED"
  | "EVENT_NOT_ACTIVE"
  | "GUEST_ACCESS_DISABLED"
  | "RSVP_DEADLINE_PASSED"
  | "GUEST_NOT_FOUND"
  | "INTERNAL_ERROR"
  | "MENU_REQUIRED";

export default function PublicEventPage({ event }: Props) {
  const VERIFY_KEY = `guest_verified_${event.id}`;
  const ATTEMPTS_KEY = `guest_verify_attempts_${event.id}`;

  const [verifiedName, setVerifiedName] = useState<string | null>(null);
  const [guestId, setGuestId] = useState<string | null>(null);

  const [inputName, setInputName] = useState("");
  const [inputPhrase, setInputPhrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);

  const [menuChoice, setMenuChoice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [rsvpError, setRsvpError] = useState<ErrorCode | null>(null);
  const [success, setSuccess] = useState(false);

  const date = new Date(event.event_date);
  const formattedDate = date.toLocaleDateString("lt-LT", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const verificationPhrase = buildVerificationPhrase(event.slug);

  useEffect(() => {
    const storedAttempts = getVerificationAttempts(ATTEMPTS_KEY);
    setAttempts(storedAttempts);

    const record = getVerificationRecord(VERIFY_KEY);
    if (!record) return;

    const now = Date.now();
    if (isVerificationExpired(record.verifiedAt, now)) {
      clearVerificationRecord(VERIFY_KEY);
      return;
    }

    setVerifiedName(record.name);

    fetch("/api/resolve-guest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId: event.id,
        name: record.name,
      }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then((data) => setGuestId(data.guestId))
      .catch(() => setError("Guest resolution failed."));
  }, [ATTEMPTS_KEY, VERIFY_KEY, event.id]);

  useEffect(() => {
    let isMounted = true;

    async function loadMenuChoice() {
      if (!guestId) return;

      const { data } = await supabase
        .from("guests")
        .select("menu_choice")
        .eq("id", guestId)
        .eq("event_id", event.id)
        .single();

      if (!isMounted) return;
      setMenuChoice(data?.menu_choice ?? null);
    }

    loadMenuChoice();

    return () => {
      isMounted = false;
    };
  }, [event.id, guestId]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isLockedOut(attempts)) return;

    const result = validateVerificationInput(
      inputName,
      inputPhrase,
      verificationPhrase
    );

    if (!result.ok) {
      const next = nextVerificationAttempts(attempts);
      setVerificationAttempts(ATTEMPTS_KEY, next);
      setAttempts(next);
      setError("Verification failed.");
      return;
    }

    setVerificationRecord(VERIFY_KEY, {
      name: result.name,
      verifiedAt: new Date().toISOString(),
    });

    clearVerificationAttempts(ATTEMPTS_KEY);
    setVerifiedName(result.name);
    setAttempts(0);
    setError(null);

    try {
      const res = await fetch("/api/resolve-guest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: event.id,
          name: result.name,
        }),
      });

      if (!res.ok) throw new Error();

      const data = await res.json();
      setGuestId(data.guestId);
    } catch {
      setError("Guest resolution failed.");
    }
  };

  async function submit(rsvpStatus: "yes" | "no") {
    if (!guestId) return;

    setLoading(true);
    setRsvpError(null);

    if (event.menu_enabled && !menuChoice) {
      setRsvpError("MENU_REQUIRED");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/rsvp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: event.id,
          guestId,
          rsvpStatus,
          verified: true,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setRsvpError(data.error ?? "INTERNAL_ERROR");
        setLoading(false);
        return;
      }

      setSuccess(true);
    } catch {
      setRsvpError("INTERNAL_ERROR");
    } finally {
      setLoading(false);
    }
  }

  const lockedOut = isLockedOut(attempts);

  return (
    <>
      <Head>
        <title>{event.title}</title>
        <meta
          name="description"
          content={`Wedding invitation · ${event.title} · ${formattedDate}`}
        />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={event.title} />
        <meta
          property="og:description"
          content={`Wedding invitation · ${formattedDate}`}
        />
        <meta name="robots" content="noindex,nofollow" />
      </Head>

      <main className="min-h-screen flex items-center justify-center px-4">
        {!verifiedName ? (
          <GuestVerificationForm
            inputName={inputName}
            inputPhrase={inputPhrase}
            error={error}
            lockedOut={lockedOut}
            onNameChange={setInputName}
            onPhraseChange={setInputPhrase}
            onSubmit={handleVerify}
          />
        ) : (
          <div className="text-center">
            <h1 className="text-3xl font-semibold mb-4">{event.title}</h1>
            <p className="text-lg">{formattedDate}</p>
            <Countdown eventDate={event.event_date} />

            {success ? (
              <p className="mt-4">Ačiū, jūsų atsakymas išsaugotas.</p>
            ) : (
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

                {rsvpError && (
                  <p className="text-sm text-red-600 mt-2">
                    {rsvpError === "MENU_REQUIRED"
                      ? "Please select a menu option before submitting RSVP."
                      : rsvpError}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const slug = ctx.params?.slug;

  if (typeof slug !== "string") {
    return { notFound: true };
  }

  const { data, error } = await supabase
    .from("events")
    .select(
      "id,title,event_date,state,guest_access_enabled,slug,menu_enabled"
    )
    .eq("slug", slug)
    .single();

  if (error || !data) {
    return { notFound: true };
  }

  if (!canGuestViewEvent(data)) {
    return { notFound: true };
  }

  return {
    props: {
      event: {
        id: data.id,
        title: data.title,
        event_date: data.event_date,
        state: data.state as EventState,
        guest_access_enabled: Boolean(data.guest_access_enabled),
        slug: data.slug,
        menu_enabled: Boolean(data.menu_enabled),
      },
    },
  };
};
