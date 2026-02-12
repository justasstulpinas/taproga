import { GetServerSideProps } from "next";
import Head from "next/head";
import { useEffect, useState } from "react";

import { supabase } from "@/infra/supabase.client";
import { buildVerificationPhrase, canGuestViewEvent } from "@/domain/event/event.rules";
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
};

type Props = {
  event: EventPublic;
};

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
          </div>
        )}
      </main>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const slug = ctx.params?.slug;
  if (typeof slug !== "string") return { notFound: true };

  const { data } = await supabase
    .from("events")
    .select("id,title,event_date,state,guest_access_enabled,slug,menu_enabled,last_critical_update_at")
    .eq("slug", slug)
    .single();

  if (!data || !canGuestViewEvent(data)) return { notFound: true };

  return { props: { event: data } };
};
