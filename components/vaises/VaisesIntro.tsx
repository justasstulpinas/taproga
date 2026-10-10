import { useEffect, useRef, type CSSProperties } from "react";

export type VaisesIntroPhase = "photo" | "menu" | "flying" | "revealing" | "done";

// The photo fades in alone first; the bar and menu follow after this delay.
const MENU_DELAY_MS = 900;
const FLIGHT_MS = 700;
// Must match the .vaises-intro-phase-revealing .vaises-intro-menu opacity transition.
const REVEAL_MS = 300;
const FLIGHT_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
// The menu items fly onto these, matched by index, so both lists must share the same order.
const TOPBAR_NAV_LINK_SELECTOR = ".kvieciam-topbar-nav .kvieciam-topbar-link";

type Props<Id extends string> = {
  phase: VaisesIntroPhase;
  onPhaseChange: (phase: VaisesIntroPhase) => void;
  /** CSS background-image value for the full-screen photo. */
  backgroundImage: string;
  items: ReadonlyArray<{ id: Id; label: string }>;
  /** Called on click, while the photo still fully covers the page; it fades out right after. */
  onChoose: (id: Id) => void;
  /** Called once the menu has reached the top bar. */
  onLanded: (id: Id) => void;
};

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Moves and scales `from` so it sits exactly over `to`. */
function flightTransform(from: DOMRect, to: DOMRect): string {
  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  return `translate(${dx}px, ${dy}px) scale(${to.width / from.width})`;
}

export default function VaisesIntro<Id extends string>({
  phase,
  onPhaseChange,
  backgroundImage,
  items,
  onChoose,
  onLanded,
}: Props<Id>) {
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (phase !== "photo") return;
    const delay = prefersReducedMotion() ? 0 : MENU_DELAY_MS;
    const timer = window.setTimeout(() => onPhaseChange("menu"), delay);
    return () => window.clearTimeout(timer);
  }, [phase, onPhaseChange]);

  useEffect(() => {
    if (phase !== "revealing") return;
    const delay = prefersReducedMotion() ? 0 : REVEAL_MS;
    const timer = window.setTimeout(() => onPhaseChange("done"), delay);
    return () => window.clearTimeout(timer);
  }, [phase, onPhaseChange]);

  // The photo crossfades into the chosen panel during the flight, so by landing the panel is
  // already in view and only its detail is left to slide in.
  const choose = async (id: Id) => {
    if (phase !== "menu") return;
    onChoose(id);
    if (prefersReducedMotion()) {
      onLanded(id);
      onPhaseChange("done");
      return;
    }
    onPhaseChange("flying");
    const targets = document.querySelectorAll<HTMLElement>(TOPBAR_NAV_LINK_SELECTOR);
    const flights = items.map((_, index) => {
      const item = itemRefs.current[index];
      const target = targets[index];
      if (!item || !target) return null;
      const to = flightTransform(item.getBoundingClientRect(), target.getBoundingClientRect());
      return item.animate([{ transform: "none" }, { transform: to }], {
        duration: FLIGHT_MS,
        easing: FLIGHT_EASING,
        fill: "forwards",
      }).finished;
    });
    await Promise.all(flights);
    onLanded(id);
    onPhaseChange("revealing");
  };

  if (phase === "done") return null;

  return (
    <div className={`vaises-intro vaises-intro-phase-${phase}`}>
      <div className="vaises-intro-scene" aria-hidden="true">
        <div
          className="vaises-intro-photo"
          style={{ backgroundImage }}
        />
      </div>
      {phase !== "photo" && (
        <nav className="vaises-intro-menu" aria-label="Skiltys">
          {items.map((item, index) => (
            <button
              key={item.id}
              ref={(element) => {
                itemRefs.current[index] = element;
              }}
              type="button"
              className="vaises-intro-link"
              style={{ "--vaises-intro-index": index } as CSSProperties}
              onClick={() => void choose(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
