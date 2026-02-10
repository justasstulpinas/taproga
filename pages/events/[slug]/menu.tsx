import { GetServerSideProps } from "next";
import Head from "next/head";
import { useEffect, useState } from "react";

import { supabase } from "@/infra/supabase.client";
import { buildVerificationPhrase } from "@/domain/event/event.rules";
import { GuestVerificationForm } from "@/ui/guest/GuestVerificationForm";
import {
  isLockedOut,
  isVerificationExpired,
  nextVerificationAttempts,
  validateVerificationInput,
} from "@/domain/guest/verification.rules";
import {
  getVerificationAttempts,
  setVerificationAttempts,
  clearVerificationAttempts,
  getVerificationRecord,
  setVerificationRecord,
  clearVerificationRecord,
} from "@/services/guest/verification.storage";
import { canGuestEditMenu } from "../../../lib/guards/menuAccess";

type EventMenu = {
  id: string;
  title: string;
  state: string;
  menu_enabled: boolean;
  menu_options: string[] | null;
  slug: string;
};

type Props = {
  event: EventMenu;
};

export default function GuestMenuPage({ event }: Props) {
  const VERIFY_KEY = `guest_verified_${event.id}`;
  const ATTEMPTS_KEY = `guest_verify_attempts_${event.id}`;

  const [verifiedName, setVerifiedName] = useState<string | null>(null);
  const [guestId, setGuestId] = useState<string | null>(null);

  const [inputName, setInputName] = useState("");
  const [inputPhrase, setInputPhrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);

  const [menuChoice, setMenuChoice] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const verificationPhrase = buildVerificationPhrase(event.slug);
  const lockedOut = isLockedOut(attempts);
  const canEdit = canGuestEditMenu(event);
  const menuOptions = event.menu_options ?? [];

  useEffect(() => {
    const storedAttempts = getVerificationAttempts(ATTEMPTS_KEY);
    setAttempts(storedAttempts);

    const record = getVerificationRecord(VERIFY_KEY);
    if (!record) return;

    const now = Date.now();
    if (isVerificationExpired(record.verifiedAt, now)) {
      clearVerificationRecord(VERIFY_KEY);
      return;
    }

    setVerifiedName(record.name);

    fetch("/api/resolve-guest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId: event.id,
        name: record.name,
      }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then((data) => setGuestId(data.guestId))
      .catch(() => setError("Guest resolution failed."));
  }, [ATTEMPTS_KEY, VERIFY_KEY, event.id]);

  useEffect(() => {
    let isMounted = true;

    async function loadChoice() {
      if (!guestId) return;

      const { data, error: loadError } = await supabase
        .from("guests")
        .select("menu_choice")
        .eq("id", guestId)
        .eq("event_id", event.id)
        .single();

      if (loadError) return;
      if (!isMounted) return;

      if (data?.menu_choice) {
        setMenuChoice(data.menu_choice);
      }
    }

    loadChoice();

    return () => {
      isMounted = false;
    };
  }, [event.id, guestId]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();

    if (lockedOut) return;

    const result = validateVerificationInput(
      inputName,
      inputPhrase,
      verificationPhrase
    );

    if (!result.ok) {
      const next = nextVerificationAttempts(attempts);
      setVerificationAttempts(ATTEMPTS_KEY, next);
      setAttempts(next);
      setError("Verification failed.");
      return;
    }

    setVerificationRecord(VERIFY_KEY, {
      name: result.name,
      verifiedAt: new Date().toISOString(),
    });

    clearVerificationAttempts(ATTEMPTS_KEY);
    setVerifiedName(result.name);
    setAttempts(0);
    setError(null);

    try {
      const res = await fetch("/api/resolve-guest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: event.id,
          name: result.name,
        }),
      });

      if (!res.ok) throw new Error();

      const data = await res.json();
      setGuestId(data.guestId);
    } catch {
      setError("Guest resolution failed.");
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!guestId) return;
    if (!canGuestEditMenu(event)) {
      setSaveError("Menu is locked.");
      return;
    }

    if (!menuChoice) {
      setSaveError("Please select a menu option.");
      return;
    }

    setSaving(true);
    setSaveError(null);
    setSaved(false);

    const { error: updateError } = await supabase
      .from("guests")
      .update({ menu_choice: menuChoice })
      .eq("id", guestId)
      .eq("event_id", event.id);

    if (updateError) {
      setSaveError("Failed to save menu choice.");
    } else {
      setSaved(true);
    }

    setSaving(false);
  };

  if (!canEdit) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <p className="text-center">Menu selection is not available.</p>
      </main>
    );
  }

  return (
    <>
      <Head>
        <title>{event.title} · Menu</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>

      <main className="min-h-screen flex items-center justify-center px-4">
        {!verifiedName ? (
          <GuestVerificationForm
            inputName={inputName}
            inputPhrase={inputPhrase}
            error={error}
            lockedOut={lockedOut}
            onNameChange={setInputName}
            onPhraseChange={setInputPhrase}
            onSubmit={handleVerify}
          />
        ) : (
          <div className="w-full max-w-md">
            <h1 className="text-2xl font-semibold mb-4 text-center">
              {event.title}
            </h1>

            {menuOptions.length === 0 ? (
              <p className="text-center text-gray-600">
                No menu options available.
              </p>
            ) : (
              <form onSubmit={handleSave} className="space-y-4">
                <div className="space-y-3">
                  {menuOptions.map((option) => (
                    <label
                      key={option}
                      className="flex items-center gap-2"
                    >
                      <input
                        type="radio"
                        name="menu_choice"
                        value={option}
                        checked={menuChoice === option}
                        onChange={() => setMenuChoice(option)}
                        disabled={!canEdit || saving}
                      />
                      <span>{option}</span>
                    </label>
                  ))}
                </div>

                {saveError && (
                  <p className="text-sm text-red-600">{saveError}</p>
                )}
                {saved && (
                  <p className="text-sm text-green-600">
                    Menu choice saved.
                  </p>
                )}

                <button
                  type="submit"
                  className="w-full bg-black text-white py-2"
                  disabled={!canEdit || saving}
                >
                  {saving ? "Saving..." : "Save choice"}
                </button>
              </form>
            )}
          </div>
        )}
      </main>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const slug = ctx.params?.slug;

  if (typeof slug !== "string") {
    return { notFound: true };
  }

  const { data, error } = await supabase
    .from("events")
    .select("id,title,state,menu_enabled,menu_options,slug")
    .eq("slug", slug)
    .single();

  if (error || !data) {
    return { notFound: true };
  }

  return {
    props: {
      event: {
        id: data.id,
        title: data.title,
        state: data.state,
        menu_enabled: Boolean(data.menu_enabled),
        menu_options: data.menu_options ?? null,
        slug: data.slug,
      },
    },
  };
};
