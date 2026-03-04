import type { CSSProperties } from "react";
import { ALLOWED_TEXT_COLORS } from "@/lib/design/color.tokens";
import type { PanelInstance } from "@/lib/panels/panel.types";

export function getTextColor(color?: string) {
  if (!color) return undefined;
  return ALLOWED_TEXT_COLORS.includes(color) ? color : undefined;
}

export function getPanelStyle(panel: PanelInstance): CSSProperties {
  return {
    backgroundImage: panel.background?.imageUrl
      ? `url(${panel.background.imageUrl})`
      : undefined,
    backgroundSize: "cover",
    backgroundPosition: "center",
  };
}

export function isDarkPanel(panel: PanelInstance, mockup: 1 | 2 | 3) {
  if (mockup === 2) return true;
  if (mockup === 3) {
    return panel.type === "schedule" || panel.type === "countdown" || panel.type === "rsvp";
  }

  if (panel.background?.overlay) return true;
  return false;
}
