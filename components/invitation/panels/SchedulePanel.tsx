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

type ScheduleItem = {
  time: string;
  label: string;
};

export default function SchedulePanel({
  panel,
  sectionId,
  mockup,
  language,
}: Props) {
  const text = getInviteText(language);
  const title = resolveLocalizedString(
    panel.content.title,
    language,
    INVITE_TEXT.lt.panels.schedule.title,
    INVITE_TEXT.en.panels.schedule.title
  );
  const kicker = resolveLocalizedString(
    panel.content.kicker,
    language,
    INVITE_TEXT.lt.panels.schedule.kicker,
    INVITE_TEXT.en.panels.schedule.kicker
  );
  const subtitle = resolveLocalizedString(
    panel.content.subtitle,
    language,
    INVITE_TEXT.lt.panels.schedule.subtitle,
    INVITE_TEXT.en.panels.schedule.subtitle
  );
  const items = Array.isArray(panel.content.items)
    ? (panel.content.items as ScheduleItem[]).map((item, index) => {
        const ltLabels = [
          INVITE_TEXT.lt.panels.schedule.item1,
          INVITE_TEXT.lt.panels.schedule.item2,
          INVITE_TEXT.lt.panels.schedule.item3,
        ];
        const enLabels = [
          INVITE_TEXT.en.panels.schedule.item1,
          INVITE_TEXT.en.panels.schedule.item2,
          INVITE_TEXT.en.panels.schedule.item3,
        ];
        const label = resolveLocalizedString(
          item.label,
          language,
          ltLabels[index] ?? item.label,
          enLabels[index] ?? item.label
        );
        return { ...item, label };
      })
    : [
        { time: "16:00", label: text.panels.schedule.item1 },
        { time: "18:00", label: text.panels.schedule.item2 },
        { time: "22:00", label: text.panels.schedule.item3 },
      ];
  const showKicker = hasVisibleText(kicker);
  const showTitle = hasVisibleText(title);
  const showSubtitle = hasVisibleText(subtitle);

  return (
    <PanelContainer panel={panel} sectionId={sectionId} mockup={mockup}>
      {showKicker ? (
        <p className="invite-kicker" style={{ color: getTextColor(panel.styles?.bodyColor) }}>
          {kicker}
        </p>
      ) : null}
      {showTitle ? (
        <h2 className="invite-section-title mt-4" style={{ color: getTextColor(panel.styles?.titleColor) }}>
          {title}
        </h2>
      ) : null}
      {showSubtitle ? (
        <p className="invite-description mt-8" style={{ color: getTextColor(panel.styles?.bodyColor) }}>
          {subtitle}
        </p>
      ) : null}

      <div className="invite-schedule-grid mt-10">
          {items.map((item, index) => (
            <div key={`${item.time}-${index}`} className="invite-schedule-item">
              <p
                className="invite-schedule-time"
                style={{ color: getTextColor(panel.styles?.titleColor) }}
              >
                {item.time}
              </p>
              <p className="invite-schedule-label mt-4" style={{ color: getTextColor(panel.styles?.bodyColor) }}>
                {item.label}
              </p>
            </div>
          ))}
      </div>
    </PanelContainer>
  );
}
