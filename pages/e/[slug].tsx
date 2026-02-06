// /pages/e/[slug].tsx
import { GetServerSideProps } from "next";
import Head from "next/head";
import { createClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";

type EventPublic = {
  id: string;
  title: string;
  event_date: string;
  state: "draft" | "paid" | "active" | "event_passed" | "archived" | "expired";
  verificationPhrase: string;
};

type Props = {
  event: EventPublic;
};

const MAX_ATTEMPTS = 5;
const VERIFICATION_TTL_MS = 1000 * 60 * 60 * 24; 

function Countdown({ eventDate }: { eventDate: string }) {
  const [daysLeft, setDaysLeft] = useState(0);

  useEffect(() => {
    const target = new Date(eventDate).getTime();
    const now = Date.now();
    const diff = target - now;
    setDaysLeft(Math.max(Math.ceil(diff / (1000 * 60 * 60 * 24)), 0));
  }, [eventDate]);

  return <p className="mt-4 text-sm text-gray-600">{daysLeft} days remaining</p>;
}

export default function PublicEventPage({ event }: Props) {
  const VERIFY_KEY = `guest_verified_${event.id}`;
  const ATTEMPTS_KEY = `guest_verify_attempts_${event.id}`;

  const [verifiedName, setVerifiedName] = useState<string | null>(null);
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

  useEffect(() => {
    const rawVerified = sessionStorage.getItem(VERIFY_KEY);
    const rawAttempts = sessionStorage.getItem(ATTEMPTS_KEY);

    if (rawAttempts) {
      const parsedAttempts = parseInt(rawAttempts, 10);
      if (!Number.isNaN(parsedAttempts)) {
        setAttempts(parsedAttempts);
      }
    }

    if (rawVerified) {
      try {
        const parsed = JSON.parse(rawVerified);
        if (parsed?.name && parsed?.verifiedAt) {
          const verifiedAt = new Date(parsed.verifiedAt).getTime();
          const now = Date.now();

          if (now - verifiedAt < VERIFICATION_TTL_MS) {
            setVerifiedName(parsed.name);
            return;
          }

          // expired
          sessionStorage.removeItem(VERIFY_KEY);
        }
      } catch {
        sessionStorage.removeItem(VERIFY_KEY);
      }
    }
  }, [VERIFY_KEY, ATTEMPTS_KEY]);

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();

    if (attempts >= MAX_ATTEMPTS) return;

    const name = inputName.trim();
    const phrase = inputPhrase.trim().toLowerCase();
    const expectedPhrase = event.verificationPhrase.toLowerCase();

    if (
      name.length < 2 ||
      name.length > 80 ||
      phrase !== expectedPhrase
    ) {
      const nextAttempts = attempts + 1;
      sessionStorage.setItem(ATTEMPTS_KEY, String(nextAttempts));
      setAttempts(nextAttempts);
      setError("Verification failed.");
      return;
    }

    sessionStorage.setItem(
      VERIFY_KEY,
      JSON.stringify({
        name,
        verifiedAt: new Date().toISOString(),
      })
    );

    sessionStorage.removeItem(ATTEMPTS_KEY);
    setVerifiedName(name);
    setAttempts(0);
    setError(null);
  };

  const lockedOut = attempts >= MAX_ATTEMPTS;

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
          <form onSubmit={handleVerify} className="w-full max-w-sm text-center">
            <h1 className="text-2xl font-semibold mb-4">
              Enter your details
            </h1>

            <input
              type="text"
              value={inputName}
              onChange={(e) => setInputName(e.target.value)}
              className="w-full border px-3 py-2 mb-3"
              placeholder="Your full name"
              disabled={lockedOut}
              required
            />

            <input
              type="text"
              value={inputPhrase}
              onChange={(e) => setInputPhrase(e.target.value)}
              className="w-full border px-3 py-2 mb-3"
              placeholder="Verification phrase"
              disabled={lockedOut}
              required
            />

            {error && (
              <p className="text-sm text-red-600 mb-2">{error}</p>
            )}

            {lockedOut && (
              <p className="text-sm text-red-600 mb-2">
                Too many attempts. Restart your session.
              </p>
            )}

            <button
              type="submit"
              className="w-full bg-black text-white py-2"
              disabled={lockedOut}
            >
              Continue
            </button>
          </form>
        ) : (
          <div className="text-center">
            <h1 className="text-3xl font-semibold mb-4">{event.title}</h1>
            <p className="text-lg">{formattedDate}</p>
            <Countdown eventDate={event.event_date} />
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

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data } = await supabase
    .from("events")
    .select("id,title,event_date,state,guest_access_enabled,slug")
    .eq("slug", slug)
    .single();

  if (!data) {
    return { notFound: true };
  }

  const PUBLIC_STATE = "active";

  if (data.state !== PUBLIC_STATE) {
    return { notFound: true };
  }

  if (!data.guest_access_enabled) {
    return { notFound: true };
  }

  const verificationPhrase = `kviečiame į ${data.slug.toLowerCase()} šventę`;

  return {
    props: {
      event: {
        id: data.id,
        title: data.title,
        event_date: data.event_date,
        state: data.state,
        verificationPhrase,
      },
    },
  };
};
