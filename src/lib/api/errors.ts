export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryAfterSeconds?: number;
  readonly requestId?: string;

  constructor(
    code: string,
    status: number,
    details: { message?: string; retryAfterSeconds?: number; requestId?: string } = {},
  ) {
    super(details.message ?? code);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.retryAfterSeconds = details.retryAfterSeconds;
    this.requestId = details.requestId;
  }
}

const FALLBACK_MESSAGE = "Nepavyko išsiųsti. Bandykite dar kartą.";

const MESSAGES: Record<string, string> = {
  INVALID_DATE: "Pasirinkite datą nuo šiandien iki 3 metų į priekį.",
  INVALID_CONTACT: "Įveskite el. pašto adresą arba telefono numerį.",
  HUMAN_VERIFICATION_FAILED: "Nepavyko patvirtinti, kad esate žmogus. Bandykite dar kartą.",
  RATE_LIMITED: "Per daug užklausų. Pabandykite vėliau.",
};

/** Visitor-facing Lithuanian text for a failed request; never exposes internals. */
export function messageFor(error: unknown): string {
  if (!(error instanceof ApiError)) return FALLBACK_MESSAGE;
  if (error.code === "INTERNAL_ERROR" && error.requestId) {
    return `${FALLBACK_MESSAGE} (klaidos kodas: ${error.requestId})`;
  }
  return MESSAGES[error.code] ?? FALLBACK_MESSAGE;
}
