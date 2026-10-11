const DEFAULT_API_ORIGIN = "http://localhost:8000";

/** Server-side call to the API on behalf of the browser, forwarding its session cookie. */
export function serverApiFetch(path: string, cookie: string | undefined): Promise<Response> {
  const origin = process.env.API_ORIGIN ?? DEFAULT_API_ORIGIN;
  return fetch(`${origin}/api/v1${path}`, {
    headers: { accept: "application/json", ...(cookie ? { cookie } : {}) },
  });
}
