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

type AdditionalInfoCard = {
  text: string;
  imageUrl?: string;
};

export default function AdditionalInfoPanel({
  panel,
  sectionId,
  mockup,
  language,
}: Props) {
  const panelTitle = resolveLocalizedString(
    panel.content.title,
    language,
    INVITE_TEXT.lt.panels.additionalInfo.title,
    INVITE_TEXT.en.panels.additionalInfo.title
  );
  const fallbackTitles =
    language === "lt"
      ? [INVITE_TEXT.lt.panels.additionalInfo.leftTitle, INVITE_TEXT.lt.panels.additionalInfo.rightTitle]
      : [INVITE_TEXT.en.panels.additionalInfo.leftTitle, INVITE_TEXT.en.panels.additionalInfo.rightTitle];
  const fallbackImages = [
    "https://images.unsplash.com/photo-1525258946800-98cfd641d0de?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1522673607200-164d1b6ce486?auto=format&fit=crop&w=900&q=80",
  ];
  const entries = Array.isArray(panel.content.entries)
    ? (panel.content.entries as Array<Record<string, unknown>>)
        .map((entry, index): AdditionalInfoCard => ({
          text: resolveLocalizedString(
            entry.title,
            language,
            fallbackTitles[Math.min(index, fallbackTitles.length - 1)],
            fallbackTitles[Math.min(index, fallbackTitles.length - 1)]
          ),
          imageUrl:
            typeof entry.imageUrl === "string" && entry.imageUrl.trim().length > 0
              ? entry.imageUrl
              : fallbackImages[index % fallbackImages.length],
        }))
        .filter((entry) => hasVisibleText(entry.text) || hasVisibleText(entry.imageUrl))
    : [
        {
          text: resolveLocalizedString(
            panel.content.leftTitle ?? panel.content.title,
            language,
            fallbackTitles[0],
            fallbackTitles[0]
          ),
          imageUrl:
            (typeof panel.content.leftImageUrl === "string" &&
            panel.content.leftImageUrl.trim().length > 0
              ? panel.content.leftImageUrl
              : undefined) ?? fallbackImages[0],
        },
        {
          text: resolveLocalizedString(
            panel.content.rightTitle,
            language,
            fallbackTitles[1],
            fallbackTitles[1]
          ),
          imageUrl:
            (typeof panel.content.rightImageUrl === "string" &&
            panel.content.rightImageUrl.trim().length > 0
              ? panel.content.rightImageUrl
              : undefined) ?? fallbackImages[1],
        },
      ];
  return (
    <PanelContainer panel={panel} sectionId={sectionId} mockup={mockup}>
      {hasVisibleText(panelTitle) ? (
        <h2
          className="invite-section-title invite-extra-panel-title"
          style={{ color: getTextColor(panel.styles?.titleColor) }}
        >
          {panelTitle}
        </h2>
      ) : null}

      <div className="invite-extra-grid">
        {entries.map((entry, index) => (
          <article key={`${entry.text}-${index}`} className="invite-extra-card">
            <img
              src={entry.imageUrl ?? fallbackImages[index % fallbackImages.length]}
              alt={entry.text || `Info ${index + 1}`}
              className="invite-extra-card-image"
            />
            {hasVisibleText(entry.text) ? (
              <p
                className="invite-extra-card-body"
                style={{ color: getTextColor(panel.styles?.bodyColor) }}
              >
                {entry.text}
              </p>
            ) : null}
          </article>
        ))}
      </div>
    </PanelContainer>
  );
}
