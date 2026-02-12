import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { supabaseClient } from "@/infra/supabase.client";
import { getSession } from "@/services/auth/auth.read";

export default function HostEventPage() {
  const router = useRouter();
  const { eventId } = router.query;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [menuEnabled, setMenuEnabled] = useState(false);

  useEffect(() => {
    if (!eventId || typeof eventId !== "string") return;

    async function load() {
      const session = await getSession();
      if (!session) {
        router.replace("/login");
        return;
      }

      const { data, error } = await supabaseClient
        .from("events")
        .select("title,event_date,menu_enabled")
        .eq("id", eventId)
        .single();

      if (error) {
        setError(error.message);
      } else if (data) {
        setTitle(data.title);
        setEventDate(data.event_date);
        setMenuEnabled(data.menu_enabled);
      }

      setLoading(false);
    }

    load();
  }, [eventId, router]);

  async function handleSave() {
    if (!eventId || typeof eventId !== "string") return;

    setSaving(true);
    setError(null);

    const { error } = await supabaseClient
      .from("events")
      .update({
        title,
        event_date: eventDate,
        menu_enabled: menuEnabled,
        last_critical_update_at: new Date().toISOString(),
      })
      .eq("id", eventId);

    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }

    setSaving(false);
  }

  if (loading) return <p className="p-6">Loading...</p>;
  if (error) return <p className="p-6 text-red-600">{error}</p>;

  return (
    <main className="max-w-xl mx-auto p-6 space-y-6">
      <Link
        href="/host"
        className="inline-block text-sm border px-3 py-1.5 rounded"
      >
        Back to host
      </Link>

      <h1 className="text-2xl font-semibold">Edit Event</h1>

      {typeof eventId === "string" && (
        <Link
          href={`/host/events/${eventId}/export`}
          className="inline-block text-sm border px-3 py-1.5 rounded"
        >
          Export guests (CSV)
        </Link>
      )}

      <div>
        <label className="block text-sm mb-1">Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full border px-3 py-2 rounded"
        />
      </div>

      <div>
        <label className="block text-sm mb-1">Date</label>
        <input
          type="datetime-local"
          value={
            eventDate
              ? new Date(eventDate).toISOString().slice(0, 16)
              : ""
          }
          onChange={(e) =>
            setEventDate(new Date(e.target.value).toISOString())
          }
          className="w-full border px-3 py-2 rounded"
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={menuEnabled}
          onChange={(e) => setMenuEnabled(e.target.checked)}
        />
        <label>Enable menu</label>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="bg-black text-white px-4 py-2 rounded disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save"}
      </button>
    </main>
  );
}
