import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
let query: Record<string, string> = {};
vi.mock("next/router", () => ({
  useRouter: () => ({ push, query, isReady: true }),
}));

import LoginPage from "../../../pages/admin/login";

const WRONG = "Neteisingas el. paštas arba slaptažodis.";
const SUPERADMIN = { user: { account_type: "superadmin" } };

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status });
}

async function fillAndSubmit() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("El. paštas"), "a@b.lt");
  await user.type(screen.getByLabelText("Slaptažodis"), "secret-password");
  await user.click(screen.getByRole("button", { name: "Prisijungti" }));
}

beforeEach(() => {
  push.mockReset();
  query = {};
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("admin login", () => {
  it("has visible labels for email and password", () => {
    render(<LoginPage />);
    expect(screen.getByLabelText("El. paštas")).toBeInstanceOf(HTMLInputElement);
    expect(screen.getByLabelText("Slaptažodis")).toBeInstanceOf(HTMLInputElement);
  });

  it("shows a generic error for wrong credentials", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(401, { error: { code: "INVALID_CREDENTIALS" } })));
    render(<LoginPage />);
    await fillAndSubmit();
    expect((await screen.findByRole("alert")).textContent).toBe(WRONG);
    expect(push).not.toHaveBeenCalled();
  });

  it("does not reveal an unverified account", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(403, { error: { code: "EMAIL_NOT_VERIFIED" } })));
    render(<LoginPage />);
    await fillAndSubmit();
    expect((await screen.findByRole("alert")).textContent).toBe(WRONG);
  });

  it("shows the lockout message on rate limiting", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(429, { error: { code: "RATE_LIMITED" } })));
    render(<LoginPage />);
    await fillAndSubmit();
    expect((await screen.findByRole("alert")).textContent).toBe("Per daug bandymų. Pabandykite vėliau.");
  });

  it("disables the submit button while the request is in flight", async () => {
    let resolve!: (r: Response) => void;
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise<Response>((r) => (resolve = r))));
    render(<LoginPage />);
    await fillAndSubmit();
    const button = await screen.findByRole("button", { name: "Jungiamasi…" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    resolve(jsonResponse(401, { error: { code: "INVALID_CREDENTIALS" } }));
    await waitFor(() =>
      expect((screen.getByRole("button", { name: "Prisijungti" }) as HTMLButtonElement).disabled).toBe(false),
    );
  });

  it("signs a non-superadmin back out and says so instead of navigating", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { user: { account_type: "newlywed" } }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<LoginPage />);
    await fillAndSubmit();
    expect((await screen.findByRole("alert")).textContent).toBe("Ši paskyra neturi prieigos prie administravimo.");
    expect(fetchMock.mock.calls[1][0]).toBe("/api/v1/auth/logout");
    expect((fetchMock.mock.calls[1][1] as RequestInit).method).toBe("POST");
    expect(push).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "Prisijungti" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("goes to the uzklausos page by default on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, SUPERADMIN)));
    render(<LoginPage />);
    await fillAndSubmit();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/vaises/uzklausos"));
  });

  it("follows a safe next path", async () => {
    query = { next: "/admin/vaises/datos" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, SUPERADMIN)));
    render(<LoginPage />);
    await fillAndSubmit();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/vaises/datos"));
  });

  it.each(["https://evil.example", "//evil.example"])("ignores a malicious next %s", async (next) => {
    query = { next };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, SUPERADMIN)));
    render(<LoginPage />);
    await fillAndSubmit();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/vaises/uzklausos"));
  });
});
