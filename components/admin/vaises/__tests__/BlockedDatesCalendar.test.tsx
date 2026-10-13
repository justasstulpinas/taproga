import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { GetServerSidePropsContext } from "next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/router", () => ({
  useRouter: () => ({ pathname: "/admin/vaises/datos", asPath: "/admin/vaises/datos", push }),
}));

import BlockedDatesCalendar from "../BlockedDatesCalendar";
import DatesPage, { getServerSideProps } from "../../../../pages/admin/vaises/datos";

const MONTH = { year: 2026, month: 10 };
// What the page's server load covers when "today" is 2026-10-11.
const THROUGH = "2027-11-15";

function day(name: RegExp): HTMLButtonElement {
  return screen.getByRole("button", { name }) as HTMLButtonElement;
}

function ctx(cookie?: string): GetServerSidePropsContext {
  return {
    resolvedUrl: "/admin/vaises/datos",
    req: { headers: cookie ? { cookie } : {} },
  } as unknown as GetServerSidePropsContext;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

function bodyOf(call: unknown[]): { date: string; idempotency_key: string } {
  return JSON.parse((call[1] as RequestInit).body as string);
}

function next() {
  fireEvent.click(screen.getByRole("button", { name: "Kitas mėnuo" }));
}

function previous() {
  fireEvent.click(screen.getByRole("button", { name: "Ankstesnis mėnuo" }));
}

function heading(): string {
  return screen.getByRole("heading", { level: 2, name: /\d{4}$/ }).textContent ?? "";
}

/** The date part of an "upcoming" row; the row also shows the weekday. */
function upcomingDate(item: HTMLElement): string {
  return item.firstElementChild?.textContent ?? "";
}

beforeEach(() => {
  push.mockReset();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-11T09:00:00Z"));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("BlockedDatesCalendar", () => {
  it("toggle is optimistic", async () => {
    let resolve!: (r: Response) => void;
    const fetchMock = vi.fn().mockReturnValue(new Promise<Response>((r) => (resolve = r)));
    vi.stubGlobal("fetch", fetchMock);
    render(<BlockedDatesCalendar initialBlocked={[]} month={MONTH} through={THROUGH} />);
    const button = day(/14 d\./);
    fireEvent.click(button);
    expect(button.getAttribute("aria-pressed")).toBe("true");
    await act(async () => resolve(json(201, { date: "2026-11-14", created_at: "x" })));
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/admin/vaises/blocked-dates");
    expect(bodyOf(fetchMock.mock.calls[0]).date).toBe("2026-11-14");
  });

  it("failed block rolls back, keeps focus, names the date", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    render(<BlockedDatesCalendar initialBlocked={[]} month={MONTH} through={THROUGH} />);
    const button = day(/14 d\./);
    await act(async () => fireEvent.click(button));
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(document.activeElement).toBe(button);
    expect(screen.getByRole("alert").textContent).toBe(
      "Nepavyko užblokuoti 2026 m. lapkričio 14 d. Bandykite dar kartą.",
    );
  });

  it("failed unblock restores the block and names the date", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);
    render(<BlockedDatesCalendar initialBlocked={["2026-11-14"]} month={MONTH} through={THROUGH} />);
    const button = day(/14 d\./);
    expect(button.getAttribute("aria-pressed")).toBe("true");
    await act(async () => fireEvent.click(button));
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe("DELETE");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/admin/vaises/blocked-dates/2026-11-14");
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(document.activeElement).toBe(button);
    expect(screen.getByRole("alert").textContent).toBe(
      "Nepavyko atblokuoti 2026 m. lapkričio 14 d. Bandykite dar kartą.",
    );
  });

  it("each block click uses a fresh idempotency key", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<BlockedDatesCalendar initialBlocked={[]} month={MONTH} through={THROUGH} />);
    const button = day(/14 d\./);
    fetchMock.mockResolvedValueOnce(json(201, {}));
    await act(async () => fireEvent.click(button));
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await act(async () => fireEvent.click(button));
    fetchMock.mockResolvedValueOnce(json(201, {}));
    await act(async () => fireEvent.click(button));
    expect(bodyOf(fetchMock.mock.calls[0]).idempotency_key).not.toBe(
      bodyOf(fetchMock.mock.calls[2]).idempotency_key,
    );
  });

  it("past days are disabled, and today follows the Vilnius date", () => {
    vi.setSystemTime(new Date("2026-10-11T22:30:00Z"));
    render(<BlockedDatesCalendar initialBlocked={[]} month={{ year: 2026, month: 9 }} through={THROUGH} />);
    expect(day(/11 d\./).disabled).toBe(true);
    expect(day(/12 d\./).disabled).toBe(false);
  });

  it("cannot page back before the current month", () => {
    render(<BlockedDatesCalendar initialBlocked={[]} month={{ year: 2026, month: 9 }} through={THROUGH} />);
    expect((screen.getByRole("button", { name: "Ankstesnis mėnuo" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("a 401 on toggle rolls back and sends the admin to sign in again", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(401, { error: { code: "UNAUTHENTICATED" } })));
    render(<BlockedDatesCalendar initialBlocked={[]} month={MONTH} through={THROUGH} />);
    const button = day(/14 d\./);
    await act(async () => fireEvent.click(button));
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(push).toHaveBeenCalledWith("/admin/login?next=%2Fadmin%2Fvaises%2Fdatos");
  });

  it("pages forward to the month of the booking window end and no further", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => json(200, [])));
    render(<BlockedDatesCalendar initialBlocked={[]} month={{ year: 2029, month: 8 }} through={THROUGH} />);
    await act(async () => next());
    expect(heading()).toBe("Spalis 2029");
    expect((screen.getByRole("button", { name: "Kitas mėnuo" }) as HTMLButtonElement).disabled).toBe(true);
    expect(day(/11 d\./).disabled).toBe(false);
    expect(day(/12 d\./).disabled).toBe(true);
  });

  it("fetches an unloaded month once and shows its blocked days", async () => {
    let resolve!: (r: Response) => void;
    const fetchMock = vi.fn().mockReturnValue(new Promise<Response>((r) => (resolve = r)));
    vi.stubGlobal("fetch", fetchMock);
    render(<BlockedDatesCalendar initialBlocked={[]} month={{ year: 2027, month: 9 }} through={THROUGH} />);
    expect(fetchMock).not.toHaveBeenCalled();
    next();
    expect(heading()).toBe("Lapkritis 2027");
    expect(screen.getByRole("status").textContent).toBe("Kraunama…");
    expect(screen.queryByRole("button", { name: /20 d\./ })).toBeNull();
    await act(async () => resolve(json(200, [{ date: "2027-11-20", created_at: "x" }])));
    expect(day(/20 d\./).getAttribute("aria-pressed")).toBe("true");
    previous();
    await act(async () => next());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/v1/admin/vaises/blocked-dates?from=2027-11-01&to=2027-11-30",
    );
  });

  it("a failed month load shows an error with retry, not an empty month", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(json(200, [{ date: "2027-11-20", created_at: "x" }]));
    vi.stubGlobal("fetch", fetchMock);
    render(<BlockedDatesCalendar initialBlocked={[]} month={{ year: 2027, month: 9 }} through={THROUGH} />);
    await act(async () => next());
    expect(screen.getByRole("alert").textContent).toContain("Nepavyko įkelti užblokuotų datų: Lapkritis 2027.");
    expect(screen.queryByRole("button", { name: /20 d\./ })).toBeNull();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Bandyti dar kartą" })));
    expect(day(/20 d\./).getAttribute("aria-pressed")).toBe("true");
  });

  it("a 401 on a month load sends the admin to sign in again", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(401, { error: { code: "UNAUTHENTICATED" } })));
    render(<BlockedDatesCalendar initialBlocked={[]} month={{ year: 2027, month: 9 }} through={THROUGH} />);
    await act(async () => next());
    expect(push).toHaveBeenCalledWith("/admin/login?next=%2Fadmin%2Fvaises%2Fdatos");
  });

  it("without a server load, fetches the current month instead of showing it empty", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(200, [{ date: "2026-10-20", created_at: "x" }]));
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => {
      render(<BlockedDatesCalendar initialBlocked={[]} month={{ year: 2026, month: 9 }} through={null} />);
    });
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/v1/admin/vaises/blocked-dates?from=2026-10-01&to=2026-10-31",
    );
    expect(day(/20 d\./).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByText("Užblokuotų datų nėra.")).toBeNull();
  });

  it("the upcoming list covers only the server-loaded ~13 months", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(200, [{ date: "2027-11-20", created_at: "x" }])));
    render(
      <BlockedDatesCalendar initialBlocked={["2027-11-14"]} month={{ year: 2027, month: 9 }} through={THROUGH} />,
    );
    await act(async () => next());
    expect(screen.getByRole("heading", { name: "Užblokuotos datos per artimiausius 13 mėnesių" })).toBeTruthy();
    expect(screen.getAllByRole("listitem").map(upcomingDate)).toEqual(["2027 m. lapkričio 14 d."]);
  });

  it("lists upcoming blocked dates in order, or an empty state", () => {
    const { unmount } = render(
      <BlockedDatesCalendar initialBlocked={["2026-12-05", "2026-11-14"]} month={MONTH} through={THROUGH} />,
    );
    const items = screen.getAllByRole("listitem");
    expect(items.map(upcomingDate)).toEqual(["2026 m. lapkričio 14 d.", "2026 m. gruodžio 5 d."]);
    expect(items[0].textContent).toContain("šeštadienis");
    unmount();
    render(<BlockedDatesCalendar initialBlocked={[]} month={MONTH} through={THROUGH} />);
    expect(screen.getByText("Užblokuotų datų nėra.")).toBeTruthy();
  });

  it("marks a blocked day with a strike-through, not colour alone", () => {
    render(<BlockedDatesCalendar initialBlocked={["2026-11-14"]} month={MONTH} through={THROUGH} />);
    expect(day(/14 d\./).className).toContain("admin-day--blocked");
    expect(day(/15 d\./).className).not.toContain("admin-day--blocked");
  });
});

describe("datos page", () => {
  it("getServerSideProps returns the requireSuperadmin redirect when the guard redirects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(401, {})));
    expect(await getServerSideProps(ctx())).toEqual({
      redirect: { destination: "/admin/login?next=%2Fadmin%2Fvaises%2Fdatos", permanent: false },
    });
  });

  it("loads 400 days from Vilnius today, forwarding the cookie", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(200, { account_type: "superadmin" }))
      .mockResolvedValueOnce(json(200, [{ date: "2026-11-14", created_at: "x" }]));
    vi.stubGlobal("fetch", fetchMock);
    const result = await getServerSideProps(ctx("s=1"));
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toMatch(/\/api\/v1\/admin\/vaises\/blocked-dates\?from=2026-10-11&to=2027-11-15$/);
    expect((init as RequestInit).headers).toMatchObject({ cookie: "s=1" });
    expect(result).toEqual({
      props: { blocked: ["2026-11-14"], month: { year: 2026, month: 9 }, through: "2027-11-15" },
    });
  });

  it("flags a failed load instead of showing an empty calendar", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(json(200, { account_type: "superadmin" }))
        .mockResolvedValueOnce(json(500, {})),
    );
    expect(await getServerSideProps(ctx())).toMatchObject({
      props: { through: null, blocked: [] },
    });
  });

  it("renders the calendar inside the admin layout", () => {
    render(<DatesPage blocked={[]} month={MONTH} through={THROUGH} />);
    expect(screen.getByRole("navigation", { name: "Administravimas" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Užblokuotos datos" })).toBeTruthy();
  });

  it("shows the load error", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise<Response>(() => {})));
    render(<DatesPage blocked={[]} month={MONTH} through={null} />);
    expect(screen.getByRole("alert").textContent).toContain("Nepavyko įkelti");
  });
});
