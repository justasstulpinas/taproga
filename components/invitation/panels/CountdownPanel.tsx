import { useEffect, useState } from "react";
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

type CountdownState = {
  days: string;
  hours: string;
  minutes: string;
  seconds: string;
};

function pad(value: number) {
  return String(Math.max(0, value)).padStart(2, "0");
}

export default function CountdownPanel({
  panel,
  event,
  sectionId,
  mockup,
  language,
}: Props) {
  const [countdown, setCountdown] = useState<CountdownState>({
    days: "--",
    hours: "--",
    minutes: "--",
    seconds: "--",
  });

  const target = panel.content.date ?? panel.content.targetDate ?? event?.event_date;

  useEffect(() => {
    if (!target) return;

    const targetMs = new Date(target).getTime();
    if (Number.isNaN(targetMs)) return;

    function tick() {
      const diff = targetMs - Date.now();
      const totalSeconds = Math.max(0, Math.floor(diff / 1000));
      const days = Math.floor(totalSeconds / 86400);
      const hours = Math.floor((totalSeconds % 86400) / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;

      setCountdown({
        days: pad(days),
        hours: pad(hours),
        minutes: pad(minutes),
        seconds: pad(seconds),
      });
    }

    tick();
    const timer = window.setInterval(tick, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [target]);

  const text = getInviteText(language);
  const title = resolveLocalizedString(
    panel.content.title,
    language,
    INVITE_TEXT.lt.panels.countdown.title,
    INVITE_TEXT.en.panels.countdown.title
  );
  const kicker = resolveLocalizedString(
    panel.content.kicker,
    language,
    INVITE_TEXT.lt.panels.countdown.kicker,
    INVITE_TEXT.en.panels.countdown.kicker
  );
  const subtitle = resolveLocalizedString(
    panel.content.subtitle,
    language,
    INVITE_TEXT.lt.panels.countdown.subtitle,
    INVITE_TEXT.en.panels.countdown.subtitle
  );
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
        <h2
          className="invite-section-title mt-4"
          style={{ color: getTextColor(panel.styles?.titleColor) }}
        >
          {title}
        </h2>
      ) : null}

      <div className="invite-countdown-grid mt-10">
        {[
          { label: text.panels.countdown.days, value: countdown.days },
          { label: text.panels.countdown.hours, value: countdown.hours },
          { label: text.panels.countdown.minutes, value: countdown.minutes },
          { label: text.panels.countdown.seconds, value: countdown.seconds },
        ].map((item) => (
          <div key={item.label} className="invite-countdown-item">
            <p
              className="invite-countdown-value"
              style={{ color: getTextColor(panel.styles?.titleColor) }}
            >
              {item.value}
            </p>
            <p
              className="invite-countdown-label"
              style={{ color: getTextColor(panel.styles?.bodyColor) }}
            >
              {item.label}
            </p>
          </div>
        ))}
      </div>

      {showSubtitle ? (
        <p
          className="invite-description mt-10"
          style={{ color: getTextColor(panel.styles?.bodyColor) }}
        >
          {subtitle}
        </p>
      ) : null}
    </PanelContainer>
  );
}
