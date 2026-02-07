// /pages/e/[slug].tsx
import { GetServerSideProps } from "next";
import Head from "next/head";
import { useEffect, useState } from "react";
import { canGuestViewEvent } from "@/src/domain/event/event.guards";
import { buildVerificationPhrase } from "@/src/domain/event/event.rules";
import { EventPublic } from "@/src/domain/event/event.types";
import {
  isLockedOut,
  isVerificationExpired,
  validateGuestVerification,
} from "@/src/domain/guest/guest.rules";
import { getVerificationAttempts, getVerificationRecord } from "@/src/services/guest/guest.read";
import {
  clearVerificationAttempts,
  clearVerificationRecord,
  setVerificationAttempts,
  setVerificationRecord,
} from "@/src/services/guest/guest.write";
import { getEventBySlug } from "@/src/services/event/event.read.server";
import { ServiceError } from "@/src/shared/errors";
import { formatEventDateLtLt, nowIsoString, nowMs } from "@/src/shared/time";
import { PublicEventPage } from "@/src/ui/guest/PublicEventPage";

type Props = {
  event: EventPublic | null;
  error?: string | null;
};

export default function PublicEventRoute({ event, error }: Props) {
  const [verifiedName, setVerifiedName] = useState<string | null>(null);
  const [inputName, setInputName] = useState("");
  const [inputPhrase, setInputPhrase] = useState("");
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    if (!event) return;

    const verifyKey = `guest_verified_${event.id}`;
    const attemptsKey = `guest_verify_attempts_${event.id}`;

    const storedAttempts = getVerificationAttempts(attemptsKey);
    setAttempts(storedAttempts);

    const record = getVerificationRecord(verifyKey);
    if (record) {
      const now = nowMs();
      if (!isVerificationExpired(record.verifiedAt, now)) {
        setVerifiedName(record.name);
        return;
      }

      clearVerificationRecord(verifyKey);
    }
  }, [event]);

  if (!event) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <p className="text-sm text-red-600">{error || "Something went wrong"}</p>
      </main>
    );
  }

  const formattedDate = formatEventDateLtLt(event.event_date);
  const lockedOut = isLockedOut(attempts);

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();

    if (isLockedOut(attempts)) return;

    const verifyKey = `guest_verified_${event.id}`;
    const attemptsKey = `guest_verify_attempts_${event.id}`;

    const result = validateGuestVerification(
      inputName,
      inputPhrase,
      event.verificationPhrase
    );

    if (!result.ok) {
      const nextAttempts = attempts + 1;
      setVerificationAttempts(attemptsKey, nextAttempts);
      setAttempts(nextAttempts);
      setVerificationError("Verification failed.");
      return;
    }

    setVerificationRecord(verifyKey, {
      name: result.name,
      verifiedAt: nowIsoString(),
    });

    clearVerificationAttempts(attemptsKey);
    setVerifiedName(result.name);
    setAttempts(0);
    setVerificationError(null);
  };

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

      <PublicEventPage
        event={event}
        formattedDate={formattedDate}
        verifiedName={verifiedName}
        inputName={inputName}
        inputPhrase={inputPhrase}
        error={verificationError}
        lockedOut={lockedOut}
        onInputNameChange={setInputName}
        onInputPhraseChange={setInputPhrase}
        onVerifySubmit={handleVerify}
      />
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const slug = ctx.params?.slug;

  if (typeof slug !== "string") {
    return { notFound: true };
  }

  try {
    const event = await getEventBySlug(slug);

    if (!event) {
      return { notFound: true };
    }

    if (!canGuestViewEvent(event)) {
      return { notFound: true };
    }

    return {
      props: {
        event: {
          id: event.id,
          title: event.title,
          event_date: event.event_date,
          state: event.state,
          verificationPhrase: buildVerificationPhrase(event.slug),
        },
      },
    };
  } catch (err) {
    const message = err instanceof ServiceError ? err.message : "Something went wrong";
    return { props: { event: null, error: message } };
  }
};
