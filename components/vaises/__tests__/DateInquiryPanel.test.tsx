import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { VaisesService } from "@/services/vaises/dateInquiry";
import DateInquiryPanel from "../DateInquiryPanel";

const RATE_LIMITED_MESSAGE = "Per daug užklausų. Pabandykite vėliau.";
const CONTACT = "jonas@pavyzdys.lt";
const CONTACT_LABEL = /el\. paštą arba telefono numerį/;
const MESSAGE_LABEL = "Papasakokite trumpai apie savo šventę (nebūtina)";
const MESSAGE = "Vakarienė 80 svečių";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

let postBodies: Array<Record<string, unknown>>;
let submitResponses: Response[];
let submitGate: Promise<void>;
let postGates: Array<Promise<void>>;

beforeEach(() => {
  postBodies = [];
  submitResponses = [];
  submitGate = Promise.resolve();
  postGates = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        postBodies.push(JSON.parse(String(init.body)));
        const response = submitResponses.shift() ?? jsonResponse(202, { status: "accepted" });
        await (postGates.shift() ?? submitGate);
        return response;
      }
      return jsonResponse(200, { date: "2030-01-01", availability: "available" });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

type User = ReturnType<typeof userEvent.setup>;

async function pickDateAndCheck(user: User) {
  const days = await screen.findAllByRole("button", { name: /\d{4}/ });
  await user.click(days.filter((day) => !day.hasAttribute("disabled")).at(-1)!);
  await user.click(screen.getByRole("button", { name: "Tikrinti" }));
  await screen.findByRole("button", { name: "Toliau" }, { timeout: 3000 });
}

async function openResultStep(user: User, service: VaisesService = "vestuves") {
  render(<DateInquiryPanel id="panel" isOpen onClose={() => {}} service={service} />);
  await pickDateAndCheck(user);
}

/** From the result step, through the message step (typing `message` if given), to the contact field. */
async function continueToContact(user: User, message = "") {
  await user.click(screen.getByRole("button", { name: "Toliau" }));
  if (message) await user.type(screen.getByLabelText(MESSAGE_LABEL), message);
  await user.click(screen.getByRole("button", { name: "Toliau" }));
  return screen.getByRole("textbox", { name: CONTACT_LABEL });
}

async function openContactStep(user: User, service: VaisesService = "vestuves") {
  await openResultStep(user, service);
  return continueToContact(user);
}

function words(count: number): string {
  return Array.from({ length: count }, () => "žodis").join(" ");
}

test.each<[VaisesService]>([["uzkandziai"], ["renginiai"], ["vestuves"]])(
  "sends service %s",
  async (service) => {
    const user = userEvent.setup();
    const input = await openContactStep(user, service);
    await user.type(input, CONTACT);
    await user.click(screen.getByRole("button", { name: "Siųsti užklausą" }));
    await waitFor(() => expect(postBodies).toHaveLength(1));

    expect(postBodies[0].service).toBe(service);
  },
);

test("steps go date → result → message → contact, and Atgal keeps typed text", async () => {
  const user = userEvent.setup();
  await openResultStep(user);
  expect(screen.getByText("Jūsų data laisva")).toBeTruthy();

  await user.click(screen.getByRole("button", { name: "Toliau" }));
  const message = screen.getByLabelText(MESSAGE_LABEL);
  expect(document.activeElement).toBe(message);
  await user.type(message, MESSAGE);
  await user.click(screen.getByRole("button", { name: "Toliau" }));

  const contact = screen.getByRole("textbox", { name: CONTACT_LABEL });
  expect(document.activeElement).toBe(contact);
  await user.type(contact, CONTACT);
  await user.click(screen.getByRole("button", { name: "Atgal" }));
  expect((screen.getByLabelText(MESSAGE_LABEL) as HTMLTextAreaElement).value).toBe(MESSAGE);

  await user.click(screen.getByRole("button", { name: "Atgal" }));
  expect(screen.getByText("Jūsų data laisva")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Toliau" }));
  await user.click(screen.getByRole("button", { name: "Toliau" }));
  expect((screen.getByRole("textbox", { name: CONTACT_LABEL }) as HTMLInputElement).value).toBe(
    CONTACT,
  );
});

test("counter shows N / 50 žodžių; 51 words shows 'Ne daugiau kaip 50 žodžių.' and disables Toliau", async () => {
  const user = userEvent.setup();
  await openResultStep(user);
  await user.click(screen.getByRole("button", { name: "Toliau" }));
  const message = screen.getByLabelText(MESSAGE_LABEL);
  expect(screen.getByText("0 / 50 žodžių")).toBeTruthy();

  await user.click(message);
  await user.paste(words(50));
  expect(screen.getByText("50 / 50 žodžių")).toBeTruthy();
  expect(screen.queryByText("Ne daugiau kaip 50 žodžių.")).toBeNull();
  expect(screen.getByRole("button", { name: "Toliau" }).hasAttribute("disabled")).toBe(false);

  await user.type(message, " dar");
  expect(screen.getByText("51 / 50 žodžių")).toBeTruthy();
  expect(screen.getByText("Ne daugiau kaip 50 žodžių.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Toliau" }).hasAttribute("disabled")).toBe(true);
});

test("changing the date keeps the typed message", async () => {
  const user = userEvent.setup();
  await openResultStep(user);
  await continueToContact(user, MESSAGE);
  await user.click(screen.getByRole("button", { name: "Atgal" }));
  await user.click(screen.getByRole("button", { name: "Atgal" }));
  await user.click(screen.getByRole("button", { name: "Keisti datą" }));
  expect(screen.getByRole("button", { name: "Tikrinti" })).toBeTruthy();

  await user.click(screen.getByRole("button", { name: "Tikrinti" }));
  await screen.findByRole("button", { name: "Toliau" }, { timeout: 3000 });
  await user.click(screen.getByRole("button", { name: "Toliau" }));
  expect((screen.getByLabelText(MESSAGE_LABEL) as HTMLTextAreaElement).value).toBe(MESSAGE);
});

test("a failed send returns to the contact step with message and contact intact", async () => {
  submitResponses.push(jsonResponse(500, { error: { code: "INTERNAL_ERROR" } }));
  const user = userEvent.setup();
  await openResultStep(user);
  const input = await continueToContact(user, MESSAGE);
  await user.type(input, CONTACT);
  await user.click(screen.getByRole("button", { name: "Siųsti užklausą" }));

  await screen.findByRole("alert");
  expect((screen.getByRole("textbox", { name: CONTACT_LABEL }) as HTMLInputElement).value).toBe(
    CONTACT,
  );
  expect(postBodies[0].message).toBe(MESSAGE);
  await user.click(screen.getByRole("button", { name: "Atgal" }));
  expect((screen.getByLabelText(MESSAGE_LABEL) as HTMLTextAreaElement).value).toBe(MESSAGE);
});

test("blank message is not sent", async () => {
  const user = userEvent.setup();
  await openResultStep(user);
  const input = await continueToContact(user, "   ");
  await user.type(input, CONTACT);
  await user.click(screen.getByRole("button", { name: "Siųsti užklausą" }));
  await waitFor(() => expect(postBodies).toHaveLength(1));

  expect("message" in postBodies[0]).toBe(false);
});

test("send shows thank-you immediately, then rolls back with the contact kept on failure", async () => {
  submitResponses.push(
    jsonResponse(429, { error: { code: "RATE_LIMITED", message: "x", request_id: "r1" } }),
  );
  let release!: () => void;
  submitGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const user = userEvent.setup();
  const input = await openContactStep(user);
  await user.type(input, CONTACT);
  await user.click(screen.getByRole("button", { name: "Siųsti užklausą" }));

  // The request is still in flight, yet the thank-you is already on screen.
  expect(screen.getByText(/Gavome jūsų užklausą/)).toBeTruthy();
  release();

  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toBe(RATE_LIMITED_MESSAGE);
  expect((screen.getByRole("textbox", { name: CONTACT_LABEL }) as HTMLInputElement).value).toBe(
    CONTACT,
  );
});

test("retry reuses the idempotency key", async () => {
  submitResponses.push(jsonResponse(500, { error: { code: "INTERNAL_ERROR" } }));
  const user = userEvent.setup();
  const input = await openContactStep(user);
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
    "service",
    "turnstile_token",
  ]);
  expect(postBodies[1]).toMatchObject({ contact: CONTACT, locale: "lt", turnstile_token: "dev" });
});

test("a stale failure after changing the date neither shows an error nor wastes the new key", async () => {
  submitResponses.push(
    jsonResponse(500, { error: { code: "INTERNAL_ERROR" } }),
    jsonResponse(500, { error: { code: "INTERNAL_ERROR" } }),
  );
  let release!: () => void;
  submitGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const user = userEvent.setup();
  const input = await openContactStep(user);
  await user.type(input, CONTACT);
  await user.click(screen.getByRole("button", { name: "Siųsti užklausą" }));
  await user.click(screen.getByRole("button", { name: "Keisti datą" }));

  submitGate = Promise.resolve();
  release();
  await waitFor(() => expect(postBodies).toHaveLength(1));
  await new Promise((resolve) => setTimeout(resolve, 50));

  await user.click(screen.getByRole("button", { name: "Tikrinti" }));
  await screen.findByRole("button", { name: "Toliau" }, { timeout: 3000 });
  await continueToContact(user);
  // Unfixed code leaves the stale send="error" behind, which would surface right here.
  expect(screen.queryByRole("alert")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Siųsti užklausą" }));
  await screen.findByRole("alert");
  await user.click(screen.getByRole("button", { name: "Siųsti užklausą" }));
  await waitFor(() => expect(postBodies).toHaveLength(3));

  expect(postBodies[1].idempotency_key).not.toBe(postBodies[0].idempotency_key);
  expect(postBodies[2].idempotency_key).toBe(postBodies[1].idempotency_key);
});

test("a late success from an abandoned send does not clear the newer inquiry's key", async () => {
  submitResponses.push(
    jsonResponse(202, { status: "accepted" }),
    jsonResponse(500, { error: { code: "INTERNAL_ERROR" } }),
  );
  let releaseOld!: () => void;
  let releaseNew!: () => void;
  postGates.push(
    new Promise<void>((resolve) => {
      releaseOld = resolve;
    }),
    new Promise<void>((resolve) => {
      releaseNew = resolve;
    }),
  );
  const user = userEvent.setup();
  const input = await openContactStep(user);
  await user.type(input, CONTACT);
  await user.click(screen.getByRole("button", { name: "Siųsti užklausą" }));
  await user.click(screen.getByRole("button", { name: "Keisti datą" }));
  await user.click(screen.getByRole("button", { name: "Tikrinti" }));
  await screen.findByRole("button", { name: "Toliau" }, { timeout: 3000 });
  await continueToContact(user);
  await user.click(screen.getByRole("button", { name: "Siųsti užklausą" }));
  await waitFor(() => expect(postBodies).toHaveLength(2));

  releaseOld();
  await new Promise((resolve) => setTimeout(resolve, 50));
  releaseNew();
  await screen.findByRole("alert");
  await user.click(screen.getByRole("button", { name: "Siųsti užklausą" }));
  await waitFor(() => expect(postBodies).toHaveLength(3));

  expect(postBodies[1].idempotency_key).not.toBe(postBodies[0].idempotency_key);
  expect(postBodies[2].idempotency_key).toBe(postBodies[1].idempotency_key);
});
