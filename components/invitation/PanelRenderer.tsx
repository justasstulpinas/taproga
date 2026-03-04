import type { PanelInstance } from "@/lib/panels/panel.types";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  getInviteText,
  type InvitationLanguage,
} from "./invitation.i18n";
import WelcomePanel from "./panels/WelcomePanel";
import InfoPanel from "./panels/InfoPanel";
import CountdownPanel from "./panels/CountdownPanel";
import LocationPanel from "./panels/LocationPanel";
import SchedulePanel from "./panels/SchedulePanel";
import DressCodePanel from "./panels/DressCodePanel";
import AdditionalInfoPanel from "./panels/AdditionalInfoPanel";
import RsvpPanel from "./panels/RsvpPanel";
import MenuPanel from "./panels/MenuPanel";
import TextBlockPanel from "./panels/TextBlockPanel";

type Props = {
  panels: PanelInstance[];
  event: any;
  embedded?: boolean;
  onActivePanelChange?: (panelId: string) => void;
  language?: InvitationLanguage;
};

export default function PanelRenderer({
  panels,
  event,
  embedded = false,
  onActivePanelChange,
  language,
}: Props) {
  const [mockup, setMockup] = useState<1 | 2 | 3>(1);
  const [internalLanguage, setInternalLanguage] =
    useState<InvitationLanguage>("lt");
  const [navTone, setNavTone] = useState<"light" | "dark">("light");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const activePanelRef = useRef<string | null>(null);
  const activeLanguage = language ?? internalLanguage;
  const text = getInviteText(activeLanguage);

  const ordered = [...panels]
    .filter((p) => p.enabled)
    .sort((a, b) => a.order - b.order);

  const sectionIds = useMemo(() => {
    const map = new Map<string, string>();
    for (const panel of ordered) {
      map.set(panel.id, `invite-panel-${panel.id}`);
    }
    return map;
  }, [ordered]);

  const navTargets = useMemo(() => {
    const navItems: Array<{ type: PanelInstance["type"]; label: string }> = [
      { type: "welcome", label: text.nav.home },
      { type: "schedule", label: text.nav.schedule },
      { type: "location", label: text.nav.location },
      { type: "countdown", label: text.nav.countdown },
      { type: "rsvp", label: text.nav.rsvp },
      { type: "menu", label: text.nav.menu },
    ];

    const targets = navItems.map((item) => {
      const panel = ordered.find((entry) => entry.type === item.type);
      return {
        type: item.type,
        label: item.label,
        sectionId: panel ? sectionIds.get(panel.id) : undefined,
      };
    });

    return {
      left: targets.slice(0, 3),
      right: targets.slice(3, 6),
    };
  }, [ordered, sectionIds, text]);

  const coupleTitle =
    typeof event?.title === "string" && event.title.trim()
      ? event.title.trim().toUpperCase()
      : text.common.invitation.toUpperCase();

  useEffect(() => {
    if (language) return;

    try {
      const stored = window.localStorage.getItem("invite_language");
      if (stored === "lt" || stored === "en") {
        setInternalLanguage(stored);
        return;
      }
    } catch {
      // Ignore storage errors and continue with language fallback.
    }

    if (navigator.language.toLowerCase().startsWith("lt")) {
      setInternalLanguage("lt");
    } else {
      setInternalLanguage("en");
    }
  }, [language]);

  useEffect(() => {
    if (language) return;

    try {
      window.localStorage.setItem("invite_language", internalLanguage);
    } catch {
      // Ignore storage errors.
    }
  }, [internalLanguage, language]);

  const rendererClass = [
    "invite-scroll-root",
    embedded ? "invite-scroll-embedded" : "invite-scroll-full",
    mockup === 2 ? "invite-theme-mockup2" : "",
    mockup === 3 ? "invite-theme-mockup3" : "",
  ]
    .filter(Boolean)
    .join(" ");

  useEffect(() => {
    const scrollRoot = containerRef.current;
    if (!scrollRoot) return;
    const rootEl: HTMLDivElement = scrollRoot;

    const sections = Array.from(
      rootEl.querySelectorAll<HTMLElement>(".invite-panel")
    );
    if (sections.length === 0) return;

    function updateToneFromScroll() {
      const focusPoint = rootEl.scrollTop + rootEl.clientHeight * 0.32;
      let closest: HTMLElement | null = null;
      let minDistance = Number.POSITIVE_INFINITY;

      for (const section of sections) {
        const top = section.offsetTop;
        const center = top + section.offsetHeight / 2;
        const distance = Math.abs(center - focusPoint);

        if (distance < minDistance) {
          minDistance = distance;
          closest = section;
        }
      }

      if (!closest) return;
      const tone = closest.dataset.navTone === "dark" ? "dark" : "light";
      setNavTone(tone);

      if (onActivePanelChange && closest.id.startsWith("invite-panel-")) {
        const panelId = closest.id.slice("invite-panel-".length);
        if (panelId && activePanelRef.current !== panelId) {
          activePanelRef.current = panelId;
          onActivePanelChange(panelId);
        }
      }
    }

    updateToneFromScroll();

    let raf = 0;
    function onScroll() {
      if (raf) {
        window.cancelAnimationFrame(raf);
      }
      raf = window.requestAnimationFrame(updateToneFromScroll);
    }

    rootEl.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    return () => {
      rootEl.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) {
        window.cancelAnimationFrame(raf);
      }
    };
  }, [ordered, mockup, embedded, onActivePanelChange]);

  function scrollToSection(sectionId?: string) {
    if (!sectionId) return;
    const section = document.getElementById(sectionId);
    if (!section) return;
    section.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  return (
    <div ref={containerRef} className={rendererClass}>
      <header
        className={`invite-topbar ${embedded ? "invite-topbar-embedded" : ""} ${
          navTone === "dark" ? "invite-topbar-tone-dark" : "invite-topbar-tone-light"
        }`}
      >
        <div className="invite-topbar-main">
          <nav className="invite-nav invite-nav-left">
            {navTargets.left.map((item) => (
              <button
                key={item.type}
                type="button"
                onClick={() => scrollToSection(item.sectionId)}
                disabled={!item.sectionId}
                className="invite-nav-item"
              >
                {item.label}
              </button>
            ))}
          </nav>

          <p className="invite-couple-name">{coupleTitle}</p>

          <nav className="invite-nav invite-nav-right">
            {navTargets.right.map((item) => (
              <button
                key={item.type}
                type="button"
                onClick={() => scrollToSection(item.sectionId)}
                disabled={!item.sectionId}
                className="invite-nav-item"
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="invite-topbar-actions">
          {!embedded && !language ? (
            <div
              className="invite-lang-switch"
              role="group"
              aria-label={text.common.languageAria}
            >
              <button
                type="button"
                onClick={() => setInternalLanguage("lt")}
                className={`invite-lang-btn ${
                  activeLanguage === "lt" ? "invite-lang-btn-active" : ""
                }`}
              >
                LT
              </button>
              <button
                type="button"
                onClick={() => setInternalLanguage("en")}
                className={`invite-lang-btn ${
                  activeLanguage === "en" ? "invite-lang-btn-active" : ""
                }`}
              >
                EN
              </button>
            </div>
          ) : null}

          {!embedded ? (
            <div className="invite-mockup-switch" role="tablist" aria-label="Mockup variants">
              {[1, 2, 3].map((variant) => (
                <button
                  key={variant}
                  type="button"
                  role="tab"
                  aria-selected={mockup === variant}
                  onClick={() => setMockup(variant as 1 | 2 | 3)}
                  className={`invite-mockup-btn ${mockup === variant ? "invite-mockup-btn-active" : ""}`}
                >
                  {`${text.common.mockup} ${variant}`}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </header>

      {ordered.map((panel) => {
        const sectionId = sectionIds.get(panel.id);

        switch (panel.type) {
          case "welcome":
            return (
              <WelcomePanel
                key={panel.id}
                panel={panel}
                event={event}
                sectionId={sectionId}
                mockup={mockup}
                language={activeLanguage}
              />
            );
          case "info":
            return (
              <InfoPanel
                key={panel.id}
                panel={panel}
                sectionId={sectionId}
                mockup={mockup}
                language={activeLanguage}
              />
            );
          case "countdown":
            return (
              <CountdownPanel
                key={panel.id}
                panel={panel}
                event={event}
                sectionId={sectionId}
                mockup={mockup}
                language={activeLanguage}
              />
            );
          case "location":
            return (
              <LocationPanel
                key={panel.id}
                panel={panel}
                event={event}
                sectionId={sectionId}
                mockup={mockup}
                language={activeLanguage}
              />
            );
          case "schedule":
            return (
              <SchedulePanel
                key={panel.id}
                panel={panel}
                event={event}
                sectionId={sectionId}
                mockup={mockup}
                language={activeLanguage}
              />
            );
          case "dress-code":
            return null;
          case "additional-info":
            return (
              <AdditionalInfoPanel
                key={panel.id}
                panel={panel}
                sectionId={sectionId}
                mockup={mockup}
                language={activeLanguage}
              />
            );
          case "rsvp":
            return (
              <RsvpPanel
                key={panel.id}
                panel={panel}
                event={event}
                sectionId={sectionId}
                mockup={mockup}
                language={activeLanguage}
              />
            );
          case "menu":
            return (
              <MenuPanel
                key={panel.id}
                panel={panel}
                event={event}
                sectionId={sectionId}
                mockup={mockup}
                language={activeLanguage}
              />
            );
          case "text-block":
            return (
              <TextBlockPanel
                key={panel.id}
                panel={panel}
                sectionId={sectionId}
                mockup={mockup}
                language={activeLanguage}
              />
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
