import { useState } from "react";
import { useRouter } from "next/router";
import { EventSummary } from "@/domain/event/event.types";
import { signOut } from "@/services/auth/auth.write";

export type HostHomePageProps = {
  events: EventSummary[];
  error: string | null;
  onCreateEvent: () => void;
  onToggleGuestAccess: (id: string, enabled: boolean) => void;
};

export function HostHomePage({
  events,
  error,
  onCreateEvent,
  onToggleGuestAccess: _onToggleGuestAccess,
}: HostHomePageProps) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  async function handleLogout() {
    try {
      setLoggingOut(true);
      setLogoutError(null);
      await signOut();
      await router.replace("/login");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to log out. Please try again.";
      setLogoutError(message);
      setLoggingOut(false);
    }
  }

  return (
    <main>
      <div className="mb-4 flex items-center justify-between">
        <h1>Host Dashboard</h1>
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
        >
          {loggingOut ? "Logging out..." : "Logout"}
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {logoutError && <p className="text-sm text-red-600">{logoutError}</p>}

      <button onClick={onCreateEvent}>Create event</button>

      <ul>
        {events.map((event) => (
          <li key={event.id}>
            <div className="font-medium">{event.title}</div>
            <div className="text-sm text-gray-600">{event.state}</div>
            <div className="flex flex-wrap gap-2 mt-2">
              <button
                onClick={() => (window.location.href = `/host/events/${event.id}`)}
                className="px-3 py-1.5 bg-black text-white text-sm rounded"
              >
                Open event
              </button>

              <button
                onClick={() => {
                  navigator.clipboard.writeText(
                    `${window.location.origin}/events/${event.slug}`
                  );
                  alert("Guest link copied");
                }}
                className="px-3 py-1.5 border text-sm rounded"
              >
                Copy guest link
              </button>

              <button
                onClick={() => {
                  navigator.clipboard.writeText(
                    `${window.location.origin}/host/events/${event.id}`
                  );
                  alert("Host link copied");
                }}
                className="px-3 py-1.5 border text-sm rounded"
              >
                Copy host link
              </button>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
