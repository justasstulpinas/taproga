import { useState } from "react";
import { useRouter } from "next/router";
import type {
  GetServerSideProps,
  InferGetServerSidePropsType,
} from "next";
import type { EventSummary } from "@/domain/event/event.types";
import { createSupabaseServerClient } from "@/infra/supabase.server";
import { listHostEvents } from "@/services/event/event.read";
import { toggleGuestAccess } from "@/services/event/event.write";
import { ServiceError } from "@/shared/errors";
import { HostHomePage } from "@/ui/host/HostHomePage";

type Props = {
  initialEvents: EventSummary[];
};

function redirectToLogin() {
  return {
    redirect: {
      destination: "/login",
      permanent: false,
    },
  } as const;
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const supabase = createSupabaseServerClient(ctx);

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session) {
    return redirectToLogin();
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  const hostEmail = user?.email?.trim().toLowerCase();
  if (userError || !hostEmail) {
    return redirectToLogin();
  }

  try {
    const initialEvents = await listHostEvents(hostEmail, supabase);

    return {
      props: {
        initialEvents,
      },
    };
  } catch {
    return {
      props: {
        initialEvents: [],
      },
    };
  }
};

function getErrorMessage(error: unknown): string {
  if (error instanceof ServiceError) {
    return error.message;
  }

  return error instanceof Error ? error.message : "Something went wrong";
}

export default function HostHomeRoute({
  initialEvents,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const [events, setEvents] = useState<EventSummary[]>(initialEvents);
  const [error, setError] = useState<string | null>(null);

  async function handleToggleGuestAccess(id: string, enabled: boolean) {
    setError(null);

    try {
      await toggleGuestAccess(id, enabled);

      setEvents((previous) =>
        previous.map((event) =>
          event.id === id
            ? { ...event, guest_access_enabled: enabled }
            : event
        )
      );
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    }
  }

  return (
    <HostHomePage
      events={events}
      error={error}
      onCreateEvent={() => {
        void router.push("/host/new");
      }}
      onToggleGuestAccess={handleToggleGuestAccess}
    />
  );
}
