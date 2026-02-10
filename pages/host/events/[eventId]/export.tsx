import { GetServerSideProps } from "next";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";

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

function escapeCsv(value: unknown): string {
  const str = value == null ? "" : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCsv(rows: GuestRow[]): string {
  const header = [
    "guest name",
    "RSVP status",
    "+1 name",
    "menu choice",
    "+1 menu choice",
  ];

  const lines = rows.map((row) => [
    row.name,
    row.rsvp_status,
    row.plus_one_name,
    row.menu_choice,
    row.plus_one_menu_choice,
  ]);

  return [header, ...lines]
    .map((line) => line.map(escapeCsv).join(","))
    .join("\n");
}

export default function HostEventExportPage({ eventId }: Props) {
  const router = useRouter();
  const [guests, setGuests] = useState<GuestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  function handleDownload() {
    const csv = buildCsv(guests);
    const blob = new Blob(["\uFEFF", csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `event-${eventId}-guests.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Export guests</h1>

      {loading && <p className="text-gray-500">Loading...</p>}
      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {!loading && !error && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Total guests: {guests.length}
          </p>

          <button
            type="button"
            onClick={handleDownload}
            className="bg-black text-white py-2 px-4"
            disabled={guests.length === 0}
          >
            Download CSV
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
