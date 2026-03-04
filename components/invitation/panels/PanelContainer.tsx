import type { ReactNode } from "react";
import type { PanelInstance } from "@/lib/panels/panel.types";
import { getPanelStyle, isDarkPanel } from "./panel.utils";

type Props = {
  panel: PanelInstance;
  sectionId?: string;
  mockup: 1 | 2 | 3;
  children: ReactNode;
};

export default function PanelContainer({ panel, sectionId, mockup, children }: Props) {
  const dark = isDarkPanel(panel, mockup);
  const hasImage = Boolean(panel.background?.imageUrl);

  const configuredOpacity =
    typeof panel.background?.overlayOpacity === "number" &&
    Number.isFinite(panel.background.overlayOpacity)
      ? panel.background.overlayOpacity
      : undefined;

  const overlayOpacity = Math.min(
    0.95,
    Math.max(0, configuredOpacity ?? (dark ? 0.74 : 0.42))
  );

  const shouldOverlay =
    panel.background?.overlay === true ||
    (dark && hasImage) ||
    (hasImage && overlayOpacity > 0);

  const overlayTopOpacity = Math.max(0, overlayOpacity - 0.24);
  const overlayStyle = {
    background: `linear-gradient(180deg, rgba(0, 0, 0, ${overlayTopOpacity.toFixed(2)}) 0%, rgba(0, 0, 0, ${overlayOpacity.toFixed(2)}) 100%)`,
  };
  const backgroundStyle = getPanelStyle(panel);
  const backgroundClasses = [
    "invite-panel-bg",
    panel.background?.grayscale ? "invite-panel-bg-bw" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section
      id={sectionId}
      data-nav-tone={dark ? "dark" : "light"}
      className={`invite-panel ${dark ? "invite-panel-dark" : "invite-panel-light"}`}
    >
      {hasImage ? <div className={backgroundClasses} style={backgroundStyle} /> : null}
      {shouldOverlay ? (
        <div
          className={`invite-panel-overlay ${dark ? "invite-panel-overlay-dark" : ""}`}
          style={overlayStyle}
        />
      ) : null}
      <div className="invite-panel-inner">{children}</div>
    </section>
  );
}
