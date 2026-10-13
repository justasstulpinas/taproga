import { cleanup, render, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import VaisesPage from "../../../pages/vaises/index";

// The shared top bar creates a Supabase client; only the panel wiring is under test here.
vi.mock("../../home/KvieciamTopBar", () => ({ default: () => null }));

beforeEach(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function sidePanel(container: HTMLElement, panelId: string): HTMLElement {
  const panel = container.querySelector<HTMLElement>(`#${panelId} .vaises-date-panel`);
  if (!panel) throw new Error(`no side panel in #${panelId}`);
  return panel;
}

test.each([["uzkandziai"], ["renginiai"], ["vestuves"]])(
  "%s opens the date inquiry calendar",
  (panelId) => {
    const { container } = render(<VaisesPage />);
    const panel = within(sidePanel(container, panelId));
    expect(panel.getByRole("button", { name: "Tikrinti", hidden: true })).toBeTruthy();
  },
);

test.each([["misija"], ["komanda"]])("%s keeps the contact-only form", (panelId) => {
  const { container } = render(<VaisesPage />);
  const panel = within(sidePanel(container, panelId));
  expect(panel.queryByRole("button", { name: "Tikrinti", hidden: true })).toBeNull();
  expect(panel.getByText("Susisiekime")).toBeTruthy();
});
