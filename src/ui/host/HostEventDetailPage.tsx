import Link from "next/link";
import { useState } from "react";
import { supabaseClient } from "@/infra/supabase.client";
import type {
  HostEventRecord,
  HostGuestRecord,
} from "@/services/event/event.read";

type Props = {
  event: HostEventRecord;
  initialGuests: HostGuestRecord[];
};

export function HostEventDetailPage({ event, initialGuests }: Props) {
  const [guests, setGuests] = useState<HostGuestRecord[]>(initialGuests);
  const [loadingGuests, setLoadingGuests] = useState(false);

  const [newGuestName, setNewGuestName] = useState("");
  const [newGuestEmail, setNewGuestEmail] = useState("");
  const [addingGuest, setAddingGuest] = useState(false);

  const [editingGuestId, setEditingGuestId] = useState<string | null>(null);
  const [editGuestName, setEditGuestName] = useState("");
  const [editGuestEmail, setEditGuestEmail] = useState("");
  const [savingEditGuestId, setSavingEditGuestId] = useState<string | null>(null);
  const [deletingGuestId, setDeletingGuestId] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);

  const eventDateText = event.event_date
    ? new Date(event.event_date).toLocaleString()
    : "N/A";

  async function refreshGuests() {
    setLoadingGuests(true);

    const { data, error: fetchError } = await supabaseClient
      .from("guests")
      .select("id,event_id,name,email,created_at")
      .eq("event_id", event.id)
      .order("created_at", { ascending: true });

    if (fetchError) {
      setError(fetchError.message);
      setLoadingGuests(false);
      return;
    }

    setGuests((data ?? []) as HostGuestRecord[]);
    setLoadingGuests(false);
  }

  async function handleAddGuest(e: React.FormEvent) {
    e.preventDefault();

    const name = newGuestName.trim();
    const email = newGuestEmail.trim().toLowerCase();

    if (!name) {
      setError("Guest name is required.");
      return;
    }

    setError(null);
    setAddingGuest(true);

    const { error: insertError } = await supabaseClient.from("guests").insert({
      event_id: event.id,
      name,
      email: email || null,
      normalized_name: name.toLowerCase(),
    });

    if (insertError) {
      setError(insertError.message);
      setAddingGuest(false);
      return;
    }

    setNewGuestName("");
    setNewGuestEmail("");
    setAddingGuest(false);

    await refreshGuests();
  }

  function startEditGuest(guest: HostGuestRecord) {
    setError(null);
    setEditingGuestId(guest.id);
    setEditGuestName(guest.name);
    setEditGuestEmail(guest.email ?? "");
  }

  function cancelEditGuest() {
    setEditingGuestId(null);
    setEditGuestName("");
    setEditGuestEmail("");
  }

  async function handleSaveGuest(guestId: string) {
    const name = editGuestName.trim();
    const email = editGuestEmail.trim().toLowerCase();

    if (!name) {
      setError("Guest name is required.");
      return;
    }

    setError(null);
    setSavingEditGuestId(guestId);

    const { error: updateError } = await supabaseClient
      .from("guests")
      .update({
        name,
        email: email || null,
        normalized_name: name.toLowerCase(),
      })
      .eq("id", guestId)
      .eq("event_id", event.id);

    if (updateError) {
      setError(updateError.message);
      setSavingEditGuestId(null);
      return;
    }

    setSavingEditGuestId(null);
    cancelEditGuest();

    await refreshGuests();
  }

  async function handleDeleteGuest(guestId: string) {
    setError(null);
    setDeletingGuestId(guestId);

    const { error: deleteError } = await supabaseClient
      .from("guests")
      .delete()
      .eq("id", guestId)
      .eq("event_id", event.id);

    if (deleteError) {
      setError(deleteError.message);
      setDeletingGuestId(null);
      return;
    }

    setDeletingGuestId(null);

    if (editingGuestId === guestId) {
      cancelEditGuest();
    }

    await refreshGuests();
  }

  return (
    <main className="mx-auto max-w-4xl space-y-8 p-6">
      <div className="flex items-center justify-between">
        <Link href="/host" className="rounded border px-3 py-1.5 text-sm">
          Back to dashboard
        </Link>

        <Link
          href={`/host/events/${event.id}/export`}
          className="rounded border px-3 py-1.5 text-sm"
        >
          Export guests
        </Link>
      </div>

      <section className="space-y-2">
        <h1 className="text-2xl font-semibold">{event.title}</h1>
        <p className="text-sm text-gray-600">State: {event.state}</p>
        <p className="text-sm text-gray-600">Date: {eventDateText}</p>
        <p className="text-sm text-gray-600">Slug: {event.slug}</p>
      </section>

      <section className="rounded border p-4">
        <h2 className="mb-4 text-lg font-medium">Add guest</h2>

        <form onSubmit={handleAddGuest} className="grid gap-3 md:grid-cols-3">
          <input
            type="text"
            value={newGuestName}
            onChange={(e) => setNewGuestName(e.target.value)}
            placeholder="Guest name"
            className="rounded border px-3 py-2"
            disabled={addingGuest}
          />

          <input
            type="email"
            value={newGuestEmail}
            onChange={(e) => setNewGuestEmail(e.target.value)}
            placeholder="Guest email (optional)"
            className="rounded border px-3 py-2"
            disabled={addingGuest}
          />

          <button
            type="submit"
            disabled={addingGuest}
            className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {addingGuest ? "Adding..." : "Add guest"}
          </button>
        </form>
      </section>

      <section className="rounded border p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-medium">Guest list</h2>
          {loadingGuests && <p className="text-sm text-gray-600">Refreshing...</p>}
        </div>

        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

        {guests.length === 0 ? (
          <p className="text-sm text-gray-600">No guests yet.</p>
        ) : (
          <ul className="space-y-3">
            {guests.map((guest) => {
              const isEditing = editingGuestId === guest.id;
              const isSaving = savingEditGuestId === guest.id;
              const isDeleting = deletingGuestId === guest.id;

              return (
                <li key={guest.id} className="rounded border p-3">
                  {isEditing ? (
                    <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto_auto]">
                      <input
                        type="text"
                        value={editGuestName}
                        onChange={(e) => setEditGuestName(e.target.value)}
                        className="rounded border px-3 py-2"
                        disabled={isSaving}
                      />
                      <input
                        type="email"
                        value={editGuestEmail}
                        onChange={(e) => setEditGuestEmail(e.target.value)}
                        className="rounded border px-3 py-2"
                        placeholder="Email (optional)"
                        disabled={isSaving}
                      />
                      <button
                        onClick={() => handleSaveGuest(guest.id)}
                        disabled={isSaving}
                        className="rounded border px-3 py-2 text-sm disabled:opacity-50"
                        type="button"
                      >
                        {isSaving ? "Saving..." : "Save"}
                      </button>
                      <button
                        onClick={cancelEditGuest}
                        disabled={isSaving}
                        className="rounded border px-3 py-2 text-sm disabled:opacity-50"
                        type="button"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">{guest.name}</p>
                        <p className="text-sm text-gray-600">
                          {guest.email ?? "No email"}
                        </p>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => startEditGuest(guest)}
                          className="rounded border px-3 py-1.5 text-sm"
                          type="button"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteGuest(guest.id)}
                          disabled={isDeleting}
                          className="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
                          type="button"
                        >
                          {isDeleting ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
