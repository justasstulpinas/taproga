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

export default function MenuPanel({ panel, sectionId, mockup, language }: Props) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const text = getInviteText(language);
  const title = resolveLocalizedString(
    panel.content.title,
    language,
    INVITE_TEXT.lt.panels.menu.title,
    INVITE_TEXT.en.panels.menu.title
  );
  const options = Array.isArray(panel.content.options)
    ? (panel.content.options as string[]).map((option, index) => {
        const ltOptions = [
          INVITE_TEXT.lt.panels.menu.option1,
          INVITE_TEXT.lt.panels.menu.option2,
          INVITE_TEXT.lt.panels.menu.option3,
        ];
        const enOptions = [
          INVITE_TEXT.en.panels.menu.option1,
          INVITE_TEXT.en.panels.menu.option2,
          INVITE_TEXT.en.panels.menu.option3,
        ];
        return resolveLocalizedString(
          option,
          language,
          ltOptions[index] ?? option,
          enOptions[index] ?? option
        );
      })
    : [
        text.panels.menu.option1,
        text.panels.menu.option2,
        text.panels.menu.option3,
      ];
  const visibleOptions = options.filter((option) => hasVisibleText(option));
  const showTitle = hasVisibleText(title);

  return (
    <PanelContainer panel={panel} sectionId={sectionId} mockup={mockup}>
      {showTitle ? (
        <h2 className="invite-section-title" style={{ color: getTextColor(panel.styles?.titleColor) }}>
          {title}
        </h2>
      ) : null}

      <div className="invite-menu-grid mt-10">
          {visibleOptions.map((option, index) => {
            const selected = selectedOption === option;
            return (
              <button
                key={`${option}-${index}`}
                type="button"
                onClick={() => setSelectedOption(option)}
                className={`invite-menu-card ${selected ? "invite-menu-card-selected" : ""}`}
              >
                <p
                  className="invite-menu-label"
                  style={{ color: selected ? "#FFFFFF" : getTextColor(panel.styles?.bodyColor) }}
                >
                  {option}
                </p>
              </button>
            );
          })}
      </div>
    </PanelContainer>
  );
}
