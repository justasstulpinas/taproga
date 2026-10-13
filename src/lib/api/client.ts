import { ApiError } from "@/lib/api/errors";

const API_PREFIX = "/api/v1";
const UNKNOWN_CODE = "UNKNOWN";
const NO_CONTENT = 204;

type ErrorBody = { error?: { code?: string; message?: string; request_id?: string } };

async function readErrorBody(response: Response): Promise<ErrorBody> {
  try {
    return (await response.json()) as ErrorBody;
  } catch {
    return {};
  }
}

function parseRetryAfter(header: string | null): number | undefined {
  const seconds = header === null ? NaN : Number(header);
  return Number.isFinite(seconds) ? seconds : undefined;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body !== undefined) headers.set("Content-Type", "application/json");

  const response = await fetch(`${API_PREFIX}${path}`, {
    ...init,
    headers,
    credentials: "same-origin",
  });

  if (!response.ok) {
    const { error } = await readErrorBody(response);
    throw new ApiError(error?.code ?? UNKNOWN_CODE, response.status, {
      message: error?.message,
      requestId: error?.request_id,
      retryAfterSeconds: parseRetryAfter(response.headers.get("Retry-After")),
    });
  }
  if (response.status === NO_CONTENT) return undefined as T;
  return (await response.json()) as T;
}
