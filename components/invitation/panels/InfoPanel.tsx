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
  sectionId?: string;
  mockup: 1 | 2 | 3;
  language: InvitationLanguage;
};

export default function InfoPanel({ panel, sectionId, mockup, language }: Props) {
  const text = getInviteText(language);
  const title = resolveLocalizedString(
    panel.content.title,
    language,
    INVITE_TEXT.lt.panels.info.title,
    INVITE_TEXT.en.panels.info.title
  );
  const body = resolveLocalizedString(
    panel.content.body,
    language,
    INVITE_TEXT.lt.panels.info.body,
    INVITE_TEXT.en.panels.info.body
  );
  const showTitle = hasVisibleText(title);
  const showBody = hasVisibleText(body);

  return (
    <PanelContainer panel={panel} sectionId={sectionId} mockup={mockup}>
      <p className="invite-kicker" style={{ color: getTextColor(panel.styles?.bodyColor) }}>
        {text.panels.info.kicker}
      </p>
      {showTitle ? (
        <h2 className="invite-section-title mt-4" style={{ color: getTextColor(panel.styles?.titleColor) }}>
          {title}
        </h2>
      ) : null}
      {showBody ? (
        <p className="invite-description mt-8" style={{ color: getTextColor(panel.styles?.bodyColor) }}>
          {body}
        </p>
      ) : null}
    </PanelContainer>
  );
}
