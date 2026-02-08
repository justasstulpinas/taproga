import { EventSummary } from "@/domain/event/event.types";

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
  onToggleGuestAccess,
}: HostHomePageProps) {
  return (
    <main>
      <h1>Host Dashboard</h1>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button onClick={onCreateEvent}>Create event</button>

      <ul>
        {events.map((e) => (
          <li key={e.id}>
            {e.title} — {e.state} — guest access:{" "}
            <button onClick={() => onToggleGuestAccess(e.id, e.guest_access_enabled)}>
              {e.guest_access_enabled ? "ON" : "OFF"}
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
