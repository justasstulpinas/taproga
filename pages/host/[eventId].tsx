import type {
  GetServerSideProps,
  InferGetServerSidePropsType,
} from "next";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { createSupabaseServerClient } from "@/infra/supabase.server";
import { supabaseClient } from "@/infra/supabase.client";
import type { PanelInstance } from "@/lib/panels/panel.types";
import { ALLOWED_TEXT_COLORS } from "@/lib/design/color.tokens";
import { normalizeOrder } from "@/lib/panels/normalizeOrder";
import { ensureDefaultPanels } from "@/lib/panels/ensureDefaultPanels";
import { logout } from "@/services/auth/auth.write";
import PanelRenderer from "../../components/invitation/PanelRenderer";
import { isDarkPanel } from "../../components/invitation/panels/panel.utils";
import type { InvitationLanguage } from "../../components/invitation/invitation.i18n";

type HostEventView = {
  id: string;
  title: string;
  slug: string;
  state: string;
  event_date: string | null;
  bride_name: string | null;
  groom_name: string | null;
  wedding_date: string | null;
  venue_name: string | null;
  venue_address: string | null;
  panels: PanelInstance[];
};

type Props = {
  event: HostEventView;
};

const EDITABLE_FIELDS_BY_TYPE: Record<PanelInstance["type"], string[]> = {
  welcome: ["title", "names", "subtitle"],
  info: ["title", "body"],
  countdown: ["kicker", "title", "subtitle", "date"],
  location: ["title", "venueName", "venueAddress", "city"],
  schedule: ["kicker", "title", "subtitle"],
  "dress-code": [],
  "additional-info": ["title"],
  rsvp: ["title", "subtitle"],
  menu: ["title"],
  "text-block": ["title", "body"],
};

type ScheduleItemEditor = {
  time: string;
  label: string;
};

type AdditionalInfoCardEditor = {
  title: string;
  imageUrl: string;
};

const BUILDER_I18N: Record<
  InvitationLanguage,
  {
    panelBuilder: string;
    language: string;
    savePanels: string;
    saving: string;
    saved: string;
    saveFailed: string;
    order: string;
    up: string;
    down: string;
    expand: string;
    collapse: string;
    enabled: string;
    titleColor: string;
    bodyColor: string;
    default: string;
    backgroundImageUrl: string;
    uploadBackgroundImage: string;
    removeBackgroundImage: string;
    backgroundOverlay: string;
    backgroundImageBw: string;
    overlayDarkness: string;
    venuePhotoUrl: string;
    uploadVenuePhoto: string;
    removeVenuePhoto: string;
    venuePhotoBw: string;
    infoCards: string;
    cardTitle: string;
    cardImageUrl: string;
    uploadCardImage: string;
    removeCardImage: string;
    removeCard: string;
    addCard: string;
    scheduleItems: string;
    time: string;
    label: string;
    removeItem: string;
    addScheduleItem: string;
    menuOptions: string;
    option: string;
    removeOption: string;
    addMenuOption: string;
  }
> = {
  lt: {
    panelBuilder: "Panelių kūrimas",
    language: "Kalba",
    savePanels: "Išsaugoti panelius",
    saving: "Saugoma...",
    saved: "Paneliai išsaugoti.",
    saveFailed: "Nepavyko išsaugoti panelių.",
    order: "Eilė",
    up: "Aukštyn",
    down: "Žemyn",
    expand: "Išskleisti",
    collapse: "Suskleisti",
    enabled: "Įjungta",
    titleColor: "Pavadinimo spalva",
    bodyColor: "Teksto spalva",
    default: "Numatyta",
    backgroundImageUrl: "Fono nuotraukos URL",
    uploadBackgroundImage: "Įkelti fono nuotrauką",
    removeBackgroundImage: "Pašalinti fono nuotrauką",
    backgroundOverlay: "Fono patamsinimas",
    backgroundImageBw: "Fono nuotrauka nespalvota",
    overlayDarkness: "Patamsinimo lygis",
    venuePhotoUrl: "Vietos nuotraukos URL",
    uploadVenuePhoto: "Įkelti vietos nuotrauką",
    removeVenuePhoto: "Pašalinti vietos nuotrauką",
    venuePhotoBw: "Vietos nuotrauka nespalvota",
    infoCards: "Informacijos kortelės",
    cardTitle: "Tekstas po nuotrauka",
    cardImageUrl: "Kortelės nuotraukos URL",
    uploadCardImage: "Įkelti kortelės nuotrauką",
    removeCardImage: "Pašalinti kortelės nuotrauką",
    removeCard: "Pašalinti kortelę",
    addCard: "Pridėti kortelę",
    scheduleItems: "Programos punktai",
    time: "Laikas",
    label: "Pavadinimas",
    removeItem: "Pašalinti punktą",
    addScheduleItem: "Pridėti programos punktą",
    menuOptions: "Meniu pasirinkimai",
    option: "Pasirinkimas",
    removeOption: "Pašalinti pasirinkimą",
    addMenuOption: "Pridėti meniu pasirinkimą",
  },
  en: {
    panelBuilder: "Panel Builder",
    language: "Language",
    savePanels: "Save panels",
    saving: "Saving...",
    saved: "Panels saved.",
    saveFailed: "Failed to save panels.",
    order: "Order",
    up: "Up",
    down: "Down",
    expand: "Expand",
    collapse: "Collapse",
    enabled: "Enabled",
    titleColor: "Title color",
    bodyColor: "Body color",
    default: "Default",
    backgroundImageUrl: "Background image URL",
    uploadBackgroundImage: "Upload background image",
    removeBackgroundImage: "Remove background image",
    backgroundOverlay: "Background overlay",
    backgroundImageBw: "Background image black & white",
    overlayDarkness: "Overlay darkness",
    venuePhotoUrl: "Venue photo URL",
    uploadVenuePhoto: "Upload venue photo",
    removeVenuePhoto: "Remove venue photo",
    venuePhotoBw: "Venue photo black & white",
    infoCards: "Info cards",
    cardTitle: "Text below photo",
    cardImageUrl: "Card image URL",
    uploadCardImage: "Upload card image",
    removeCardImage: "Remove card image",
    removeCard: "Remove card",
    addCard: "Add card",
    scheduleItems: "Schedule items",
    time: "Time",
    label: "Label",
    removeItem: "Remove item",
    addScheduleItem: "Add schedule item",
    menuOptions: "Menu options",
    option: "Option",
    removeOption: "Remove option",
    addMenuOption: "Add menu option",
  },
};

const PANEL_TYPE_LABELS: Record<InvitationLanguage, Record<PanelInstance["type"], string>> = {
  lt: {
    welcome: "Pradžia",
    info: "Informacija",
    countdown: "Atgalinis",
    location: "Vieta",
    schedule: "Programa",
    "dress-code": "Aprangos kodas",
    "additional-info": "Papildoma informacija",
    rsvp: "Dalyvavimas",
    menu: "Meniu",
    "text-block": "Teksto blokas",
  },
  en: {
    welcome: "Welcome",
    info: "Info",
    countdown: "Countdown",
    location: "Location",
    schedule: "Schedule",
    "dress-code": "Dress Code",
    "additional-info": "Additional Info",
    rsvp: "RSVP",
    menu: "Menu",
    "text-block": "Text Block",
  },
};

const FIELD_LABELS: Record<InvitationLanguage, Record<string, string>> = {
  lt: {
    title: "Pavadinimas",
    names: "Vardai",
    subtitle: "Paantraštė",
    body: "Tekstas",
    date: "Data",
    kicker: "Viršutinė eilutė",
    venueName: "Vietos pavadinimas",
    venueAddress: "Adresas",
    city: "Miestas",
    description: "Aprašymas",
  },
  en: {
    title: "Title",
    names: "Names",
    subtitle: "Subtitle",
    body: "Body",
    date: "Date",
    kicker: "Kicker",
    venueName: "Venue name",
    venueAddress: "Venue address",
    city: "City",
    description: "Description",
  },
};

function pageCardClasses() {
  return "flow-card flow-stack p-6";
}

function clampOverlayOpacity(value: number) {
  return Math.min(0.95, Math.max(0, value));
}

function resolveOverlayOpacity(panel: PanelInstance) {
  if (
    typeof panel.background?.overlayOpacity === "number" &&
    Number.isFinite(panel.background.overlayOpacity)
  ) {
    return clampOverlayOpacity(panel.background.overlayOpacity);
  }

  return isDarkPanel(panel, 1) ? 0.74 : 0.42;
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const eventId = ctx.params?.eventId;

  if (typeof eventId !== "string" || !eventId.trim()) {
    return { notFound: true };
  }

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

  const { data: event, error: eventError } = await supabase
    .from("events")
    .select(
      "id,title,slug,state,event_date,bride_name,groom_name,wedding_date,venue_name,venue_address,panels"
    )
    .eq("id", eventId)
    .eq("host_email", hostEmail)
    .maybeSingle();

  if (eventError || !event) {
    return { notFound: true };
  }

  const panels = ensureDefaultPanels(event.panels);

  return {
    props: {
      event: {
        ...(event as Omit<HostEventView, "panels">),
        panels,
      },
    },
  };
};

function PanelBuilder({
  eventId,
  initialPanels,
  event,
}: {
  eventId: string;
  initialPanels: PanelInstance[];
  event: HostEventView;
}) {
  const [panels, setPanels] = useState<PanelInstance[]>(() =>
    normalizeOrder([...initialPanels].sort((a, b) => a.order - b.order))
  );
  const [openPanelId, setOpenPanelId] = useState<string | null>(() => {
    const ordered = [...initialPanels].sort((a, b) => a.order - b.order);
    return ordered[0]?.id ?? null;
  });
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saved" | "error">("idle");
  const editorListRef = useRef<HTMLDivElement | null>(null);
  const [previewLanguage, setPreviewLanguage] =
    useState<InvitationLanguage>("lt");
  const builderText = BUILDER_I18N[previewLanguage];

  const orderedPanels = useMemo(
    () => [...panels].sort((a, b) => a.order - b.order),
    [panels]
  );

  function getPanelTypeLabel(type: PanelInstance["type"]) {
    return PANEL_TYPE_LABELS[previewLanguage][type];
  }

  function getFieldLabel(field: string) {
    return FIELD_LABELS[previewLanguage][field] ?? field;
  }

  useEffect(() => {
    if (!openPanelId) return;
    const container = editorListRef.current;
    if (!container) return;

    const target = container.querySelector<HTMLElement>(
      `[data-panel-id="${openPanelId}"]`
    );
    if (!target) return;

    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const outAbove = targetRect.top < containerRect.top;
    const outBelow = targetRect.bottom > containerRect.bottom;

    if (outAbove || outBelow) {
      target.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [openPanelId]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("invite_language");
      if (stored === "lt" || stored === "en") {
        setPreviewLanguage(stored);
      }
    } catch {
      // Ignore storage errors for preview language.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("invite_language", previewLanguage);
    } catch {
      // Ignore storage errors for preview language.
    }
  }, [previewLanguage]);

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

      const target = index + direction;
      if (target < 0 || target >= ordered.length) return prev;

      const [moved] = ordered.splice(index, 1);
      ordered.splice(target, 0, moved);

      return normalizeOrder(ordered);
    });
  }

  function togglePanelOpen(panelId: string) {
    setOpenPanelId((current) => (current === panelId ? null : panelId));
  }

  function updateContent(panelId: string, field: string, value: string) {
    patchPanel(panelId, (panel) => ({
      ...panel,
      content: {
        ...panel.content,
        [field]: value,
      },
    }));
  }

  function updateContentValue(panelId: string, field: string, value: unknown) {
    patchPanel(panelId, (panel) => ({
      ...panel,
      content: {
        ...panel.content,
        [field]: value,
      },
    }));
  }

  function updateEnabled(panelId: string, enabled: boolean) {
    patchPanel(panelId, (panel) => ({
      ...panel,
      enabled,
    }));
  }

  function updateTextColor(panelId: string, key: "titleColor" | "bodyColor", value: string) {
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

  function updateOverlayOpacity(panelId: string, percent: number) {
    const normalized = clampOverlayOpacity(percent / 100);

    patchPanel(panelId, (panel) => ({
      ...panel,
      background: {
        ...(panel.background ?? {}),
        overlayOpacity: normalized,
        overlay: normalized > 0 ? true : panel.background?.overlay,
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

  function updateBackgroundGrayscale(panelId: string, grayscale: boolean) {
    patchPanel(panelId, (panel) => ({
      ...panel,
      background: {
        ...(panel.background ?? {}),
        grayscale,
      },
    }));
  }

  function uploadBackground(panelId: string, file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      updateBackgroundUrl(panelId, reader.result);
    };
    reader.readAsDataURL(file);
  }

  function uploadVenuePhoto(panelId: string, file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      updateContentValue(panelId, "imageUrl", reader.result);
    };
    reader.readAsDataURL(file);
  }

  function getAdditionalInfoCards(panel: PanelInstance): AdditionalInfoCardEditor[] {
    if (Array.isArray(panel.content.entries) && panel.content.entries.length > 0) {
      const parsed = (panel.content.entries as Array<Record<string, unknown>>).map(
        (entry) => ({
          title: typeof entry.title === "string" ? entry.title : "",
          imageUrl: typeof entry.imageUrl === "string" ? entry.imageUrl : "",
        })
      );

      if (parsed.length > 0) {
        return parsed;
      }
    }

    const legacyCards: AdditionalInfoCardEditor[] = [
      {
        title: typeof panel.content.leftTitle === "string" ? panel.content.leftTitle : "",
        imageUrl:
          typeof panel.content.leftImageUrl === "string"
            ? panel.content.leftImageUrl
            : "",
      },
      {
        title:
          typeof panel.content.rightTitle === "string" ? panel.content.rightTitle : "",
        imageUrl:
          typeof panel.content.rightImageUrl === "string"
            ? panel.content.rightImageUrl
            : "",
      },
    ];

    const hasAnyLegacy = legacyCards.some(
      (card) => card.title.trim() || card.imageUrl.trim()
    );

    if (hasAnyLegacy) {
      return legacyCards;
    }

    return [{ title: "", imageUrl: "" }, { title: "", imageUrl: "" }];
  }

  function updateAdditionalInfoCard(
    panelId: string,
    index: number,
    field: keyof AdditionalInfoCardEditor,
    value: string
  ) {
    patchPanel(panelId, (panel) => {
      const nextCards = getAdditionalInfoCards(panel).map((card, cardIndex) =>
        cardIndex === index ? { ...card, [field]: value } : card
      );

      return {
        ...panel,
        content: {
          ...panel.content,
          entries: nextCards,
        },
      };
    });
  }

  function addAdditionalInfoCard(panelId: string) {
    patchPanel(panelId, (panel) => ({
      ...panel,
      content: {
        ...panel.content,
        entries: [...getAdditionalInfoCards(panel), { title: "", imageUrl: "" }],
      },
    }));
  }

  function removeAdditionalInfoCard(panelId: string, index: number) {
    patchPanel(panelId, (panel) => {
      const nextCards = getAdditionalInfoCards(panel).filter(
        (_, cardIndex) => cardIndex !== index
      );

      return {
        ...panel,
        content: {
          ...panel.content,
          entries: nextCards.length > 0 ? nextCards : [{ title: "", imageUrl: "" }],
        },
      };
    });
  }

  function uploadAdditionalInfoPhoto(panelId: string, index: number, file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      updateAdditionalInfoCard(panelId, index, "imageUrl", reader.result);
    };
    reader.readAsDataURL(file);
  }

  function getScheduleItems(panel: PanelInstance): ScheduleItemEditor[] {
    if (Array.isArray(panel.content.items) && panel.content.items.length > 0) {
      return (panel.content.items as Array<Record<string, unknown>>).map((item) => ({
        time: typeof item.time === "string" ? item.time : "",
        label: typeof item.label === "string" ? item.label : "",
      }));
    }

    const defaultLabels =
      previewLanguage === "lt"
        ? [
            "Ceremonija — įžadai gamtos apsuptyje.",
            "Vakarienė — bendras stalas ir šventė.",
            "Fejerverkai — vakaro pabaiga kartu.",
          ]
        : [
            "Ceremony — vows surrounded by nature.",
            "Dinner — shared table and celebration.",
            "Fireworks — closing the evening together.",
          ];

    return [
      { time: "16:00", label: defaultLabels[0] },
      { time: "18:00", label: defaultLabels[1] },
      { time: "22:00", label: defaultLabels[2] },
    ];
  }

  function updateScheduleItem(
    panelId: string,
    index: number,
    field: "time" | "label",
    value: string
  ) {
    patchPanel(panelId, (panel) => {
      const nextItems = getScheduleItems(panel).map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item
      );

      return {
        ...panel,
        content: {
          ...panel.content,
          items: nextItems,
        },
      };
    });
  }

  function addScheduleItem(panelId: string) {
    patchPanel(panelId, (panel) => {
      const nextItems = [...getScheduleItems(panel), { time: "", label: "" }];
      return {
        ...panel,
        content: {
          ...panel.content,
          items: nextItems,
        },
      };
    });
  }

  function removeScheduleItem(panelId: string, index: number) {
    patchPanel(panelId, (panel) => {
      const currentItems = getScheduleItems(panel);
      const nextItems = currentItems.filter((_, itemIndex) => itemIndex !== index);
      return {
        ...panel,
        content: {
          ...panel.content,
          items: nextItems,
        },
      };
    });
  }

  function getMenuOptions(panel: PanelInstance): string[] {
    if (Array.isArray(panel.content.options) && panel.content.options.length > 0) {
      return (panel.content.options as unknown[]).map((option) =>
        typeof option === "string" ? option : ""
      );
    }

    return previewLanguage === "lt"
      ? ["Klasikinis meniu", "Vegetariškas meniu", "Veganiškas meniu"]
      : ["Classic Menu", "Vegetarian Menu", "Vegan Menu"];
  }

  function updateMenuOption(panelId: string, index: number, value: string) {
    patchPanel(panelId, (panel) => {
      const nextOptions = getMenuOptions(panel).map((option, optionIndex) =>
        optionIndex === index ? value : option
      );

      return {
        ...panel,
        content: {
          ...panel.content,
          options: nextOptions,
        },
      };
    });
  }

  function addMenuOption(panelId: string) {
    patchPanel(panelId, (panel) => ({
      ...panel,
      content: {
        ...panel.content,
        options: [...getMenuOptions(panel), ""],
      },
    }));
  }

  function removeMenuOption(panelId: string, index: number) {
    patchPanel(panelId, (panel) => ({
      ...panel,
      content: {
        ...panel.content,
        options: getMenuOptions(panel).filter((_, optionIndex) => optionIndex !== index),
      },
    }));
  }

  async function savePanels() {
    setSaving(true);
    setSaveState("idle");

    const updatedPanels = normalizeOrder(
      [...panels].sort((a, b) => a.order - b.order)
    );

    const { error } = await supabaseClient
      .from("events")
      .update({ panels: updatedPanels })
      .eq("id", eventId);

    if (error) {
      console.error("PANELS_SAVE_ERROR", error);
      setSaveState("error");
      setSaving(false);
      return;
    }

    setPanels(updatedPanels);
    setSaveState("saved");
    setSaving(false);
  }

  return (
    <section className={`${pageCardClasses()} flow-stage-padding`}>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h2>{builderText.panelBuilder}</h2>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-full border border-[var(--line-strong)] bg-white/70 px-2 py-1">
            <span className="text-[0.72rem] uppercase tracking-[0.14em] text-textSecondary">
              {builderText.language}
            </span>
            <button
              type="button"
              onClick={() => setPreviewLanguage("lt")}
              className={`flow-btn-ghost px-3 py-2 text-[0.72rem] ${
                previewLanguage === "lt" ? "opacity-100" : "opacity-60"
              }`}
            >
              LT
            </button>
            <button
              type="button"
              onClick={() => setPreviewLanguage("en")}
              className={`flow-btn-ghost px-3 py-2 text-[0.72rem] ${
                previewLanguage === "en" ? "opacity-100" : "opacity-60"
              }`}
            >
              EN
            </button>
          </div>
          <button
            type="button"
            onClick={savePanels}
            disabled={saving}
            className="flow-btn active:scale-95"
          >
            {saving ? builderText.saving : builderText.savePanels}
          </button>
        </div>
      </div>

      {saveState === "saved" ? (
        <p className="mb-4 text-sm text-green-700">{builderText.saved}</p>
      ) : null}
      {saveState === "error" ? (
        <p className="mb-4 text-sm text-red-700">{builderText.saveFailed}</p>
      ) : null}

      <div className="grid grid-cols-3 gap-8">
        <div className="col-span-1">
          <div
            ref={editorListRef}
            className="max-h-[75vh] overflow-y-auto pr-4 pb-12"
          >
            {orderedPanels.map((panel, index) => {
              const textFields = Object.entries(panel.content).filter(
                ([, value]) => typeof value === "string"
              );
              const editableFields = Array.from(
                new Set([
                  ...EDITABLE_FIELDS_BY_TYPE[panel.type],
                  ...textFields.map(([key]) => key),
                ])
              );
              const filteredEditableFields =
                panel.type === "location"
                  ? editableFields.filter((field) => field !== "imageUrl")
                  : panel.type === "additional-info"
                  ? editableFields.filter(
                      (field) =>
                        field !== "entries" &&
                        field !== "leftImageUrl" &&
                        field !== "rightImageUrl" &&
                        field !== "leftTitle" &&
                        field !== "rightTitle" &&
                        field !== "description" &&
                        field !== "body" &&
                        field !== "kicker"
                    )
                  : editableFields;
              const scheduleItems =
                panel.type === "schedule" ? getScheduleItems(panel) : [];
              const menuOptions =
                panel.type === "menu" ? getMenuOptions(panel) : [];
              const additionalInfoCards =
                panel.type === "additional-info" ? getAdditionalInfoCards(panel) : [];
              const isOpen = openPanelId === panel.id;

              return (
                <article
                  key={panel.id}
                  data-panel-id={panel.id}
                  className="flow-card flow-stack mb-16 p-12 last:mb-0"
                >
                  <div className="flex flex-wrap items-center justify-between gap-6">
                    <div>
                      <p className="muted">{builderText.order} {panel.order}</p>
                      <p className="font-medium">{getPanelTypeLabel(panel.type)}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <button
                        type="button"
                        onClick={() => movePanel(panel.id, -1)}
                        disabled={index === 0}
                        className="flow-btn-ghost px-4 py-3 text-[0.72rem] disabled:opacity-40"
                      >
                        {builderText.up}
                      </button>
                      <button
                        type="button"
                        onClick={() => movePanel(panel.id, 1)}
                        disabled={index === orderedPanels.length - 1}
                        className="flow-btn-ghost px-4 py-3 text-[0.72rem] disabled:opacity-40"
                      >
                        {builderText.down}
                      </button>
                      <button
                        type="button"
                        onClick={() => togglePanelOpen(panel.id)}
                        className="flow-btn-ghost px-4 py-3 text-[0.72rem]"
                      >
                        {isOpen ? builderText.collapse : builderText.expand}
                      </button>
                    </div>
                  </div>

                  {isOpen ? (
                    <>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={panel.enabled}
                          onChange={(e) => updateEnabled(panel.id, e.target.checked)}
                        />
                        {builderText.enabled}
                      </label>

                      <div className="grid gap-4">
                        {filteredEditableFields.map((field) => (
                          <label key={field} className="grid gap-1 text-sm">
                            <span>{getFieldLabel(field)}</span>
                            <input
                              type="text"
                              value={
                                typeof panel.content[field] === "string"
                                  ? panel.content[field]
                                  : ""
                              }
                              onChange={(e) =>
                                updateContent(panel.id, field, e.target.value)
                              }
                              className="flow-input"
                            />
                          </label>
                        ))}
                      </div>

                      {panel.type === "location" ? (
                        <div className="grid gap-4">
                          <label className="grid gap-1 text-sm">
                            <span>{builderText.venuePhotoUrl}</span>
                            <input
                              type="text"
                              value={
                                typeof panel.content.imageUrl === "string"
                                  ? panel.content.imageUrl
                                  : ""
                              }
                              onChange={(e) =>
                                updateContentValue(panel.id, "imageUrl", e.target.value)
                              }
                              className="flow-input"
                              placeholder="https://..."
                            />
                          </label>

                          <label className="grid gap-1 text-sm">
                            <span>{builderText.uploadVenuePhoto}</span>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) =>
                                uploadVenuePhoto(panel.id, e.target.files?.[0] ?? null)
                              }
                              className="flow-input"
                            />
                          </label>

                          <button
                            type="button"
                            onClick={() => updateContentValue(panel.id, "imageUrl", "")}
                            className="flow-btn-ghost text-[0.72rem]"
                          >
                            {builderText.removeVenuePhoto}
                          </button>

                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={panel.content.imageGrayscale === true}
                              onChange={(e) =>
                                updateContentValue(
                                  panel.id,
                                  "imageGrayscale",
                                  e.target.checked
                                )
                              }
                            />
                            {builderText.venuePhotoBw}
                          </label>
                        </div>
                      ) : null}

                      {panel.type === "additional-info" ? (
                        <div className="grid gap-4">
                          <p className="text-sm font-medium">{builderText.infoCards}</p>

                          <div className="grid gap-3">
                            {additionalInfoCards.map((card, cardIndex) => (
                              <div
                                key={`${panel.id}-extra-${cardIndex}`}
                                className="grid gap-2 rounded border border-borderSoft p-3"
                              >
                                <label className="grid gap-1 text-sm">
                                  <span>{builderText.cardTitle}</span>
                                  <input
                                    type="text"
                                    value={card.title}
                                    onChange={(e) =>
                                      updateAdditionalInfoCard(
                                        panel.id,
                                        cardIndex,
                                        "title",
                                        e.target.value
                                      )
                                    }
                                    className="flow-input"
                                    placeholder={
                                      previewLanguage === "lt"
                                        ? "Tekstas po nuotrauka"
                                        : "Text below photo"
                                    }
                                  />
                                </label>

                                <label className="grid gap-1 text-sm">
                                  <span>{builderText.cardImageUrl}</span>
                                  <input
                                    type="text"
                                    value={card.imageUrl}
                                    onChange={(e) =>
                                      updateAdditionalInfoCard(
                                        panel.id,
                                        cardIndex,
                                        "imageUrl",
                                        e.target.value
                                      )
                                    }
                                    className="flow-input"
                                    placeholder="https://..."
                                  />
                                </label>

                                <label className="grid gap-1 text-sm">
                                  <span>{builderText.uploadCardImage}</span>
                                  <input
                                    type="file"
                                    accept="image/*"
                                    onChange={(e) =>
                                      uploadAdditionalInfoPhoto(
                                        panel.id,
                                        cardIndex,
                                        e.target.files?.[0] ?? null
                                      )
                                    }
                                    className="flow-input"
                                  />
                                </label>

                                <div className="flex flex-wrap items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateAdditionalInfoCard(
                                        panel.id,
                                        cardIndex,
                                        "imageUrl",
                                        ""
                                      )
                                    }
                                    className="flow-btn-ghost text-[0.72rem]"
                                  >
                                    {builderText.removeCardImage}
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      removeAdditionalInfoCard(panel.id, cardIndex)
                                    }
                                    className="flow-btn-ghost text-[0.72rem]"
                                  >
                                    {builderText.removeCard}
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>

                          <button
                            type="button"
                            onClick={() => addAdditionalInfoCard(panel.id)}
                            className="flow-btn-ghost text-[0.72rem]"
                          >
                            {builderText.addCard}
                          </button>
                        </div>
                      ) : null}

                      {panel.type === "schedule" ? (
                        <div className="grid gap-4">
                          <p className="text-sm font-medium">{builderText.scheduleItems}</p>

                          <div className="grid gap-3">
                            {scheduleItems.map((item, itemIndex) => (
                              <div key={`${panel.id}-schedule-${itemIndex}`} className="grid gap-2 rounded border border-borderSoft p-3">
                                <label className="grid gap-1 text-sm">
                                  <span>{builderText.time}</span>
                                  <input
                                    type="text"
                                    value={item.time}
                                    onChange={(e) =>
                                      updateScheduleItem(
                                        panel.id,
                                        itemIndex,
                                        "time",
                                        e.target.value
                                      )
                                    }
                                    className="flow-input"
                                    placeholder="16:00"
                                  />
                                </label>

                                <label className="grid gap-1 text-sm">
                                  <span>{builderText.label}</span>
                                  <input
                                    type="text"
                                    value={item.label}
                                    onChange={(e) =>
                                      updateScheduleItem(
                                        panel.id,
                                        itemIndex,
                                        "label",
                                        e.target.value
                                      )
                                    }
                                    className="flow-input"
                                    placeholder={
                                      previewLanguage === "lt"
                                        ? "Ceremonija"
                                        : "Ceremony"
                                    }
                                  />
                                </label>

                                <button
                                  type="button"
                                  onClick={() => removeScheduleItem(panel.id, itemIndex)}
                                  className="flow-btn-ghost text-[0.72rem]"
                                >
                                  {builderText.removeItem}
                                </button>
                              </div>
                            ))}
                          </div>

                          <button
                            type="button"
                            onClick={() => addScheduleItem(panel.id)}
                            className="flow-btn-ghost text-[0.72rem]"
                          >
                            {builderText.addScheduleItem}
                          </button>
                        </div>
                      ) : null}

                      {panel.type === "menu" ? (
                        <div className="grid gap-4">
                          <p className="text-sm font-medium">{builderText.menuOptions}</p>

                          <div className="grid gap-3">
                            {menuOptions.map((option, optionIndex) => (
                              <div key={`${panel.id}-menu-${optionIndex}`} className="grid gap-2 rounded border border-borderSoft p-3">
                                <label className="grid gap-1 text-sm">
                                  <span>{builderText.option}</span>
                                  <input
                                    type="text"
                                    value={option}
                                    onChange={(e) =>
                                      updateMenuOption(panel.id, optionIndex, e.target.value)
                                    }
                                    className="flow-input"
                                    placeholder={
                                      previewLanguage === "lt"
                                        ? "Meniu pasirinkimas"
                                        : "Menu option"
                                    }
                                  />
                                </label>

                                <button
                                  type="button"
                                  onClick={() => removeMenuOption(panel.id, optionIndex)}
                                  className="flow-btn-ghost text-[0.72rem]"
                                >
                                  {builderText.removeOption}
                                </button>
                              </div>
                            ))}
                          </div>

                          <button
                            type="button"
                            onClick={() => addMenuOption(panel.id)}
                            className="flow-btn-ghost text-[0.72rem]"
                          >
                            {builderText.addMenuOption}
                          </button>
                        </div>
                      ) : null}

                      <div className="grid gap-4">
                        <label className="grid gap-1 text-sm">
                          <span>{builderText.titleColor}</span>
                          <select
                            value={panel.styles?.titleColor ?? ""}
                            onChange={(e) =>
                              updateTextColor(panel.id, "titleColor", e.target.value)
                            }
                            className="flow-select"
                          >
                            <option value="">{builderText.default}</option>
                            {ALLOWED_TEXT_COLORS.map((color) => (
                              <option key={color} value={color}>
                                {color}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="grid gap-1 text-sm">
                          <span>{builderText.bodyColor}</span>
                          <select
                            value={panel.styles?.bodyColor ?? ""}
                            onChange={(e) =>
                              updateTextColor(panel.id, "bodyColor", e.target.value)
                            }
                            className="flow-select"
                          >
                            <option value="">{builderText.default}</option>
                            {ALLOWED_TEXT_COLORS.map((color) => (
                              <option key={color} value={color}>
                                {color}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>

                      <div className="grid gap-4">
                        <label className="grid gap-1 text-sm">
                          <span>{builderText.backgroundImageUrl}</span>
                          <input
                            type="text"
                            value={panel.background?.imageUrl ?? ""}
                            onChange={(e) =>
                              updateBackgroundUrl(panel.id, e.target.value)
                            }
                            className="flow-input"
                            placeholder="https://..."
                          />
                        </label>

                        <label className="grid gap-1 text-sm">
                          <span>{builderText.uploadBackgroundImage}</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) =>
                              uploadBackground(panel.id, e.target.files?.[0] ?? null)
                            }
                            className="flow-input"
                          />
                        </label>

                        <button
                          type="button"
                          onClick={() => updateBackgroundUrl(panel.id, "")}
                          className="flow-btn-ghost text-[0.72rem]"
                        >
                          {builderText.removeBackgroundImage}
                        </button>
                      </div>

                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={panel.background?.overlay === true}
                          onChange={(e) => updateOverlay(panel.id, e.target.checked)}
                        />
                        {builderText.backgroundOverlay}
                      </label>

                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={panel.background?.grayscale === true}
                          onChange={(e) =>
                            updateBackgroundGrayscale(panel.id, e.target.checked)
                          }
                        />
                        {builderText.backgroundImageBw}
                      </label>

                      <label className="grid gap-2 text-sm">
                        <span>
                          {builderText.overlayDarkness} ({Math.round(resolveOverlayOpacity(panel) * 100)}%)
                        </span>
                        <input
                          type="range"
                          min={0}
                          max={95}
                          step={1}
                          value={Math.round(resolveOverlayOpacity(panel) * 100)}
                          onChange={(e) =>
                            updateOverlayOpacity(panel.id, Number(e.target.value))
                          }
                          className="w-full"
                        />
                      </label>
                    </>
                  ) : null}
                </article>
              );
            })}
          </div>
        </div>

        <div className="col-span-2">
          <div className="flow-card p-4">
            <div className="h-[75vh] rounded-xl border border-[var(--line-strong)] bg-bg">
              <PanelRenderer
                panels={orderedPanels}
                event={event}
                embedded
                onActivePanelChange={setOpenPanelId}
                language={previewLanguage}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function HostEventDashboard({
  event,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [loggingOut, setLoggingOut] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleLogout() {
    setActionError(null);
    setLoggingOut(true);

    try {
      await logout();
      window.location.assign("/login");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to log out";
      setActionError(message);
      setLoggingOut(false);
    }
  }

  return (
    <main className="flow-page min-h-screen py-10 text-textPrimary">
      <div className="mx-auto flex w-full max-w-layout flex-col gap-10">
        <section className={pageCardClasses()}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <nav className="flex flex-wrap items-center gap-6 text-[0.78rem] font-medium uppercase tracking-[0.16em] text-textSecondary">
              <Link href="/host" className="hover:text-textPrimary">
                Home
              </Link>
              <Link href="/blog" className="hover:text-textPrimary">
                Blog
              </Link>
            </nav>
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className="flow-btn-ghost active:scale-95"
            >
              {loggingOut ? "Logging out..." : "Logout"}
            </button>
          </div>

          {actionError ? (
            <p className="mt-3 text-sm text-red-700">{actionError}</p>
          ) : null}
        </section>

        <PanelBuilder eventId={event.id} initialPanels={event.panels} event={event} />
      </div>
    </main>
  );
}
