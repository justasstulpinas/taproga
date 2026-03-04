import { useState } from "react";
import type { PanelInstance } from "@/lib/panels/panel.types";
import {
  INVITE_TEXT,
  getInviteText,
  hasVisibleText,
  resolveLocalizedString,
  type InvitationLanguage,
} from "../invitation.i18n";
import PanelContainer from "./PanelContainer";
import { getTextColor } from "./panel.utils";

type Props = {
  panel: PanelInstance;
  event: any;
  sectionId?: string;
  mockup: 1 | 2 | 3;
  language: InvitationLanguage;
};

export default function RsvpPanel({
  panel,
  sectionId,
  mockup,
  language,
}: Props) {
  const [selected, setSelected] = useState<"yes" | "no" | null>(null);
  const [plusOne, setPlusOne] = useState("");
  const text = getInviteText(language);

  const title = resolveLocalizedString(
    panel.content.title,
    language,
    INVITE_TEXT.lt.panels.rsvp.title,
    INVITE_TEXT.en.panels.rsvp.title
  );
  const subtitle = resolveLocalizedString(
    panel.content.subtitle,
    language,
    INVITE_TEXT.lt.panels.rsvp.subtitle,
    INVITE_TEXT.en.panels.rsvp.subtitle
  );
  const showTitle = hasVisibleText(title);
  const showSubtitle = hasVisibleText(subtitle);

  return (
    <PanelContainer panel={panel} sectionId={sectionId} mockup={mockup}>
      {showTitle ? (
        <h2 className="invite-section-title" style={{ color: getTextColor(panel.styles?.titleColor) }}>
          {title}
        </h2>
      ) : null}
      {showSubtitle ? (
        <p className="invite-description mt-4" style={{ color: getTextColor(panel.styles?.bodyColor) }}>
          {subtitle}
        </p>
      ) : null}

      <div className="mx-auto mt-10 grid max-w-text gap-4 md:grid-cols-2">
          <button
            type="button"
            onClick={() => setSelected("yes")}
            className={`invite-choice-btn ${
              selected === "yes"
                ? "invite-choice-btn-active"
                : ""
            }`}
          >
            {text.panels.rsvp.attending}
          </button>

          <button
            type="button"
            onClick={() => setSelected("no")}
            className={`invite-choice-btn ${
              selected === "no"
                ? "invite-choice-btn-active"
                : ""
            }`}
          >
            {text.panels.rsvp.notAttending}
          </button>
      </div>

      {selected === "yes" ? (
        <div className="invite-plus-one-wrap">
          <p className="invite-kicker" style={{ color: getTextColor(panel.styles?.bodyColor) }}>
            {text.panels.rsvp.plusOne}
          </p>
          <input
            type="text"
            value={plusOne}
            onChange={(e) => setPlusOne(e.target.value)}
            placeholder={text.panels.rsvp.plusOnePlaceholder}
            className="invite-plus-one-input"
          />
        </div>
      ) : null}
    </PanelContainer>
  );
}
