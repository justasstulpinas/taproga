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
};

type Props = {
  event: EventPublic;
};

function Countdown({ eventDate }: { eventDate: string }) {
  const [daysLeft, setDaysLeft] = useState(0);

  useEffect(() => {
    const target = new Date(eventDate).getTime();
    const now = Date.now();
    const diff = target - now;
    setDaysLeft(Math.max(Math.ceil(diff / (1000 * 60 * 60 * 24)), 0));
  }, [eventDate]);

  return (
    <p className="mt-4 text-sm text-gray-600">
      {daysLeft} days remaining
    </p>
  );
}

export default function PublicEventPage({ event }: Props) {
  const [verifiedName, setVerifiedName] = useState<string | null>(null);
  const [inputName, setInputName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const date = new Date(event.event_date);
  const formattedDate = date.toLocaleDateString("lt-LT", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const storageKey = `guest_verified_${event.id}`;

  useEffect(() => {
    const raw = sessionStorage.getItem(storageKey);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.name) {
          setVerifiedName(parsed.name);
        }
      } catch {
        sessionStorage.removeItem(storageKey);
      }
    }
  }, [storageKey]);

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();

    const name = inputName.trim();

    if (name.length < 2 || name.length > 80) {
      setError("Please enter your full name.");
      return;
    }

    sessionStorage.setItem(storageKey, JSON.stringify({ name }));
    setVerifiedName(name);
    setError(null);
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

      <main className="min-h-screen flex items-center justify-center px-4">
        {!verifiedName ? (
          <form
            onSubmit={handleVerify}
            className="w-full max-w-sm text-center"
          >
            <h1 className="text-2xl font-semibold mb-4">
              Please enter your name
            </h1>

            <input
              type="text"
              value={inputName}
              onChange={(e) => setInputName(e.target.value)}
              className="w-full border px-3 py-2 mb-3"
              placeholder="Your name"
              required
            />

            {error && (
              <p className="text-sm text-red-600 mb-2">{error}</p>
            )}

            <button
              type="submit"
              className="w-full bg-black text-white py-2"
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
    .select("id,title,event_date,state,guest_access_enabled")
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

  return {
    props: {
      event: {
        id: data.id,
        title: data.title,
        event_date: data.event_date,
        state: data.state,
      },
    },
  };
};
