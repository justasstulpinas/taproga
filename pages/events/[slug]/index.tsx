import { GetServerSideProps } from "next";
import Head from "next/head";
import { useEffect, useState } from "react";

import { supabase } from "@/infra/supabase.client";
import { buildVerificationPhrase } from "@/domain/event/event.rules";
import {
  isLockedOut,
  nextVerificationAttempts,
  validateVerificationInput,
} from "@/domain/guest/verification.rules";
import { GuestVerificationForm } from "@/ui/guest/GuestVerificationForm";
import { Countdown } from "@/ui/guest/Countdown";

type EventState = "draft" | "paid" | "active" | "locked" | "archived";

type EventPublic = {
  id: string;
  title: string;
  event_date: string;
  state: EventState;
  guest_access_enabled: boolean;
  slug: string;
  menu_enabled: boolean;
  last_critical_update_at: string | null;
  post_event_enabled: boolean;
  storage_grace_until: string | null;
};

type Props = {
  event: EventPublic;
};

type EventPhoto = {
  id: string;
  signedUrl: string;
  created_at: string;
};

function PostEventLayout({
  eventId,
  canShowGallery,
}: {
  eventId: string;
  canShowGallery: boolean;
}) {
  const [photos, setPhotos] = useState<EventPhoto[]>([]);
  const [loading, setLoading] = useState(canShowGallery);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadPhotos() {
      if (!canShowGallery) {
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`/api/events/${eventId}/photos`);
        if (!response.ok) {
          throw new Error("PHOTO_LIST_FAILED");
        }

        const data = (await response.json()) as EventPhoto[];
        if (isMounted) {
          setPhotos(Array.isArray(data) ? data : []);
        }
      } catch {
        if (isMounted) {
          setError("Failed to load photos.");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadPhotos();

    return () => {
      isMounted = false;
    };
  }, [eventId, canShowGallery]);

  return (
    <div className="max-w-3xl w-full space-y-4">
      <h1 className="text-2xl font-semibold text-center">Post-event photos</h1>

      {!canShowGallery && (
        <p className="text-center text-sm text-gray-600">
          Photo gallery is no longer available.
        </p>
      )}

      {canShowGallery && loading && (
        <p className="text-center text-sm text-gray-600">Loading photos...</p>
      )}

      {canShowGallery && error && (
        <p className="text-center text-sm text-red-600">{error}</p>
      )}

      {canShowGallery && !loading && !error && photos.length === 0 && (
        <p className="text-center text-sm text-gray-600">No photos yet.</p>
      )}

      {canShowGallery && photos.length > 0 && (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {photos.map((photo) => (
            <li key={photo.id} className="overflow-hidden rounded border">
              <img
                src={photo.signedUrl}
                alt="Event photo"
                className="h-64 w-full object-cover"
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function PublicEventPage({ event }: Props) {
  const SESSION_KEY = `guest_session_${event.id}`;

  const [verifiedName, setVerifiedName] = useState<string | null>(null);
  const [guestId, setGuestId] = useState<string | null>(null);

  const [inputName, setInputName] = useState("");
  const [inputPhrase, setInputPhrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);

  const [menuChoice, setMenuChoice] = useState<string | null>(null);
  const [menus, setMenus] = useState<{ id: string; title: string }[]>([]);

  const [rsvpStatus, setRsvpStatus] = useState<string | null>(null);
  const [showUpdateBanner, setShowUpdateBanner] = useState(false);
  const [loading, setLoading] = useState(false);

  const verificationPhrase = buildVerificationPhrase(event.slug);
  const eventDateMs = new Date(event.event_date).getTime();
  const postEventStartsAtMs = Number.isNaN(eventDateMs)
    ? Number.POSITIVE_INFINITY
    : eventDateMs + 12 * 60 * 60 * 1000;
  const nowMs = Date.now();
  const isPostEvent = nowMs > postEventStartsAtMs;
  const graceMs = event.storage_grace_until
    ? new Date(event.storage_grace_until).getTime()
    : Number.NaN;
  const isStorageExpired =
    !Number.isFinite(graceMs) || nowMs > graceMs;
  const shouldRenderPostEventLayout =
    isPostEvent && event.post_event_enabled === true;
  const disableRsvp = isPostEvent && event.post_event_enabled !== true;

  // ---------------------------------------------------
  // Restore session
  // ---------------------------------------------------

  useEffect(() => {
    const storedGuestId = sessionStorage.getItem(SESSION_KEY);
    if (storedGuestId) {
      setGuestId(storedGuestId);
      setVerifiedName("verified");
    }
  }, [SESSION_KEY]);

  // ---------------------------------------------------
  // Restore RSVP + menu from DB
  // ---------------------------------------------------

  useEffect(() => {
    async function loadGuestState() {
      if (!guestId) return;

      const { data } = await supabase
        .from("guests")
        .select("rsvp, menu_choice")
        .eq("id", guestId)
        .single();

      if (!data) return;

      if (data.menu_choice) {
        setMenuChoice(data.menu_choice);
      }

      // IMPORTANT: use rsvp column
      if (data.rsvp && data.rsvp !== "pending") {
        setRsvpStatus(data.rsvp);
      }
    }

    loadGuestState();
  }, [guestId]);

  // ---------------------------------------------------
  // Banner logic
  // ---------------------------------------------------

  useEffect(() => {
    async function runUpdateCheck() {
      if (!guestId) return;
      if (!event.last_critical_update_at) return;

      const { data: guest } = await supabase
        .from("guests")
        .select("last_seen_update_at")
        .eq("id", guestId)
        .single();

      if (
        !guest?.last_seen_update_at ||
        new Date(guest.last_seen_update_at).getTime() <
          new Date(event.last_critical_update_at).getTime()
      ) {
        setShowUpdateBanner(true);

        await supabase
          .from("guests")
          .update({
            last_seen_update_at: new Date().toISOString(),
          })
          .eq("id", guestId);
      }
    }

    runUpdateCheck();
  }, [guestId, event.last_critical_update_at]);

  // ---------------------------------------------------
  // Load menus
  // ---------------------------------------------------

  useEffect(() => {
    if (!event.menu_enabled) return;

    supabase
      .from("menus")
      .select("id,title")
      .eq("event_id", event.id)
      .eq("is_active", true)
      .then(({ data }) => setMenus(data ?? []));
  }, [event.id, event.menu_enabled]);

  // ---------------------------------------------------
  // Verification
  // ---------------------------------------------------

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isLockedOut(attempts)) return;

    const result = validateVerificationInput(
      inputName,
      inputPhrase,
      verificationPhrase
    );

    if (!result.ok) {
      setAttempts(nextVerificationAttempts(attempts));
      setError("Verification failed.");
      return;
    }

    const res = await fetch("/api/resolve-guest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: event.id, name: result.name }),
    });

    const data = await res.json();

    setGuestId(data.guestId);
    setVerifiedName(result.name);
    sessionStorage.setItem(SESSION_KEY, data.guestId);
  };

  // ---------------------------------------------------
  // RSVP submit
  // ---------------------------------------------------

  async function submit(status: "yes" | "no") {
    if (!guestId) return;

    setLoading(true);

    await fetch("/api/rsvp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId: event.id,
        guestId,
        rsvpStatus: status,
        menuChoice,
      }),
    });

    setRsvpStatus(status);
    setLoading(false);
  }

  // ---------------------------------------------------
  // Render
  // ---------------------------------------------------

  return (
    <>
      <Head>
        <title>{event.title}</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>

      <main className="min-h-screen flex items-center justify-center px-4">
        {!verifiedName ? (
          <GuestVerificationForm
            inputName={inputName}
            inputPhrase={inputPhrase}
            error={error}
            lockedOut={isLockedOut(attempts)}
            onNameChange={setInputName}
            onPhraseChange={setInputPhrase}
            onSubmit={handleVerify}
          />
        ) : (
          <div className="max-w-md w-full">
            {shouldRenderPostEventLayout ? (
              <PostEventLayout
                eventId={event.id}
                canShowGallery={!isStorageExpired}
              />
            ) : (
              <>

            {showUpdateBanner && (
              <div className="bg-yellow-100 border border-yellow-300 text-sm p-3 mb-4 rounded text-center">
                Informacija buvo atnaujinta.
              </div>
            )}

            <h1 className="text-2xl font-semibold mb-4 text-center">
              {event.title}
            </h1>

            <Countdown eventDate={event.event_date} />

            {rsvpStatus ? (
              <p className="mt-6 text-center">
                Ačiū, jūsų atsakymas išsaugotas.
              </p>
            ) : disableRsvp ? (
              <p className="mt-6 text-center text-sm text-gray-600">
                RSVP is closed for this event.
              </p>
            ) : (
              <div className="mt-6 space-y-2">
                <button
                  onClick={() => submit("yes")}
                  className="w-full bg-black text-white py-2"
                  disabled={loading}
                >
                  Dalyvausiu
                </button>
                <button
                  onClick={() => submit("no")}
                  className="w-full border py-2"
                  disabled={loading}
                >
                  Nedalyvausiu
                </button>
              </div>
            )}
              </>
            )}
          </div>
        )}
      </main>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const slug = ctx.params?.slug;
  if (typeof slug !== "string") return { notFound: true };

  const { data: event, error } = await supabase
    .from("events")
    .select("id,title,event_date,state,guest_access_enabled,slug,menu_enabled,last_critical_update_at,post_event_enabled,storage_grace_until")
    .eq("slug", slug)
    .single();

  if (!event || error) return { notFound: true };

  if (
    event.state !== "active" ||
    event.guest_access_enabled !== true
  ) {
    return { notFound: true };
  }

  return { props: { event } };
};
