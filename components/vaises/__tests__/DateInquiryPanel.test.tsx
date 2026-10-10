import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import DateInquiryPanel from "../DateInquiryPanel";

const RATE_LIMITED_MESSAGE = "Per daug užklausų. Pabandykite vėliau.";
const CONTACT = "jonas@pavyzdys.lt";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

let postBodies: Array<Record<string, unknown>>;
let submitResponses: Response[];
let submitGate: Promise<void>;

beforeEach(() => {
  postBodies = [];
  submitResponses = [];
  submitGate = Promise.resolve();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        postBodies.push(JSON.parse(String(init.body)));
        await submitGate;
        return submitResponses.shift() ?? jsonResponse(202, { status: "accepted" });
      }
      return jsonResponse(200, { date: "2030-01-01", availability: "available" });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function openResultStep(user: ReturnType<typeof userEvent.setup>) {
  render(<DateInquiryPanel id="panel" isOpen onClose={() => {}} />);
  const days = await screen.findAllByRole("button", { name: /\d{4}/ });
  await user.click(days.filter((day) => !day.hasAttribute("disabled")).at(-1)!);
  await user.click(screen.getByRole("button", { name: "Tikrinti" }));
  return screen.findByRole("textbox", {}, { timeout: 3000 });
}

test("send shows thank-you immediately, then rolls back with the contact kept on failure", async () => {
  submitResponses.push(
    jsonResponse(429, { error: { code: "RATE_LIMITED", message: "x", request_id: "r1" } }),
  );
  let release!: () => void;
  submitGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const user = userEvent.setup();
  const input = await openResultStep(user);
  await user.type(input, CONTACT);
  await user.click(screen.getByRole("button", { name: "Siųsti užklausą" }));

  // The request is still in flight, yet the thank-you is already on screen.
  expect(screen.getByText(/Gavome jūsų užklausą/)).toBeTruthy();
  release();

  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toBe(RATE_LIMITED_MESSAGE);
  expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe(CONTACT);
});

test("retry reuses the idempotency key", async () => {
  submitResponses.push(jsonResponse(500, { error: { code: "INTERNAL_ERROR" } }));
  const user = userEvent.setup();
  const input = await openResultStep(user);
  await user.type(input, CONTACT);
  await user.click(screen.getByRole("button", { name: "Siųsti užklausą" }));
  await screen.findByRole("alert");
  await user.click(screen.getByRole("button", { name: "Siųsti užklausą" }));
  await waitFor(() => expect(postBodies).toHaveLength(2));

  expect(postBodies[0].idempotency_key).toBeTruthy();
  expect(postBodies[1].idempotency_key).toBe(postBodies[0].idempotency_key);
  expect(Object.keys(postBodies[1]).sort()).toEqual([
    "contact",
    "date",
    "idempotency_key",
    "locale",
    "turnstile_token",
  ]);
  expect(postBodies[1]).toMatchObject({ contact: CONTACT, locale: "lt", turnstile_token: "dev" });
});
