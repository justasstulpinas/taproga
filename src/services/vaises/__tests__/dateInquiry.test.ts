import { afterEach, expect, test, vi } from "vitest";
import { ApiError, messageFor } from "@/lib/api/errors";
import { checkDateAvailability } from "../dateInquiry";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("checkDateAvailability maps API JSON", async () => {
  const fetchMock = vi.fn(
    async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify({ date: "2030-01-01", availability: "reserved" }), {
        status: 200,
      }),
  );
  vi.stubGlobal("fetch", fetchMock);

  await expect(checkDateAvailability("2030-01-01")).resolves.toBe("reserved");
  expect(fetchMock.mock.calls[0]).toEqual([
    "/api/v1/vaises/availability?date=2030-01-01",
    expect.objectContaining({ credentials: "same-origin" }),
  ]);
});

test("a non-2xx response becomes an ApiError with code, status and retry-after", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { code: "RATE_LIMITED", request_id: "r9" } }), {
          status: 429,
          headers: { "Retry-After": "60" },
        }),
    ),
  );

  await expect(checkDateAvailability("2030-01-01")).rejects.toMatchObject({
    code: "RATE_LIMITED",
    status: 429,
    retryAfterSeconds: 60,
    requestId: "r9",
  });
});

test("messageFor falls back for unknown codes", () => {
  expect(messageFor(new ApiError("SOMETHING_NEW", 400))).toBe(
    "Nepavyko išsiųsti. Bandykite dar kartą.",
  );
  expect(messageFor(new TypeError("network"))).toBe("Nepavyko išsiųsti. Bandykite dar kartą.");
});

test("messageFor shows the request id on INTERNAL_ERROR", () => {
  const message = messageFor(new ApiError("INTERNAL_ERROR", 500, { requestId: "abc" }));
  expect(message.endsWith("(klaidos kodas: abc)")).toBe(true);
});
