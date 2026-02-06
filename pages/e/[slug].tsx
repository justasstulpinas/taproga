import { GetServerSideProps } from "next";
import Head from "next/head";
import { createClient } from "@supabase/supabase-js";

type EventPublic = {
  id: string;
  title: string;
  event_date: string; // timestamptz
  state: "draft" | "paid" | "live" | "locked" | "archived";
};

type Props = {
  event: EventPublic;
};

export default function PublicEventPage({ event }: Props) {
  const date = new Date(event.event_date);

  return (
    <>
      <Head>
        <title>{event.title}</title>
      </Head>

      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-3xl font-semibold mb-4">{event.title}</h1>
          <p className="text-lg">
            {date.toLocaleDateString("lt-LT", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
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
    process.env.SUPABASE_SERVICE_ROLE_KEY! // SSR only
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

  return {
    props: {
      event: data,
    },
  };
};
