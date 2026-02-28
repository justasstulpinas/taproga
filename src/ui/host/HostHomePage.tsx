import Link from "next/link";
import { useState } from "react";
import { EventSummary } from "@/domain/event/event.types";
import { logout } from "@/services/auth/auth.write";

export type HostHomePageProps = {
  events: EventSummary[];
  error: string | null;
  onCreateEvent: () => void;
  onToggleGuestAccess: (id: string, enabled: boolean) => Promise<void>;
};

export function HostHomePage({
  events,
  error,
  onCreateEvent,
  onToggleGuestAccess,
}: HostHomePageProps) {
  const [loggingOut, setLoggingOut] = useState(false);
  const [busyEventId, setBusyEventId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleLogout() {
    setActionError(null);
    setLoggingOut(true);

    try {
      await logout();
      window.location.href = "/login";
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to log out";
      setActionError(message);
      setLoggingOut(false);
    }
  }

  async function handleToggle(event: EventSummary) {
    setActionError(null);
    setBusyEventId(event.id);

    try {
      await onToggleGuestAccess(event.id, !event.guest_access_enabled);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update event";
      setActionError(message);
    } finally {
      setBusyEventId(null);
    }
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Host Dashboard</h1>
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
        >
          {loggingOut ? "Logging out..." : "Logout"}
        </button>
      </header>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {actionError && <p className="text-sm text-red-600">{actionError}</p>}

      <button
        onClick={onCreateEvent}
        className="rounded bg-black px-4 py-2 text-sm text-white"
      >
        Create event
      </button>

      {events.length === 0 ? (
        <p className="text-sm text-gray-600">No events yet.</p>
      ) : (
        <ul className="space-y-4">
          {events.map((event) => {
            const toggling = busyEventId === event.id;

            return (
              <li key={event.id} className="rounded border p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-lg font-medium">{event.title}</p>
                    <p className="text-sm text-gray-600">State: {event.state}</p>
                    <p className="text-sm text-gray-600">
                      Guest access: {event.guest_access_enabled ? "Enabled" : "Disabled"}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/host/events/${event.id}`}
                      className="rounded border px-3 py-1.5 text-sm"
                    >
                      Open event
                    </Link>

                    <button
                      onClick={() => handleToggle(event)}
                      disabled={toggling}
                      className="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
                    >
                      {toggling
                        ? "Saving..."
                        : event.guest_access_enabled
                        ? "Disable guest access"
                        : "Enable guest access"}
                    </button>

                    <button
                      onClick={() => {
                        void navigator.clipboard.writeText(
                          `${window.location.origin}/events/${event.slug}`
                        );
                      }}
                      className="rounded border px-3 py-1.5 text-sm"
                    >
                      Copy guest link
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
