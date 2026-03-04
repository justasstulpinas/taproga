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
  event: any;
  sectionId?: string;
  mockup: 1 | 2 | 3;
  language: InvitationLanguage;
};

function formatWeddingDate(value: string | null | undefined): string | null {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear());
  return `${day} . ${month} . ${year}`;
}

export default function WelcomePanel({
  panel,
  event,
  sectionId,
  mockup,
  language,
}: Props) {
  const title = resolveLocalizedString(
    panel.content.title,
    language,
    INVITE_TEXT.lt.panels.welcome.title,
    INVITE_TEXT.en.panels.welcome.title
  );
  const names = resolveLocalizedString(
    panel.content.names,
    language,
    INVITE_TEXT.lt.panels.welcome.names,
    INVITE_TEXT.en.panels.welcome.names
  );
  const subtitle = resolveLocalizedString(
    panel.content.subtitle,
    language,
    INVITE_TEXT.lt.panels.welcome.subtitle,
    INVITE_TEXT.en.panels.welcome.subtitle
  );
  const dateLabel = formatWeddingDate(
    (panel.content.date as string | undefined) ??
      (event?.event_date as string | undefined) ??
      (event?.wedding_date as string | undefined)
  );
  const showNames = hasVisibleText(names);
  const showTitle = hasVisibleText(title);
  const showSubtitle = hasVisibleText(subtitle);

  return (
    <PanelContainer panel={panel} sectionId={sectionId} mockup={mockup}>
      {showNames ? (
        <p
          className="invite-names-display mt-6"
          style={{ color: getTextColor(panel.styles?.titleColor) }}
        >
          {names}
        </p>
      ) : null}
      {dateLabel ? (
        <p
          className="invite-home-date"
          style={{ color: getTextColor(panel.styles?.titleColor) }}
        >
          {dateLabel}
        </p>
      ) : null}
      {showTitle ? (
        <h2
          className="invite-section-title mt-8"
          style={{ color: getTextColor(panel.styles?.titleColor) }}
        >
          {title}
        </h2>
      ) : null}
      {showSubtitle ? (
        <p
          className="invite-description mt-8"
          style={{ color: getTextColor(panel.styles?.bodyColor) }}
        >
          {subtitle}
        </p>
      ) : null}
    </PanelContainer>
  );
}
