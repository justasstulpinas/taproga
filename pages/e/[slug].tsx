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
  const date = new Date(event.event_date);
  const formattedDate = date.toLocaleDateString("lt-LT", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <>
      <Head>
        <title>{event.title}</title>

        {/* Basic SEO */}
        <meta
          name="description"
          content={`Wedding invitation · ${event.title} · ${formattedDate}`}
        />

        {/* Open Graph */}
        <meta property="og:type" content="website" />
        <meta property="og:title" content={event.title} />
        <meta
          property="og:description"
          content={`Wedding invitation · ${formattedDate}`}
        />

        {/* Prevent premature indexing */}
        <meta name="robots" content="noindex,nofollow" />
      </Head>

      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-3xl font-semibold mb-4">{event.title}</h1>

          <p className="text-lg">{formattedDate}</p>

          <Countdown eventDate={event.event_date} />
        </div>
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

  const { data, error } = await supabase
    .from("events")
    .select("id,title,event_date,state")
    .eq("slug", slug)
    .eq("state", "active")
    .single();

  if (error || !data) {
    return { notFound: true };
  }

  return { props: { event: data } };
};
