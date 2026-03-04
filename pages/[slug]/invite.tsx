import type { GetServerSideProps } from "next";
import Head from "next/head";
import PanelRenderer from "../../components/invitation/PanelRenderer";
import { supabase } from "@/infra/supabase.client";
import type { PanelInstance } from "@/lib/panels/panel.types";
import { ensureDefaultPanels } from "@/lib/panels/ensureDefaultPanels";

type InviteEvent = {
  id: string;
  slug: string;
  title: string;
  event_date: string | null;
  state: string;
  guest_access_enabled: boolean;
  panels: PanelInstance[];
};

type Props = {
  event: InviteEvent;
};

export default function InvitePage({ event }: Props) {
  return (
    <>
      <Head>
        <title>{event.title}</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>

      <PanelRenderer panels={event.panels} event={event} />
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
      "id,slug,title,event_date,state,guest_access_enabled,panels"
    )
    .eq("slug", slug)
    .maybeSingle();

  if (error || !data) {
    return { notFound: true };
  }

  if (data.state !== "active" || data.guest_access_enabled !== true) {
    return { notFound: true };
  }

  const panels = ensureDefaultPanels(data.panels);

  return {
    props: {
      event: {
        ...(data as Omit<InviteEvent, "panels">),
        panels,
      },
    },
  };
};
