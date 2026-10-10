import { useImperativeHandle, useRef, type Ref } from "react";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
// Accepted by the local AllowAllHumanVerifier only; production always has a site key.
const DEV_TOKEN = "dev";
// A challenge the visitor ignores must not leave the optimistic thank-you up forever.
const TOKEN_TIMEOUT_MS = 45_000;

type TurnstileApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  execute: (widgetId: string) => void;
  reset: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export type TurnstileHandle = { getToken: () => Promise<string> };

let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  scriptPromise ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () =>
      window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile missing"));
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("Turnstile failed to load"));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/** Invisible human check: renders nothing visible; ask the handle for a fresh single-use token. */
export default function Turnstile({ ref }: { ref: Ref<TurnstileHandle> }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const pendingRef = useRef<{
    resolve: (token: string) => void;
    reject: (error: Error) => void;
  } | null>(null);

  async function ensureWidget(): Promise<{ api: TurnstileApi; widgetId: string }> {
    const api = await loadTurnstile();
    if (widgetIdRef.current === null && containerRef.current) {
      widgetIdRef.current = api.render(containerRef.current, {
        sitekey: SITE_KEY,
        execution: "execute",
        appearance: "interaction-only",
        callback: (token: string) => pendingRef.current?.resolve(token),
        "error-callback": () => pendingRef.current?.reject(new Error("Turnstile error")),
      });
    }
    if (widgetIdRef.current === null) throw new Error("Turnstile container missing");
    return { api, widgetId: widgetIdRef.current };
  }

  useImperativeHandle(ref, () => ({
    async getToken() {
      if (!SITE_KEY) return DEV_TOKEN;
      const { api, widgetId } = await ensureWidget();
      return new Promise<string>((resolve, reject) => {
        const settle = () => {
          clearTimeout(timer);
          pendingRef.current = null;
        };
        const timer = setTimeout(() => {
          settle();
          reject(new Error("Turnstile timed out"));
        }, TOKEN_TIMEOUT_MS);
        pendingRef.current = {
          resolve: (token) => {
            settle();
            resolve(token);
          },
          reject: (error) => {
            settle();
            reject(error);
          },
        };
        api.reset(widgetId);
        api.execute(widgetId);
      });
    },
  }));

  return SITE_KEY ? <div ref={containerRef} /> : null;
}
