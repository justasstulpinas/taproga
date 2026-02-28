import type {
  GetServerSideProps,
  InferGetServerSidePropsType,
} from "next";
import { useState } from "react";
import { createSupabaseServerClient } from "@/infra/supabase.server";
import {
  getHostEventById,
  listHostEventGuests,
  type HostEventRecord,
  type HostGuestRecord,
} from "@/services/event/event.read";
import { HostEventDetailPage } from "@/ui/host/HostEventDetailPage";

type Props = {
  event: HostEventRecord;
  guests: HostGuestRecord[];
  showStorageRenewal: boolean;
};

function redirectToLogin() {
  return {
    redirect: {
      destination: "/login",
      permanent: false,
    },
  } as const;
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const id = ctx.params?.id;
  if (typeof id !== "string" || !id.trim()) {
    return { notFound: true };
  }

  const supabase = createSupabaseServerClient(ctx);

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session) {
    return redirectToLogin();
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  const hostEmail = user?.email?.trim().toLowerCase();
  if (userError || !hostEmail) {
    return redirectToLogin();
  }

  try {
    const event = await getHostEventById(id, hostEmail, supabase);
    if (!event) {
      return { notFound: true };
    }

    const { data: storageLifecycle, error: storageLifecycleError } = await supabase
      .from("events")
      .select("tier,storage_expires_at,storage_grace_until")
      .eq("id", event.id)
      .eq("host_email", hostEmail)
      .maybeSingle();

    if (storageLifecycleError || !storageLifecycle) {
      return { notFound: true };
    }

    const nowMs = Date.now();
    const storageExpiresAtMs = storageLifecycle.storage_expires_at
      ? new Date(storageLifecycle.storage_expires_at).getTime()
      : null;
    const storageGraceUntilMs = storageLifecycle.storage_grace_until
      ? new Date(storageLifecycle.storage_grace_until).getTime()
      : null;

    const storageExpired =
      storageExpiresAtMs !== null &&
      Number.isFinite(storageExpiresAtMs) &&
      storageExpiresAtMs < nowMs;

    const graceExpired =
      storageGraceUntilMs !== null &&
      Number.isFinite(storageGraceUntilMs) &&
      storageGraceUntilMs < nowMs;

    const showStorageRenewal =
      storageLifecycle.tier >= 3 && (graceExpired || storageExpired);

    const guests = await listHostEventGuests(event.id, supabase);

    return {
      props: {
        event,
        guests,
        showStorageRenewal,
      },
    };
  } catch {
    return { notFound: true };
  }
};

export default function HostEventDetailRoute({
  event,
  guests,
  showStorageRenewal,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [renewingStorage, setRenewingStorage] = useState(false);

  async function handleRenewStorage() {
    setRenewingStorage(true);

    try {
      const response = await fetch(`/api/events/${event.id}/storage/renew`, {
        method: "POST",
      });

      const json = await response.json().catch(() => null);

      if (!response.ok) {
        console.error("STORAGE_RENEW_FAILED", json);
        return;
      }

      const url = json?.url;
      if (typeof url === "string" && url.length > 0) {
        window.location.href = url;
        return;
      }

      console.error("STORAGE_RENEW_URL_MISSING", json);
    } catch (error) {
      console.error("STORAGE_RENEW_REQUEST_ERROR", error);
    } finally {
      setRenewingStorage(false);
    }
  }

  return (
    <>
      {showStorageRenewal ? (
        <section className="mx-auto mt-6 max-w-4xl rounded border border-amber-300 bg-amber-50 p-4">
          <h2 className="text-lg font-semibold">Photo storage expired</h2>
          <p className="mt-1 text-sm text-gray-700">
            Renew for €15/year to restore access.
          </p>
          <button
            type="button"
            onClick={handleRenewStorage}
            disabled={renewingStorage}
            className="mt-3 rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {renewingStorage ? "Redirecting..." : "Renew storage"}
          </button>
        </section>
      ) : null}

      <HostEventDetailPage event={event} initialGuests={guests} />
    </>
  );
}
