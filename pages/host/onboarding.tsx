import type {
  GetServerSideProps,
  InferGetServerSidePropsType,
} from "next";
import { useMemo, useState } from "react";
import { useRouter } from "next/router";
import { createSupabaseServerClient } from "@/infra/supabase.server";
import { supabaseClient } from "@/infra/supabase.client";
import { createDefaultPanels } from "@/lib/panels/defaultPanels";
import type { PanelInstance } from "@/lib/panels/panel.types";
import { logout } from "@/services/auth/auth.write";

type OnboardingData = {
  brideName: string;
  groomName: string;
  weddingDate: string;
  venueName: string;
  venueAddress: string;
  venueLat?: number;
  venueLng?: number;
};

type Props = {
  hostEmail: string;
};

function slugifyNames(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[ą]/g, "a")
    .replace(/[č]/g, "c")
    .replace(/[ęė]/g, "e")
    .replace(/[į]/g, "i")
    .replace(/[š]/g, "s")
    .replace(/[ųū]/g, "u")
    .replace(/[ž]/g, "z")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function randomSuffix(): string {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  }

  return Math.random().toString(16).slice(2, 10).padEnd(8, "0").slice(0, 8);
}

function buildCleanSlug(base: string): string {
  const safeBase = slugifyNames(base) || "event";
  return `${safeBase}-${randomSuffix()}`;
}

function isSlugDuplicateError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const code =
    "code" in error && typeof error.code === "string" ? error.code : "";
  const message =
    "message" in error && typeof error.message === "string" ? error.message : "";

  return code === "23505" || message.includes("events_slug_key");
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const supabase = createSupabaseServerClient(ctx);

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session) {
    return {
      redirect: {
        destination: "/login",
        permanent: false,
      },
    };
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  const hostEmail = user?.email?.trim().toLowerCase();
  if (userError || !hostEmail) {
    return {
      redirect: {
        destination: "/login",
        permanent: false,
      },
    };
  }

  const { data: existingEvent } = await supabase
    .from("events")
    .select("id")
    .eq("host_email", hostEmail)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingEvent?.id) {
    return {
      redirect: {
        destination: `/host/${existingEvent.id}`,
        permanent: false,
      },
    };
  }

  return {
    props: {
      hostEmail,
    },
  };
};

export default function HostOnboardingPage({
  hostEmail,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<OnboardingData>({
    brideName: "",
    groomName: "",
    weddingDate: "",
    venueName: "",
    venueAddress: "",
  });

  const namesPreview = `${data.brideName || "Bride"} & ${data.groomName || "Groom"}`;

  const mapUrl = useMemo(() => {
    const trimmedAddress = data.venueAddress.trim();
    if (!trimmedAddress) {
      return "";
    }

    return `https://www.google.com/maps?q=${encodeURIComponent(
      trimmedAddress
    )}&z=15&output=embed`;
  }, [data.venueAddress]);

  async function finishOnboarding() {
    if (!data.brideName.trim() || !data.groomName.trim()) {
      setError("Abu vardai privalomi.");
      return;
    }

    if (!data.weddingDate) {
      setError("Data privaloma.");
      return;
    }

    if (!data.venueName.trim() || !data.venueAddress.trim()) {
      setError("Vietos pavadinimas ir adresas privalomi.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabaseClient.auth.getUser();

      if (userError || !user) {
        throw new Error("UNAUTHENTICATED");
      }

      const normalizedHostEmail = user.email?.trim().toLowerCase();
      if (!normalizedHostEmail) {
        throw new Error("HOST_EMAIL_MISSING");
      }

      const names = `${data.brideName.trim()} & ${data.groomName.trim()}`;
      const title = names;

      const panels = createDefaultPanels();
      const welcomePanel = panels[0];
      if (welcomePanel) {
        welcomePanel.content.names = names;
      }

      const countdownPanel = panels.find((panel) => panel.type === "countdown");
      if (countdownPanel) {
        countdownPanel.content.date = data.weddingDate;
      }

      const locationPanel = panels.find((panel) => panel.type === "location");
      if (locationPanel) {
        locationPanel.content.venueName = data.venueName.trim();
        locationPanel.content.venueAddress = data.venueAddress.trim();
      }

      const eventDate = new Date(`${data.weddingDate}T12:00:00`);
      if (Number.isNaN(eventDate.getTime())) {
        throw new Error("WEDDING_DATE_INVALID");
      }

      const insertPayload: Record<string, any> = {
        title,
        state: "draft",
        tier: 1,
        host_id: user.id,
        host_email: normalizedHostEmail,
        event_date: eventDate.toISOString(),
        bride_name: data.brideName.trim(),
        groom_name: data.groomName.trim(),
        wedding_date: data.weddingDate,
        venue_name: data.venueName.trim(),
        venue_address: data.venueAddress.trim(),
        panels: panels as PanelInstance[],
      };

      if (typeof data.venueLat === "number") {
        insertPayload.venue_lat = data.venueLat;
      }

      if (typeof data.venueLng === "number") {
        insertPayload.venue_lng = data.venueLng;
      }

      const maxAttempts = 8;
      let createdEvent: { id: string } | null = null;
      let lastInsertError: unknown = null;

      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const slug = buildCleanSlug(names);

        const { data: insertedEvent, error: insertError } = await supabaseClient
          .from("events")
          .insert({
            ...insertPayload,
            slug,
          })
          .select("id")
          .single();

        if (!insertError && insertedEvent) {
          createdEvent = insertedEvent;
          break;
        }

        lastInsertError = insertError;
        if (isSlugDuplicateError(insertError)) {
          continue;
        }

        throw new Error(insertError?.message ?? "EVENT_CREATE_FAILED");
      }

      if (!createdEvent) {
        throw new Error(
          lastInsertError instanceof Error
            ? lastInsertError.message
            : "EVENT_SLUG_RETRY_FAILED"
        );
      }

      await router.replace(`/host/${createdEvent.id}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Nepavyko sukurti įvykio.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    setLoggingOut(true);
    setError(null);

    try {
      await logout();
      window.location.assign("/login");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Nepavyko atsijungti.";
      setError(message);
      setLoggingOut(false);
    }
  }

  function continueFromNames() {
    if (!data.brideName.trim() || !data.groomName.trim()) {
      setError("Abu vardai privalomi.");
      return;
    }

    setError(null);
    setStep(2);
  }

  function continueFromDate() {
    if (!data.weddingDate) {
      setError("Data privaloma.");
      return;
    }

    setError(null);
    setStep(3);
  }

  return (
    <main className="flow-page min-h-screen py-6 text-textPrimary">
      <div className="mx-auto mb-6 flex w-full max-w-layout flex-wrap items-center justify-between gap-4">
        <div className="flow-stack-tight">
          <p className="flow-step-label">Host Workspace</p>
          <h1>Sukurkime jūsų kvietimą</h1>
          <p className="muted">Prisijungta kaip {hostEmail}</p>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          className="flow-btn-ghost active:scale-95"
        >
          {loggingOut ? "Atsijungiama..." : "Atsijungti"}
        </button>
      </div>

      <section className="flow-shell mx-auto">
        <div className="flow-progress">
          <p className={`flow-pill ${step >= 1 ? "flow-pill-active" : ""}`}>Vardai</p>
          <p className={`flow-pill ${step >= 2 ? "flow-pill-active" : ""}`}>Data</p>
          <p className={`flow-pill ${step >= 3 ? "flow-pill-active" : ""}`}>Vieta</p>
        </div>

        <div className="flow-stage-padding">
          <section className="flow-card flow-stack mx-auto w-full max-w-[42rem] p-5">
            <p className="flow-step-label">Info Filling Stage</p>
            <h2 className="text-[clamp(1.6rem,3.3vw,2.5rem)] leading-[1.04] tracking-[0.02em]">
              Užpildykite šventės informaciją
            </h2>
            <p className="flow-desc">
              Vardai, data ir vieta pildomi žingsnis po žingsnio.
            </p>

            <div className="space-y-5">
              {step === 1 ? (
                <div className="flow-card flow-stack rounded-[1.15rem] p-4">
                  <p className="flow-step-label">1 žingsnis</p>
                  <h3 className="font-serif text-[1.5rem]">Kas tuokiasi?</h3>

                  <div className="flow-name-grid grid grid-cols-2 gap-3">
                    <label className="grid gap-1">
                      <span className="flow-step-label">Nuotaka</span>
                      <input
                        type="text"
                        value={data.brideName}
                        onChange={(e) =>
                          setData((prev) => ({ ...prev, brideName: e.target.value }))
                        }
                        placeholder="Bride name"
                        className="flow-input"
                      />
                    </label>

                    <label className="grid gap-1">
                      <span className="flow-step-label">Jaunikis</span>
                      <input
                        type="text"
                        value={data.groomName}
                        onChange={(e) =>
                          setData((prev) => ({ ...prev, groomName: e.target.value }))
                        }
                        placeholder="Groom name"
                        className="flow-input"
                      />
                    </label>
                  </div>

                  <div className="flow-result p-4">
                    <p className="flow-step-label">Peržiūros vardai</p>
                    <p className="mt-1 text-lg font-medium">{namesPreview}</p>
                  </div>

                  <button
                    type="button"
                    onClick={continueFromNames}
                    className="flow-btn w-full active:scale-95"
                  >
                    Tęsti
                  </button>
                </div>
              ) : null}

              {step === 2 ? (
                <div className="calendar-card flow-stack p-4">
                  <p className="flow-step-label">2 žingsnis</p>
                  <h3 className="font-serif text-[1.5rem]">Mūsų šventės data</h3>
                  <label className="grid gap-2">
                    <span className="flow-step-label">Šventės data</span>
                    <input
                      type="date"
                      value={data.weddingDate}
                      onChange={(e) =>
                        setData((prev) => ({ ...prev, weddingDate: e.target.value }))
                      }
                      className="flow-input"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="flow-btn-ghost w-full active:scale-95"
                    >
                      Atgal
                    </button>
                    <button
                      type="button"
                      onClick={continueFromDate}
                      className="flow-btn w-full active:scale-95"
                    >
                      Tęsti
                    </button>
                  </div>
                </div>
              ) : null}

              {step === 3 ? (
                <>
                  <div className="flow-card flow-stack rounded-[1.15rem] p-4">
                    <p className="flow-step-label">3 žingsnis</p>
                    <h3 className="font-serif text-[1.5rem]">Mes susituoksime</h3>
                    <div className="grid gap-3">
                      <label className="grid gap-1">
                        <span className="flow-step-label">Vietos pavadinimas</span>
                        <input
                          type="text"
                          value={data.venueName}
                          onChange={(e) =>
                            setData((prev) => ({ ...prev, venueName: e.target.value }))
                          }
                          placeholder="Venue name"
                          className="flow-input"
                        />
                      </label>

                      <label className="grid gap-1">
                        <span className="flow-step-label">Adresas</span>
                        <input
                          type="text"
                          value={data.venueAddress}
                          onChange={(e) =>
                            setData((prev) => ({ ...prev, venueAddress: e.target.value }))
                          }
                          placeholder="Venue address"
                          className="flow-input"
                        />
                      </label>
                    </div>
                  </div>

                  <div className="map-card">
                    {mapUrl ? (
                      <iframe
                        title="Venue map preview"
                        src={mapUrl}
                        className="h-full w-full"
                        loading="lazy"
                        referrerPolicy="no-referrer-when-downgrade"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center px-6 text-center">
                        <p className="flow-desc">Įveskite adresą ir matysite vietos peržiūrą.</p>
                      </div>
                    )}
                    <span aria-hidden="true" className="map-pin" />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setStep(2)}
                      className="flow-btn-ghost w-full active:scale-95"
                    >
                      Atgal
                    </button>
                    <button
                      type="button"
                      onClick={finishOnboarding}
                      disabled={saving}
                      className="flow-btn w-full active:scale-95"
                    >
                      {saving ? "Kuriama..." : "Sukurti kvietimą"}
                    </button>
                  </div>
                </>
              ) : null}

              {error ? <p className="text-sm text-red-700">{error}</p> : null}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
