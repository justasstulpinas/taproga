import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { HostHomePage } from "@/src/ui/host/HostHomePage";
import { listHostEvents } from "@/src/services/event/event.read";
import { toggleGuestAccess } from "@/src/services/event/event.write";
import { getSession } from "@/src/services/auth/auth.read";
import { EventSummary } from "@/src/domain/event/event.types";
import { ServiceError } from "@/src/shared/errors";

function getErrorMessage(error: unknown) {
  return error instanceof ServiceError ? error.message : "Something went wrong";
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
        if (isMounted) setEvents(rows);
      } catch (err) {
        if (isMounted) setError(getErrorMessage(err));
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
          e.id === id ? { ...e, guest_access_enabled: !enabled } : e
        )
      );
    } catch (err) {
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
