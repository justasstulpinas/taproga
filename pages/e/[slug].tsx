import { GetServerSideProps } from "next";
import Head from "next/head";
import { useEffect, useState } from "react";
import { supabase } from "@/infra/supabase.client";
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
  lastCriticalUpdateAt: string | null;
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
  const [showBanner, setShowBanner] = useState(false);

  // Restore verification
  useEffect(() => {
    const storedAttempts = getVerificationAttempts(ATTEMPTS_KEY);
    setAttempts(storedAttempts);

    const record = getVerificationRecord(VERIFY_KEY);
    if (!record) return;

    if (isVerificationExpired(record.verifiedAt, Date.now())) {
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
      .then((res) => res.json())
      .then((data) => setGuestId(data.guestId));
  }, [event.id]);

  // One-time banner logic
  useEffect(() => {
    async function checkUpdate() {
      if (!guestId) return;
      if (!event.lastCriticalUpdateAt) return;

      const { data: guest } = await supabase
        .from("guests")
        .select("last_seen_update_at")
        .eq("id", guestId)
        .single();

      const eventTime = new Date(event.lastCriticalUpdateAt).getTime();
      const seenTime = guest?.last_seen_update_at
        ? new Date(guest.last_seen_update_at).getTime()
        : 0;

      if (seenTime < eventTime) {
        setShowBanner(true);

        await supabase
          .from("guests")
          .update({
            last_seen_update_at: event.lastCriticalUpdateAt,
          })
          .eq("id", guestId);
      } else {
        setShowBanner(false);
      }
    }

    checkUpdate();
  }, [guestId, event.lastCriticalUpdateAt]);

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

    const res = await fetch("/api/resolve-guest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId: event.id,
        name: result.name,
      }),
    });

    const data = await res.json();
    setGuestId(data.guestId);
  };

  return (
    <>
      <Head>
        <title>{event.title}</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>

      <main className="min-h-screen flex items-center justify-center px-4">
        {!verifiedName ? (
          <GuestVerificationForm
            inputName={inputName}
            inputPhrase={inputPhrase}
            error={error}
            lockedOut={isLockedOut(attempts)}
            onNameChange={setInputName}
            onPhraseChange={setInputPhrase}
            onSubmit={handleVerify}
          />
        ) : (
          <div className="text-center max-w-md w-full">
            {showBanner && (
              <div className="bg-yellow-100 border border-yellow-300 p-3 mb-4 text-sm rounded">
                Informacija buvo atnaujinta.
              </div>
            )}

            <h1 className="text-3xl font-semibold mb-4">{event.title}</h1>
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
  if (typeof slug !== "string") return { notFound: true };

  const data = await getPublicEventBySlug(slug);
  if (!data || !canGuestViewEvent(data)) return { notFound: true };

  return {
    props: {
      event: {
        id: data.id,
        title: data.title,
        event_date: data.event_date,
        state: data.state as EventState,
        verificationPhrase: buildVerificationPhrase(data.slug),
        lastCriticalUpdateAt: data.last_critical_update_at ?? null,
      },
    },
  };
};
