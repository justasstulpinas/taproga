import { useState, type FormEvent } from "react";
import { NewEventInput } from "@/domain/event/event.types";

export type HostNewEventPageProps = {
  error: string | null;
  onCreate: (input: NewEventInput) => Promise<void> | void;
};

export function HostNewEventPage({ error, onCreate }: HostNewEventPageProps) {
  const [title, setTitle] = useState("");
  const [eventDateLocal, setEventDateLocal] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setLocalError("Title is required");
      return;
    }

    if (!eventDateLocal) {
      setLocalError("Event date is required");
      return;
    }

    const parsedDate = new Date(eventDateLocal);
    if (Number.isNaN(parsedDate.getTime())) {
      setLocalError("Event date is invalid");
      return;
    }

    setLocalError(null);

    await onCreate({
      title: trimmedTitle,
      event_date: parsedDate.toISOString(),
    });
  }

  return (
    <form onSubmit={handleCreate}>
      <h1>Create Event</h1>

      {localError && <p className="text-sm text-red-600">{localError}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <input
        placeholder="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />

      <input
        type="datetime-local"
        value={eventDateLocal}
        onChange={(e) => setEventDateLocal(e.target.value)}
        required
      />

      <button type="submit">Create</button>
    </form>
  );
}
