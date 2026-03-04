import type { PanelInstance } from "@/lib/panels/panel.types";
import {
  INVITE_TEXT,
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

export default function DressCodePanel({
  panel,
  sectionId,
  mockup,
  language,
}: Props) {
  const title = resolveLocalizedString(
    panel.content.title,
    language,
    INVITE_TEXT.lt.panels.dressCode.title,
    INVITE_TEXT.en.panels.dressCode.title
  );
  const body = resolveLocalizedString(
    panel.content.body,
    language,
    INVITE_TEXT.lt.panels.dressCode.body,
    INVITE_TEXT.en.panels.dressCode.body
  );
  const showTitle = hasVisibleText(title);
  const showBody = hasVisibleText(body);

  return (
    <PanelContainer panel={panel} sectionId={sectionId} mockup={mockup}>
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
