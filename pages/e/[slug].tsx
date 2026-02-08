import { GetServerSideProps } from "next";
import Head from "next/head";
import { useEffect, useState } from "react";

import { getPublicEventBySlug } from "@/services/event/event.read";

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
import RSVPButtons from "@/ui/guest/RSVPButtons";

type EventState = "draft" | "paid" | "active" | "locked" | "archived";

type EventPublic = {
  id: string;
  title: string;
  event_date: string;
  state: EventState;
  verificationPhrase: string;
};

type Props = {
  event: EventPublic;
};

export default function PublicEventPage({ event }: Props) {
  const VERIFY_KEY = `guest_verified_${event.id}`;
  const ATTEMPTS_KEY = `guest_verify_attempts_${event.id}`;

  const [verifiedName, setVerifiedName] = useState<string | null>(null);
  const [guestId, setGuestId] = useState<string | null>(null);

  const [inputName, setInputName] = useState("");
  const [inputPhrase, setInputPhrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);

  const date = new Date(event.event_date);
  const formattedDate = date.toLocaleDateString("lt-LT", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Restore verification from sessionStorage
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

    // resolve guest via API (server-only service role)
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

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isLockedOut(attempts)) return;

    const result = validateVerificationInput(
      inputName,
      inputPhrase,
      event.verificationPhrase
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

            {guestId && (
              <RSVPButtons
                eventId={event.id}
                guestId={guestId}
                verified={true}
              />
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

  const data = await getPublicEventBySlug(slug);

  if (!data) {
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
        verificationPhrase: buildVerificationPhrase(data.slug),
      },
    },
  };
};
