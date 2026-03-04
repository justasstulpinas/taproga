import type { PanelInstance } from "@/lib/panels/panel.types";
import { createDefaultPanels } from "@/lib/panels/defaultPanels";
import { normalizeOrder } from "@/lib/panels/normalizeOrder";

function firstNonEmptyString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
}

type AdditionalInfoEntry = {
  title: string;
  imageUrl: string | null;
};

function normalizeAdditionalInfoEntries(
  content: Record<string, unknown>
): AdditionalInfoEntry[] {
  if (Array.isArray(content.entries) && content.entries.length > 0) {
    const parsed = (content.entries as Array<Record<string, unknown>>)
      .map((entry) => ({
        title: firstNonEmptyString(entry.title) ?? "",
        imageUrl: firstNonEmptyString(entry.imageUrl) ?? null,
      }))
      .filter((entry) => entry.title.trim().length > 0 || !!entry.imageUrl);

    if (parsed.length > 0) {
      return parsed;
    }
  }

  const legacyEntries: AdditionalInfoEntry[] = [
    {
      title:
        firstNonEmptyString(content.leftTitle, content.title) ?? "Registry",
      imageUrl: firstNonEmptyString(content.leftImageUrl, content.imageUrl) ?? null,
    },
    {
      title: firstNonEmptyString(content.rightTitle) ?? "Dress Code",
      imageUrl: firstNonEmptyString(content.rightImageUrl) ?? null,
    },
  ];

  return legacyEntries;
}

function normalizeAdditionalInfoPanel(panel: PanelInstance): PanelInstance {
  if (panel.type !== "additional-info") {
    return panel;
  }

  return {
    ...panel,
    content: {
      ...panel.content,
      entries: normalizeAdditionalInfoEntries(panel.content),
      description: firstNonEmptyString(
        panel.content.description,
        panel.content.body
      ) ?? "",
    },
  };
}

function mergeDressCodeIntoAdditionalInfo(
  panels: PanelInstance[],
  defaults: PanelInstance[]
) {
  const dress = panels.find((panel) => panel.type === "dress-code");
  if (!dress) {
    return panels.map(normalizeAdditionalInfoPanel);
  }

  const additional = panels.find((panel) => panel.type === "additional-info");
  const defaultAdditional = defaults.find(
    (panel) => panel.type === "additional-info"
  );

  const baseAdditional = normalizeAdditionalInfoPanel(
    additional ??
      (defaultAdditional as PanelInstance)
  );

  const mergedAdditional: PanelInstance = normalizeAdditionalInfoPanel({
    ...baseAdditional,
    enabled: baseAdditional.enabled || dress.enabled,
    order: Math.min(baseAdditional.order, dress.order),
    content: {
      ...baseAdditional.content,
      entries: (() => {
        const baseEntries = normalizeAdditionalInfoEntries(baseAdditional.content);
        const next = [...baseEntries];
        const dressEntry: AdditionalInfoEntry = {
          title: firstNonEmptyString(dress.content?.title) ?? "Dress Code",
          imageUrl:
            firstNonEmptyString(dress.content?.imageUrl, dress.background?.imageUrl) ??
            null,
        };

        if (next.length >= 2) {
          const second = next[1];
          next[1] = {
            title: firstNonEmptyString(second.title, dressEntry.title) ?? "Dress Code",
            imageUrl: firstNonEmptyString(second.imageUrl, dressEntry.imageUrl) ?? null,
          };
          return next;
        }

        return [...next, dressEntry];
      })(),
      description:
        firstNonEmptyString(
          baseAdditional.content.description,
          baseAdditional.content.body,
          dress.content?.body
        ) ?? "",
    },
  });

  const withoutDress = panels.filter((panel) => panel.type !== "dress-code");
  const additionalIndex = withoutDress.findIndex(
    (panel) => panel.type === "additional-info"
  );

  if (additionalIndex >= 0) {
    const next = [...withoutDress];
    next[additionalIndex] = mergedAdditional;
    return next.map(normalizeAdditionalInfoPanel);
  }

  return [...withoutDress, mergedAdditional].map(normalizeAdditionalInfoPanel);
}

function moveCountdownToEnd(panels: PanelInstance[]) {
  const withoutCountdown = panels.filter((panel) => panel.type !== "countdown");
  const countdown = panels.find((panel) => panel.type === "countdown");

  if (!countdown) {
    return panels;
  }

  return [...withoutCountdown, countdown];
}

export function ensureDefaultPanels(rawPanels: unknown): PanelInstance[] {
  const parsed = Array.isArray(rawPanels) ? (rawPanels as PanelInstance[]) : [];

  if (parsed.length === 0) {
    return normalizeOrder(moveCountdownToEnd(createDefaultPanels()));
  }

  const sorted = normalizeOrder(
    [...parsed].sort((a, b) => Number(a?.order ?? 0) - Number(b?.order ?? 0))
  );

  const defaults = createDefaultPanels();
  const merged = mergeDressCodeIntoAdditionalInfo(sorted, defaults);
  const existingTypes = new Set(merged.map((panel) => panel.type));
  const missing = defaults.filter((panel) => !existingTypes.has(panel.type));

  if (missing.length === 0) {
    return normalizeOrder(moveCountdownToEnd(merged));
  }

  return normalizeOrder(moveCountdownToEnd([...merged, ...missing]));
}
