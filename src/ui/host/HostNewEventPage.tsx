import { useState } from "react";
import { NewEventInput } from "@/src/domain/event/event.types";

export type HostNewEventPageProps = {
  error: string | null;
  onCreate: (input: NewEventInput) => Promise<void> | void;
};

export function HostNewEventPage({ error, onCreate }: HostNewEventPageProps) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [timezone, setTimezone] = useState("Europe/Vilnius");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await onCreate({ title, date, time, timezone });
  }

  return (
    <form onSubmit={handleCreate}>
      <h1>Create Event</h1>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <input
        placeholder="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />

      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />

      <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />

      <input
        placeholder="Timezone"
        value={timezone}
        onChange={(e) => setTimezone(e.target.value)}
      />

      <button type="submit">Create</button>
    </form>
  );
}
