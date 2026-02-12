import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { HostHomePage } from "@/ui/host/HostHomePage";
import { listHostEvents } from "@/services/event/event.read";
import { toggleGuestAccess } from "@/services/event/event.write";
import { getSession } from "@/services/auth/auth.read";
import { EventSummary } from "@/domain/event/event.types";
import { ServiceError } from "@/shared/errors";

function getErrorMessage(error: unknown) {
  return error instanceof ServiceError
    ? error.message
    : "Something went wrong";
}

export default function HostHome() {
  const router = useRouter();
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const session = await getSession();

        if (!session) {
          router.replace("/login");
          return;
        }

        const rows = await listHostEvents();

        if (isMounted) {
          setEvents(rows);
        }
      } catch (err: unknown) {
        if (isMounted) {
          setError(getErrorMessage(err));
        }
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, [router]);

  async function handleToggleGuestAccess(id: string, enabled: boolean) {
    try {
      await toggleGuestAccess(id, enabled);

      setEvents((prev) =>
        prev.map((e) =>
          e.id === id
            ? { ...e, guest_access_enabled: !enabled }
            : e
        )
      );
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      setError(message);
      alert(message);
    }
  }

  return (
    <HostHomePage
      events={events}
      error={error}
      onCreateEvent={() => router.push("/host/new")}
      onToggleGuestAccess={handleToggleGuestAccess}
    />
  );
}
