import { GetServerSideProps } from "next";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";

import { supabase } from "@/infra/supabase.client";
import { getSession } from "@/services/auth/auth.read";

type GuestRow = {
  name: string | null;
  rsvp_status: string | null;
  plus_one_name: string | null;
  menu_choice: string | null;
  plus_one_menu_choice: string | null;
};

type Props = {
  eventId: string;
};

export default function HostEventExportPage({ eventId }: Props) {
  const router = useRouter();
  const [guests, setGuests] = useState<GuestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  async function handleDownloadCsv() {
    setDownloadError(null);
    setDownloading(true);

    try {
      const response = await fetch(`/api/host/events/${eventId}/export-guests`);

      if (!response.ok) {
        let message = "Failed to download CSV.";
        try {
          const data = (await response.json()) as { error?: string };
          if (data?.error) {
            message = data.error;
          }
        } catch {
          // keep fallback message
        }
        setDownloadError(message);
        return;
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get("content-disposition");
      const match = contentDisposition?.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? `event-${eventId}-guests.csv`;

      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      setDownloadError("Failed to download CSV.");
    } finally {
      setDownloading(false);
    }
  }

  useEffect(() => {
    let isMounted = true;

    async function load() {
      if (!router.isReady) return;

      try {
        const session = await getSession();
        if (!session) {
          router.replace(
            `/login?returnTo=${encodeURIComponent(router.asPath)}`
          );
          return;
        }

        const { data, error: loadError } = await supabase
          .from("guests")
          .select(
            "name,rsvp_status,plus_one_name,menu_choice,plus_one_menu_choice"
          )
          .eq("event_id", eventId)
          .order("created_at", { ascending: true });

        if (loadError) {
          if (isMounted) setError("Failed to load guest data.");
          return;
        }

        if (isMounted) setGuests(data ?? []);
      } catch {
        if (isMounted) setError("Failed to load guest data.");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, [eventId, router]);

  return (
    <main className="p-6 max-w-2xl mx-auto">
      <Link
        href={`/host/events/${eventId}`}
        className="inline-block text-sm border px-3 py-1.5 rounded mb-4"
      >
        Back to event
      </Link>

      <h1 className="text-2xl font-semibold mb-4">Export guests</h1>

      {loading && <p className="text-gray-500">Loading...</p>}
      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
      {downloadError && (
        <p className="text-sm text-red-600 mb-4">{downloadError}</p>
      )}

      {!loading && !error && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Total guests: {guests.length}
          </p>
          <button
            onClick={handleDownloadCsv}
            disabled={downloading}
            className="inline-block rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {downloading ? "Downloading..." : "Download CSV"}
          </button>
        </div>
      )}
    </main>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const eventId = ctx.params?.eventId;

  if (typeof eventId !== "string") {
    return { notFound: true };
  }

  return {
    props: {
      eventId,
    },
  };
};
