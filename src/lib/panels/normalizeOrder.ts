import type { PanelInstance } from "@/lib/panels/panel.types";

export function normalizeOrder(panels: PanelInstance[]) {
  return panels.map((p, index) => ({
    ...p,
    order: index + 1,
  }));
}
