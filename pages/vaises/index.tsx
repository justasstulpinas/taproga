import Head from "next/head";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import KvieciamTopBar from "../../components/home/KvieciamTopBar";
import ConsultationPanel from "../../components/vaises/ConsultationPanel";
import DateInquiryPanel from "../../components/vaises/DateInquiryPanel";
import VaisesIntro, { type VaisesIntroPhase } from "../../components/vaises/VaisesIntro";
import { useTopOverscrollPull } from "../../components/vaises/useTopOverscrollPull";
import {
  vaisesPhotoAvifUrl,
  vaisesPhotoBackground,
  type VaisesPhoto,
} from "@/lib/vaises/photos";

const PANEL_IDS = [
  "misija",
  "uzkandziai",
  "renginiai",
  "vestuves",
  "komanda",
] as const;

type PanelId = (typeof PANEL_IDS)[number];

type VaisesPanel = {
  id: PanelId;
  /** Sentence-case name for headings and screen readers; `title` is the display caps. */
  name: string;
  sectionLabel: string;
  title: string;
  photo: VaisesPhoto;
  detailTitle: string;
  detailText: string;
  detailCtaLabel: string;
  detailCta: "date-inquiry" | "consultation";
};

const PANELS: VaisesPanel[] = [
  {
    id: "misija",
    name: "Misija",
    sectionLabel: "mūsų",
    title: "MISIJA",
    photo: "misija",
    detailTitle: "Mes mylime naujas patirtis!",
    detailText:
      "Ši meilė jau vedė mus per cechus, fabrikus, laukus ir visas erdves, kuriose kažkam kilo idėja: „Švęsime čia!“. Degame noru išgirsti jūsų sumanymą ir padėti jam realizuotis.",
    detailCtaLabel: "Susisiekti dėl konsultacijos",
    detailCta: "consultation",
  },
  {
    id: "uzkandziai",
    name: "Užkandžiai",
    sectionLabel: "išskirtiniai",
    title: "UŽKANDŽIAI",
    photo: "uzkandziai",
    detailTitle: "Nuo pasitikimo iki vėlyvos nakties",
    detailText:
      "Mėgstame juokauti, jog ",
    detailCtaLabel: "Susisiekti dėl konsultacijos",
    detailCta: "consultation",
  },
  {
    id: "renginiai",
    name: "Renginiai",
    sectionLabel: "privatūs ir verslo",
    title: "RENGINIAI",
    photo: "renginiai",
    detailTitle: "Šventė, kuri kalba jūsų kalba",
    detailText:
      "Gimtadieniai, jubiliejai, įmonių vakarai ir susitikimai. Pritaikome meniu, aptarnavimą ir tempą prie jūsų progos bei erdvės.",
    detailCtaLabel: "Susisiekti dėl konsultacijos",
    detailCta: "consultation",
  },
  {
    id: "vestuves",
    name: "Vestuvės",
    sectionLabel: "jūsų",
    title: "VESTUVĖS",
    photo: "vestuves",
    detailTitle: "Ar atsimeni mūsų vestuvių vakarienę?",
    detailText:
      "Mūsų tikslas, kad šio klausimo vienas kito klaustumėte, prisiminę savo šventę. Kuriame patirtį, kuri išliks tiek jūsų, tiek svečių atmintyje.",
    detailCtaLabel: "Teirautis dėl datos",
    detailCta: "date-inquiry",
  },
  {
    id: "komanda",
    name: "Komanda",
    sectionLabel: "mūsų",
    title: "KOMANDA",
    photo: "komanda",
    detailTitle: "Pradėkime planuoti",
    detailText:
      "Pasidalinkite data, lokacija ir svečių skaičiumi. Sudėsime aiškų pirmą planą ir padėsime judėti toliau žingsnis po žingsnio.",
    detailCtaLabel: "Pradėti dabar",
    detailCta: "consultation",
  },
];

// Each half of a top-bar navigation (fade in, fade out); must match the .vaises-nav-cover animations.
const NAV_COVER_MS = 450;

// Its own photo, not a panel's, so choosing any section visibly crossfades into that panel.
const INTRO_PHOTO: VaisesPhoto = "landing";

// Share of a panel that must be on screen before its title fades in.
const TITLE_REVEAL_RATIO = 0.5;

const VAISES_NAV_ITEMS = PANELS.map((panel) => ({ id: panel.id, label: panel.name }));

type NavCover = { panelId: PanelId; phase: "in" | "out" };

function isPanelId(sectionId: string): sectionId is PanelId {
  return (PANEL_IDS as readonly string[]).includes(sectionId);
}

export default function VaisesPage() {
  const [topbarHeight, setTopbarHeight] = useState(56);
  const scrollRootRef = useRef<HTMLElement>(null);
  useTopOverscrollPull(scrollRootRef);
  const [activePanelId, setActivePanelId] = useState<PanelId | null>(null);
  // The panel mostly on screen, which can differ from the open one once the visitor scrolls on.
  const [inViewPanelId, setInViewPanelId] = useState<PanelId | null>(null);
  // The left side panel (calendar or consultation) of the active entry.
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [introPhase, setIntroPhase] = useState<VaisesIntroPhase>("photo");
  const [navCover, setNavCover] = useState<NavCover | null>(null);
  // Where keyboard focus goes once a close has re-rendered (the target may still be hidden or
  // inert until then), so it never falls back to <body>.
  const pendingFocusRef = useRef<HTMLElement | null>(null);

  const openPanel = useCallback((panelId: PanelId | null) => {
    setActivePanelId(panelId);
    setSidePanelOpen(false);
  }, []);

  const closePanel = useCallback((panelId: PanelId) => {
    pendingFocusRef.current = document.querySelector<HTMLElement>(`#${panelId} .vaises-entry-media`);
    openPanel(null);
  }, [openPanel]);

  const closeSidePanel = useCallback((panelId: PanelId) => {
    pendingFocusRef.current = document.querySelector<HTMLElement>(`#${panelId} .vaises-entry-detail-cta`);
    setSidePanelOpen(false);
  }, []);

  useEffect(() => {
    const target = pendingFocusRef.current;
    if (!target) return;
    pendingFocusRef.current = null;
    target.focus({ preventScroll: true });
  }, [activePanelId, sidePanelOpen]);

  const panelOffset = useCallback((panelId: PanelId): number | null => {
    const root = scrollRootRef.current;
    const target = document.getElementById(panelId);
    if (!root || !target) return null;
    return target.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop;
  }, []);

  // Only ever runs under a full-screen photo (intro or nav cover), so the jump is never seen.
  const jumpToPanel = useCallback((panelId: PanelId) => {
    const top = panelOffset(panelId);
    if (top === null) return;
    scrollRootRef.current?.scrollTo({ top, behavior: "instant" });
  }, [panelOffset]);

  // Instead of smooth-scrolling past every panel in between, the target photo fades in over
  // the current one, the page jumps underneath, then the cover fades out as the panel opens.
  const scrollToPanel = useCallback((sectionId: string) => {
    if (!isPanelId(sectionId)) return;
    const top = panelOffset(sectionId);
    const alreadyInView =
      top !== null && Math.abs(top - (scrollRootRef.current?.scrollTop ?? 0)) < 1;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (alreadyInView || reducedMotion) {
      jumpToPanel(sectionId);
      openPanel(sectionId);
      return;
    }
    setNavCover({ panelId: sectionId, phase: "in" });
  }, [jumpToPanel, openPanel, panelOffset]);

  useEffect(() => {
    if (!navCover) return;
    const timer = window.setTimeout(() => {
      if (navCover.phase === "out") {
        setNavCover(null);
        return;
      }
      jumpToPanel(navCover.panelId);
      openPanel(navCover.panelId);
      setNavCover({ panelId: navCover.panelId, phase: "out" });
    }, NAV_COVER_MS);
    return () => window.clearTimeout(timer);
  }, [navCover, jumpToPanel, openPanel]);

  // A panel's title only appears once it is mostly scrolled into view. A nav jump opens the
  // panel in the same frame it arrives, so its title never flashes before the detail slides in.
  // The reveal is a data attribute, not React state, so scrolling doesn't re-render the page;
  // only crossing into a different panel does, to move the top bar's current-section marker.
  useEffect(() => {
    const root = scrollRootRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const revealed = entry.intersectionRatio >= TITLE_REVEAL_RATIO;
          const section = entry.target as HTMLElement;
          section.dataset.revealed = String(revealed);
          if (revealed && isPanelId(section.id)) setInViewPanelId(section.id);
        }
      },
      { root, threshold: [0, TITLE_REVEAL_RATIO] },
    );
    root.querySelectorAll(".vaises-entry").forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  const navCoverPanel = navCover
    ? PANELS.find((panel) => panel.id === navCover.panelId)
    : undefined;

  // The reveal observer can fire between the jump and React committing the open panel, so
  // titles stay hidden for the whole transition instead of starting to fade in.
  const titlesSuppressed = introPhase !== "done" || navCover !== null;

  // The panels sit under the intro photo until a section is chosen, so their photos wait for
  // the menu (900ms in): on mobile networks they'd otherwise compete with the one photo on screen.
  const panelPhotosReady = introPhase !== "photo";

  const introLocked =
    introPhase === "photo" || introPhase === "menu" || introPhase === "flying";

  return (
    <main
      ref={scrollRootRef}
      lang="lt"
      className={`kvieciam-scroll-root kvieciam-scroll-overlay-topbar vaises-layout-root ${
        activePanelId ? "vaises-layout-open" : ""
      } ${activePanelId && sidePanelOpen ? "vaises-layout-side-open" : ""} ${introLocked ? "vaises-intro-locked" : ""} ${
        introPhase === "photo" ? "vaises-intro-bar-hidden" : ""
      } ${titlesSuppressed ? "vaises-titles-suppressed" : ""}`}
      style={{ "--kvieciam-topbar-h": `${topbarHeight}px` } as CSSProperties}
    >
      <Head>
        <title>Vaises | Ta proga</title>
        <link
          rel="preload"
          as="image"
          type="image/avif"
          href={vaisesPhotoAvifUrl(INTRO_PHOTO)}
          fetchPriority="high"
        />
      </Head>
      <h1 className="sr-only">Ta proga Vaises</h1>

      <KvieciamTopBar
        onNavigate={scrollToPanel}
        onHeightChange={setTopbarHeight}
        logoutRedirectPath="/vaises"
        showAuthActions={false}
        pageLabel="VAISES"
        tone="dark"
        navItems={VAISES_NAV_ITEMS}
        activeNavId={inViewPanelId ?? undefined}
      />

      <VaisesIntro
        phase={introPhase}
        onPhaseChange={setIntroPhase}
        backgroundImage={vaisesPhotoBackground(INTRO_PHOTO)}
        items={VAISES_NAV_ITEMS}
        onChoose={jumpToPanel}
        onLanded={openPanel}
      />

      {navCoverPanel && (
        <div
          className={`vaises-nav-cover vaises-nav-cover-${navCover?.phase}`}
          style={{ backgroundImage: vaisesPhotoBackground(navCoverPanel.photo) }}
          aria-hidden="true"
        />
      )}

      {/* Safari can still rubber-band past the first panel; this shows the photo there, not the page background. */}
      <div
        className="vaises-overscroll-backdrop"
        style={
          panelPhotosReady
            ? { backgroundImage: vaisesPhotoBackground(PANELS[0].photo) }
            : undefined
        }
        aria-hidden="true"
      />

      <div
        className={`vaises-stack ${
          activePanelId ? "vaises-stack-has-open" : ""
        }`}
      >
        {PANELS.map((panel) => {
          const isOpen = panel.id === activePanelId;
          const sidePanelId = `${panel.id}-side-panel`;
          const isSidePanelOpen = isOpen && sidePanelOpen;
          return (
            <section
              id={panel.id}
              key={panel.id}
              className={`vaises-entry ${isOpen ? "vaises-entry-open" : ""}`}
            >
              <h2 className="sr-only">{panel.name}</h2>
              <div
                className={`vaises-entry-shell ${
                  isOpen ? "vaises-entry-shell-open" : ""
                } ${isSidePanelOpen ? "vaises-entry-shell-side-open" : ""}`}
              >
                <button
                  type="button"
                  className="vaises-entry-media"
                  aria-expanded={isOpen}
                  aria-controls={`${panel.id}-detail`}
                  onClick={() => (isOpen ? closePanel(panel.id) : openPanel(panel.id))}
                >
                  <span
                    className="vaises-entry-bg"
                    style={
                      panelPhotosReady
                        ? { backgroundImage: vaisesPhotoBackground(panel.photo) }
                        : undefined
                    }
                    aria-hidden="true"
                  />
                  <span className="vaises-entry-tint" aria-hidden="true" />
                  {/* Only spans in here: a button may not contain block or heading elements, and
                      screen readers flatten its content anyway. The section heading is the h2 above. */}
                  <span className="vaises-entry-copy" aria-hidden="true">
                    <span className="vaises-entry-tag">{panel.sectionLabel}</span>
                    <span className="vaises-entry-title">{panel.title}</span>
                  </span>
                  <span className="sr-only">{panel.name}</span>
                </button>

                <article
                  id={`${panel.id}-detail`}
                  className="vaises-entry-detail"
                  inert={!isOpen}
                >
                  <div className="vaises-entry-detail-inner">
                    <p className="vaises-entry-detail-tag">{panel.name}</p>
                    <h3 className="vaises-entry-detail-title">
                      {panel.detailTitle}
                    </h3>
                    <p className="vaises-entry-detail-text">{panel.detailText}</p>
                    <div className="vaises-entry-detail-actions">
                      <button
                        type="button"
                        className="vaises-entry-detail-cta"
                        aria-expanded={isSidePanelOpen}
                        aria-controls={sidePanelId}
                        onClick={() => setSidePanelOpen(true)}
                      >
                        {panel.detailCtaLabel}
                      </button>
                      <button
                        type="button"
                        className="vaises-entry-detail-close"
                        onClick={() => closePanel(panel.id)}
                      >
                        Uždaryti
                      </button>
                    </div>
                  </div>
                </article>

                {panel.detailCta === "date-inquiry" ? (
                  <DateInquiryPanel
                    id={sidePanelId}
                    isOpen={isSidePanelOpen}
                    onClose={() => closeSidePanel(panel.id)}
                  />
                ) : (
                  <ConsultationPanel
                    id={sidePanelId}
                    isOpen={isSidePanelOpen}
                    onClose={() => closeSidePanel(panel.id)}
                  />
                )}
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}
