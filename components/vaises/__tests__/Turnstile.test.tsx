import { render } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { TurnstileHandle } from "../Turnstile";

const TOKEN_TIMEOUT_MS = 45_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "site-key");
  vi.resetModules();
  vi.stubGlobal("turnstile", {
    render: vi.fn(() => "widget-1"),
    reset: vi.fn(),
    execute: vi.fn(),
  });
  // jsdom never loads remote scripts, so report the stubbed API as loaded.
  vi.spyOn(document.head, "appendChild").mockImplementation((node) => {
    (node as HTMLScriptElement).onload?.(new Event("load"));
    return node;
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("getToken rejects after 45 seconds when the challenge never calls back", async () => {
  const { default: Turnstile } = await import("../Turnstile");
  const ref = createRef<TurnstileHandle>();
  render(<Turnstile ref={ref} />);

  const assertion = expect(ref.current!.getToken()).rejects.toThrow("timed out");
  await vi.advanceTimersByTimeAsync(TOKEN_TIMEOUT_MS);
  await assertion;
});

test("a later getToken works after a timeout", async () => {
  const { default: Turnstile } = await import("../Turnstile");
  const ref = createRef<TurnstileHandle>();
  render(<Turnstile ref={ref} />);

  const firstAssertion = expect(ref.current!.getToken()).rejects.toThrow();
  await vi.advanceTimersByTimeAsync(TOKEN_TIMEOUT_MS);
  await firstAssertion;

  const second = ref.current!.getToken();
  await vi.advanceTimersByTimeAsync(0);
  const options = (window.turnstile!.render as ReturnType<typeof vi.fn>).mock.calls[0][1];
  options.callback("fresh-token");
  await expect(second).resolves.toBe("fresh-token");
});
