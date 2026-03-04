import type {
  GetServerSideProps,
  InferGetServerSidePropsType,
} from "next";
import { useEffect, useState } from "react";
import { createSupabaseServerClient } from "@/infra/supabase.server";
import { supabaseClient } from "@/infra/supabase.client";
import {
  getHostEventById,
  listHostEventGuests,
  type HostEventRecord,
  type HostGuestRecord,
} from "@/services/event/event.read";
import { HostEventDetailPage } from "@/ui/host/HostEventDetailPage";
import type { PanelInstance } from "@/lib/panels/panel.types";
import { ALLOWED_TEXT_COLORS } from "@/lib/design/color.tokens";
import { normalizeOrder } from "@/lib/panels/normalizeOrder";
import { ensureDefaultPanels } from "@/lib/panels/ensureDefaultPanels";

type HostEventWithStorage = HostEventRecord & {
  storage_expires_at: string | null;
  storage_grace_until: string | null;
  tier: number;
  panels: PanelInstance[];
};

type Props = {
  event: HostEventWithStorage;
  guests: HostGuestRecord[];
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
      .select("tier,storage_expires_at,storage_grace_until,panels")
      .eq("id", event.id)
      .eq("host_email", hostEmail)
      .maybeSingle();

    if (storageLifecycleError || !storageLifecycle) {
      return { notFound: true };
    }

    const panels = ensureDefaultPanels(storageLifecycle.panels);

    const eventWithStorage: HostEventWithStorage = {
      ...event,
      storage_expires_at: storageLifecycle.storage_expires_at ?? null,
      storage_grace_until: storageLifecycle.storage_grace_until ?? null,
      tier: Number(storageLifecycle.tier ?? 0),
      panels,
    };

    const guests = await listHostEventGuests(event.id, supabase);

    return {
      props: {
        event: eventWithStorage,
        guests,
      },
    };
  } catch {
    return { notFound: true };
  }
};

function StorageStatus(props: {
  storage_expires_at: string | null;
  storage_grace_until: string | null;
  tier: number;
  eventId: string;
}) {
  const { storage_expires_at, storage_grace_until, tier, eventId } = props;
  const [renewingStorage, setRenewingStorage] = useState(false);

  if (tier < 3) {
    return null;
  }

  const now = new Date();
  const expires = storage_expires_at ? new Date(storage_expires_at) : null;
  const grace = storage_grace_until ? new Date(storage_grace_until) : null;

  const DAY_MS = 24 * 60 * 60 * 1000;
  const THIRTY_DAYS_MS = 30 * DAY_MS;
  const expiryWarningStart = expires
    ? new Date(expires.getTime() - THIRTY_DAYS_MS)
    : null;

  const isActive = Boolean(
    expires && now.getTime() < expires.getTime() - THIRTY_DAYS_MS
  );
  const isExpiringSoon = Boolean(
    expires &&
      expiryWarningStart &&
      now >= expiryWarningStart &&
      now < expires
  );
  const isExpired = Boolean(grace && now > grace);

  async function handleRenewStorage() {
    setRenewingStorage(true);

    try {
      const response = await fetch(`/api/events/${eventId}/storage/renew`, {
        method: "POST",
      });

      const json = await response.json().catch(() => null);
      if (!response.ok) {
        console.error("STORAGE_RENEW_FAILED", json);
        return;
      }

      if (typeof json?.url === "string" && json.url.length > 0) {
        window.location.href = json.url;
        return;
      }

      console.error("STORAGE_RENEW_URL_MISSING", json);
    } catch (error) {
      console.error("STORAGE_RENEW_REQUEST_ERROR", error);
    } finally {
      setRenewingStorage(false);
    }
  }

  if (isActive && expires) {
    return (
      <section className="mx-auto mt-6 max-w-4xl rounded border border-green-300 bg-green-50 p-4">
        <h2 className="text-lg font-semibold text-green-900">Photo gallery active</h2>
        <p className="mt-1 text-sm text-green-900">
          Available until {expires.toLocaleDateString()}
        </p>
      </section>
    );
  }

  if (isExpiringSoon && expires) {
    const daysRemaining = Math.max(
      0,
      Math.ceil((expires.getTime() - now.getTime()) / DAY_MS)
    );

    return (
      <section className="mx-auto mt-6 max-w-4xl rounded border border-amber-300 bg-amber-50 p-4">
        <h2 className="text-lg font-semibold text-amber-900">
          Photo gallery expires soon
        </h2>
        <p className="mt-1 text-sm text-amber-900">{daysRemaining} days remaining</p>
        <button
          type="button"
          onClick={handleRenewStorage}
          disabled={renewingStorage}
          className="mt-3 rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {renewingStorage ? "Redirecting..." : "Renew storage"}
        </button>
      </section>
    );
  }

  if (isExpired) {
    return (
      <section className="mx-auto mt-6 max-w-4xl rounded border border-red-300 bg-red-50 p-4">
        <h2 className="text-lg font-semibold text-red-900">Photo gallery expired</h2>
        <p className="mt-1 text-sm text-red-900">Renew to restore guest access</p>
        <button
          type="button"
          onClick={handleRenewStorage}
          disabled={renewingStorage}
          className="mt-3 rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {renewingStorage ? "Redirecting..." : "Renew storage"}
        </button>
      </section>
    );
  }

  return null;
}

type PanelBuilderProps = {
  eventId: string;
  initialPanels: PanelInstance[];
};

function PanelBuilder({ eventId, initialPanels }: PanelBuilderProps) {
  const [panels, setPanels] = useState<PanelInstance[]>(() =>
    normalizeOrder([...initialPanels].sort((a, b) => a.order - b.order))
  );
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saved" | "error">("idle");

  function patchPanel(panelId: string, updater: (panel: PanelInstance) => PanelInstance) {
    setPanels((prev) =>
      prev.map((panel) => (panel.id === panelId ? updater(panel) : panel))
    );
  }

  function movePanel(panelId: string, direction: -1 | 1) {
    setPanels((prev) => {
      const ordered = [...prev].sort((a, b) => a.order - b.order);
      const index = ordered.findIndex((panel) => panel.id === panelId);
      if (index < 0) return prev;

      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= ordered.length) return prev;

      const [item] = ordered.splice(index, 1);
      ordered.splice(targetIndex, 0, item);

      return normalizeOrder(ordered);
    });
  }

  function updateContent(panelId: string, key: string, value: string) {
    patchPanel(panelId, (panel) => ({
      ...panel,
      content: {
        ...panel.content,
        [key]: value,
      },
    }));
  }

  function updateEnabled(panelId: string, enabled: boolean) {
    patchPanel(panelId, (panel) => ({
      ...panel,
      enabled,
    }));
  }

  function updateStyleColor(
    panelId: string,
    key: "titleColor" | "bodyColor",
    value: string
  ) {
    patchPanel(panelId, (panel) => ({
      ...panel,
      styles: {
        ...(panel.styles ?? {}),
        [key]: value || undefined,
      },
    }));
  }

  function updateOverlay(panelId: string, overlay: boolean) {
    patchPanel(panelId, (panel) => ({
      ...panel,
      background: {
        ...(panel.background ?? {}),
        overlay,
      },
    }));
  }

  function updateBackgroundUrl(panelId: string, imageUrl: string) {
    patchPanel(panelId, (panel) => ({
      ...panel,
      background: {
        ...(panel.background ?? {}),
        imageUrl: imageUrl || undefined,
      },
    }));
  }

  function handleBackgroundUpload(panelId: string, file: File | null) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      updateBackgroundUrl(panelId, reader.result);
    };
    reader.readAsDataURL(file);
  }

  async function handleSave() {
    setSaving(true);
    setSaveState("idle");

    const normalized = normalizeOrder([...panels].sort((a, b) => a.order - b.order));

    const { error } = await supabaseClient
      .from("events")
      .update({ panels: normalized })
      .eq("id", eventId);

    if (error) {
      console.error("PANELS_SAVE_ERROR", error);
      setSaveState("error");
      setSaving(false);
      return;
    }

    setPanels(normalized);
    setSaveState("saved");
    setSaving(false);
  }

  const orderedPanels = [...panels].sort((a, b) => a.order - b.order);

  return (
    <section className="mx-auto mt-6 max-w-4xl space-y-4 rounded border p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Invitation panels</h2>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save panels"}
        </button>
      </div>

      {saveState === "saved" ? (
        <p className="text-sm text-green-700">Panels saved.</p>
      ) : null}
      {saveState === "error" ? (
        <p className="text-sm text-red-700">Failed to save panels.</p>
      ) : null}

      <ul className="space-y-4">
        {orderedPanels.map((panel, index) => {
          const textEntries = Object.entries(panel.content).filter(
            ([, value]) => typeof value === "string"
          );
          const editableFields =
            textEntries.length > 0 ? textEntries.map(([key]) => key) : ["title", "body"];

          return (
            <li
              key={panel.id}
              data-panel-id={panel.id}
              className="space-y-4 rounded border p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-gray-600">Order #{panel.order}</p>
                  <p className="font-medium capitalize">{panel.type}</p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => movePanel(panel.id, -1)}
                    disabled={index === 0}
                    className="rounded border px-2 py-1 text-xs disabled:opacity-40"
                  >
                    Up
                  </button>
                  <button
                    type="button"
                    onClick={() => movePanel(panel.id, 1)}
                    disabled={index === orderedPanels.length - 1}
                    className="rounded border px-2 py-1 text-xs disabled:opacity-40"
                  >
                    Down
                  </button>
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={panel.enabled}
                  onChange={(e) => updateEnabled(panel.id, e.target.checked)}
                />
                Enabled
              </label>

              <div className="grid gap-3 md:grid-cols-2">
                {editableFields.map((fieldKey) => (
                  <label key={fieldKey} className="grid gap-1 text-sm">
                    <span className="capitalize">{fieldKey}</span>
                    <input
                      type="text"
                      value={
                        typeof panel.content[fieldKey] === "string"
                          ? panel.content[fieldKey]
                          : ""
                      }
                      onChange={(e) => updateContent(panel.id, fieldKey, e.target.value)}
                      className="rounded border px-3 py-2"
                    />
                  </label>
                ))}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="grid gap-1 text-sm">
                  <span>Title color</span>
                  <select
                    value={panel.styles?.titleColor ?? ""}
                    onChange={(e) =>
                      updateStyleColor(panel.id, "titleColor", e.target.value)
                    }
                    className="rounded border px-3 py-2"
                  >
                    <option value="">Default</option>
                    {ALLOWED_TEXT_COLORS.map((color) => (
                      <option key={color} value={color}>
                        {color}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-1 text-sm">
                  <span>Body color</span>
                  <select
                    value={panel.styles?.bodyColor ?? ""}
                    onChange={(e) =>
                      updateStyleColor(panel.id, "bodyColor", e.target.value)
                    }
                    className="rounded border px-3 py-2"
                  >
                    <option value="">Default</option>
                    {ALLOWED_TEXT_COLORS.map((color) => (
                      <option key={color} value={color}>
                        {color}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="grid gap-1 text-sm">
                  <span>Background image URL</span>
                  <input
                    type="text"
                    value={panel.background?.imageUrl ?? ""}
                    onChange={(e) => updateBackgroundUrl(panel.id, e.target.value)}
                    className="rounded border px-3 py-2"
                    placeholder="https://..."
                  />
                </label>

                <label className="grid gap-1 text-sm">
                  <span>Upload background image</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) =>
                      handleBackgroundUpload(panel.id, e.target.files?.[0] ?? null)
                    }
                    className="rounded border px-3 py-2"
                  />
                </label>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={panel.background?.overlay === true}
                  onChange={(e) => updateOverlay(panel.id, e.target.checked)}
                />
                Background overlay
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default function HostEventDetailRoute({
  event,
  guests,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [showRenewalSuccess, setShowRenewalSuccess] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("renewal") !== "success") {
      return;
    }

    setShowRenewalSuccess(true);

    const timeoutId = window.setTimeout(() => {
      setShowRenewalSuccess(false);
    }, 5000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, []);

  return (
    <>
      {showRenewalSuccess ? (
        <section className="mx-auto mt-6 max-w-4xl rounded border border-green-300 bg-green-50 p-4">
          <p className="text-sm font-medium text-green-900">
            Storage renewed successfully
          </p>
        </section>
      ) : null}

      <StorageStatus
        storage_expires_at={event.storage_expires_at}
        storage_grace_until={event.storage_grace_until}
        tier={event.tier}
        eventId={event.id}
      />

      <PanelBuilder eventId={event.id} initialPanels={event.panels} />

      <HostEventDetailPage event={event} initialGuests={guests} />
    </>
  );
}
