import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { GetServerSidePropsContext } from "next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/router", () => ({
  useRouter: () => ({ pathname: "/admin/vaises/uzklausos", asPath: "/admin/vaises/uzklausos?id=r1", push }),
}));

import RequestsList from "../RequestsList";
import RequestsPage, { getServerSideProps } from "../../../../pages/admin/vaises/uzklausos";
import type { VaisesRequestOut } from "@/services/admin/vaises";

function makeRequest(overrides: Partial<VaisesRequestOut> = {}): VaisesRequestOut {
  return {
    id: "r1",
    kind: "date_inquiry",
    event_date: "2026-11-14",
    event_date_label: "2026 m. lapkričio 14 d.",
    service: "vestuves",
    message: null,
    availability_at_submit: "available",
    contact_kind: "email",
    contact: "jonas@example.com",
    status: "new",
    created_at: "2026-10-10T21:30:00Z",
    handled_at: null,
    anonymised_at: null,
    ...overrides,
  };
}

const FIRST = makeRequest();
const SECOND = makeRequest({
  id: "r2",
  kind: "consultation",
  event_date: null,
  event_date_label: null,
  service: null,
  availability_at_submit: null,
  contact_kind: "phone",
  contact: "+37060000000",
  created_at: "2026-10-09T10:00:00Z",
});

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

function deferred() {
  let resolve!: (response: Response) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Response>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function urls(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls.map((call) => String(call[0]));
}

function renderList(items: VaisesRequestOut[] = [FIRST, SECOND], extra: Partial<Parameters<typeof RequestsList>[0]> = {}) {
  return render(
    <RequestsList
      initialTab="new"
      initialPage={{ items, next_cursor: null }}
      highlightId={null}
      highlighted={null}
      {...extra}
    />,
  );
}

function row(name: RegExp): HTMLElement {
  return screen.getByRole("listitem", { name });
}

beforeEach(() => {
  push.mockReset();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("RequestsList rows", () => {
  it("labels a date inquiry with its service and shows the message", () => {
    renderList([makeRequest({ service: "renginiai", message: "Vakarienė 80 svečių." })]);
    const item = row(/^Renginiai, 2026 m\. lapkričio 14 d\.$/);
    expect(within(item).getByText("Renginiai").className).toBe("admin-request-kind");
    expect(within(item).getByText("Vakarienė 80 svečių.").className).toBe("admin-request-message");
  });

  it("shows a consultation with no service label and no message", () => {
    const { container } = renderList([SECOND]);
    expect(row(/^Konsultacija$/)).toBeTruthy();
    expect(container.querySelector(".admin-request-message")).toBeNull();
  });

  it("shows no message once erased", () => {
    const { container } = renderList([
      makeRequest({ message: "Liko po ištrynimo", contact: null, contact_kind: null, anonymised_at: "2026-10-11T00:00:00Z" }),
    ]);
    expect(screen.queryByText("Liko po ištrynimo")).toBeNull();
    expect(container.querySelector(".admin-request-message")).toBeNull();
  });

  it("keeps the message's line breaks", () => {
    const { container } = renderList([makeRequest({ message: "Pirma eilutė\nantra eilutė" })]);
    const message = container.querySelector(".admin-request-message");
    expect(message?.textContent).toBe("Pirma eilutė\nantra eilutė");
  });

  it("renders a script-like message as plain text", () => {
    const attack = "<script>alert(1)</script><img src=x onerror=alert(1)>";
    const { container } = renderList([makeRequest({ message: attack })]);
    expect(container.querySelector(".admin-request-message")?.textContent).toBe(attack);
    expect(container.querySelector("script, img")).toBeNull();
  });

  it("shows kind, date, availability, contact link and Vilnius arrival time", () => {
    renderList();
    const first = row(/lapkričio 14/);
    expect(first.textContent).toContain("Vestuvės");
    expect(first.textContent).toContain("laisva");
    expect(first.textContent).toContain("2026-10-11");
    expect(first.textContent).toContain("00:30");
    const link = within(first).getByRole("link", { name: "jonas@example.com" });
    expect(link.getAttribute("href")).toBe("mailto:jonas@example.com");
    const second = row(/Konsultacija/);
    expect(within(second).getByRole("link").getAttribute("href")).toBe("tel:+37060000000");
  });

  it("shows a note instead of the contact when anonymised", () => {
    renderList([makeRequest({ contact: null, contact_kind: null, anonymised_at: "2026-10-11T00:00:00Z" })]);
    expect(screen.getByText("Kontaktai ištrinti")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("button", { name: "Ištrinti kontaktus" })).toBeNull();
  });

  it("renders the empty state", () => {
    renderList([]);
    expect(screen.getByText("Naujų užklausų nėra")).toBeTruthy();
  });

  it("highlights the request from ?id=", () => {
    renderList([FIRST, SECOND], { highlightId: "r2" });
    expect(row(/Konsultacija/).getAttribute("data-highlighted")).toBe("true");
    expect(row(/lapkričio 14/).getAttribute("data-highlighted")).toBeNull();
  });

  it("merges a highlighted request that is not on the first page", () => {
    const far = makeRequest({ id: "r9", created_at: "2026-01-01T10:00:00Z", event_date_label: "2027 m. sausio 5 d." });
    renderList([FIRST], { highlightId: "r9", highlighted: far });
    const items = screen.getAllByRole("listitem");
    expect(items[items.length - 1].getAttribute("data-highlighted")).toBe("true");
  });
});

describe("mark handled", () => {
  it("removes the row before the request resolves and sends the call at once", async () => {
    const pending = deferred();
    const fetchMock = vi.fn().mockReturnValue(pending.promise);
    vi.stubGlobal("fetch", fetchMock);
    renderList();
    fireEvent.click(within(row(/lapkričio 14/)).getByRole("button", { name: "Pažymėti atsakytu" }));
    expect(screen.queryByRole("listitem", { name: /lapkričio 14/ })).toBeNull();
    expect(screen.getByText(/Pažymėta atsakytu/)).toBeTruthy();
    expect(urls(fetchMock)).toEqual(["/api/v1/admin/vaises/requests/r1/handled"]);
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe("POST");
    await act(async () => pending.resolve(json(200, { ...FIRST, status: "handled" })));
  });

  it("undo within 5 s calls reopen and restores the row", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(200, { ...FIRST, status: "handled" }))
      .mockResolvedValueOnce(json(200, FIRST));
    vi.stubGlobal("fetch", fetchMock);
    renderList();
    await act(async () => fireEvent.click(within(row(/lapkričio 14/)).getByRole("button", { name: "Pažymėti atsakytu" })));
    await act(async () => vi.advanceTimersByTime(4000));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Atšaukti" })));
    expect(urls(fetchMock)).toEqual([
      "/api/v1/admin/vaises/requests/r1/handled",
      "/api/v1/admin/vaises/requests/r1/reopen",
    ]);
    expect(row(/lapkričio 14/)).toBeTruthy();
    expect(screen.queryByText(/Pažymėta atsakytu/)).toBeNull();
  });

  it("the undo notice disappears after 5 s", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(200, { ...FIRST, status: "handled" })));
    renderList();
    await act(async () => fireEvent.click(within(row(/lapkričio 14/)).getByRole("button", { name: "Pažymėti atsakytu" })));
    await act(async () => vi.advanceTimersByTime(4900));
    expect(screen.getByText(/Pažymėta atsakytu/)).toBeTruthy();
    await act(async () => vi.advanceTimersByTime(200));
    expect(screen.queryByText(/Pažymėta atsakytu/)).toBeNull();
    expect(screen.queryByRole("listitem", { name: /lapkričio 14/ })).toBeNull();
  });

  it("a failed handle restores the row and names the date", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    renderList();
    await act(async () => fireEvent.click(within(row(/lapkričio 14/)).getByRole("button", { name: "Pažymėti atsakytu" })));
    expect(row(/lapkričio 14/)).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe(
      "Nepavyko pažymėti atsakytu: 2026 m. lapkričio 14 d. Bandykite dar kartą.",
    );
    expect(screen.queryByText(/Pažymėta atsakytu$/)).toBeNull();
  });

  it("a 401 on handle restores the row and sends the admin to sign in again", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(401, { error: { code: "UNAUTHENTICATED" } })));
    renderList();
    await act(async () => fireEvent.click(within(row(/lapkričio 14/)).getByRole("button", { name: "Pažymėti atsakytu" })));
    expect(row(/lapkričio 14/)).toBeTruthy();
    expect(push).toHaveBeenCalledWith("/admin/login?next=%2Fadmin%2Fvaises%2Fuzklausos%3Fid%3Dr1");
  });

  it("a failed handle on a consultation names \"konsultacija\"", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    renderList();
    await act(async () => fireEvent.click(within(row(/Konsultacija/)).getByRole("button", { name: "Pažymėti atsakytu" })));
    expect(screen.getByRole("alert").textContent).toContain("konsultacija");
  });

  it("ignores repeat clicks while a mutation is outstanding", async () => {
    const pending = deferred();
    const fetchMock = vi.fn().mockReturnValue(pending.promise);
    vi.stubGlobal("fetch", fetchMock);
    renderList();
    const button = within(row(/lapkričio 14/)).getByRole("button", { name: "Pažymėti atsakytu" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve(json(200, { ...FIRST, status: "handled" })));
  });

  it("undo during the in-flight handle is queued and reopens once handled settles", async () => {
    const pending = deferred();
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(json(200, FIRST));
    vi.stubGlobal("fetch", fetchMock);
    renderList();
    fireEvent.click(within(row(/lapkričio 14/)).getByRole("button", { name: "Pažymėti atsakytu" }));
    fireEvent.click(screen.getByRole("button", { name: "Atšaukti" }));
    const busy = screen.getByRole("button", { name: "Atšaukiama…" });
    expect(busy.getAttribute("aria-busy")).toBe("true");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve(json(200, { ...FIRST, status: "handled" })));
    expect(urls(fetchMock)).toEqual([
      "/api/v1/admin/vaises/requests/r1/handled",
      "/api/v1/admin/vaises/requests/r1/reopen",
    ]);
    expect(row(/lapkričio 14/)).toBeTruthy();
    expect(screen.queryByText(/Pažymėta atsakytu/)).toBeNull();
  });

  it("keeps the notice past 5 s while a queued undo waits for a slow handled call", async () => {
    const pending = deferred();
    const fetchMock = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValueOnce(json(200, FIRST));
    vi.stubGlobal("fetch", fetchMock);
    renderList();
    fireEvent.click(within(row(/lapkričio 14/)).getByRole("button", { name: "Pažymėti atsakytu" }));
    fireEvent.click(screen.getByRole("button", { name: "Atšaukti" }));
    await act(async () => vi.advanceTimersByTime(8000));
    expect(screen.getByRole("button", { name: "Atšaukiama…" })).toBeTruthy();
    await act(async () => pending.resolve(json(200, { ...FIRST, status: "handled" })));
    expect(urls(fetchMock)[1]).toBe("/api/v1/admin/vaises/requests/r1/reopen");
    expect(screen.queryByRole("button", { name: /Atšauk/ })).toBeNull();
  });

  it("a failed handle with a queued undo sends no reopen and restores the row with the error", async () => {
    const pending = deferred();
    const fetchMock = vi.fn().mockReturnValue(pending.promise);
    vi.stubGlobal("fetch", fetchMock);
    renderList();
    fireEvent.click(within(row(/lapkričio 14/)).getByRole("button", { name: "Pažymėti atsakytu" }));
    fireEvent.click(screen.getByRole("button", { name: "Atšaukti" }));
    await act(async () => pending.reject(new Error("offline")));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(row(/lapkričio 14/)).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("2026 m. lapkričio 14 d.");
    expect(screen.queryByRole("button", { name: /Atšauk/ })).toBeNull();
  });
});

describe("erase", () => {
  it("requires confirmation and sends nothing until confirmed", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderList();
    fireEvent.click(within(row(/lapkričio 14/)).getByRole("button", { name: "Ištrinti kontaktus" }));
    const dialog = screen.getByRole("dialog");
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Neištrinti" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("jonas@example.com")).toBeTruthy();
  });

  it("focuses the safe cancel button when the dialog opens", () => {
    renderList();
    fireEvent.click(within(row(/lapkričio 14/)).getByRole("button", { name: "Ištrinti kontaktus" }));
    const cancel = within(screen.getByRole("dialog")).getByRole("button", { name: "Neištrinti" });
    expect(document.activeElement).toBe(cancel);
  });

  it("Escape (the dialog's close event) dismisses without erasing", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderList();
    fireEvent.click(within(row(/lapkričio 14/)).getByRole("button", { name: "Ištrinti kontaktus" }));
    fireEvent(screen.getByRole("dialog"), new Event("close"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("confirming is optimistic", async () => {
    const pending = deferred();
    const fetchMock = vi.fn().mockReturnValue(pending.promise);
    vi.stubGlobal("fetch", fetchMock);
    renderList();
    fireEvent.click(within(row(/lapkričio 14/)).getByRole("button", { name: "Ištrinti kontaktus" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Ištrinti kontaktus" }));
    expect(within(row(/lapkričio 14/)).getByText("Kontaktai ištrinti")).toBeTruthy();
    expect(urls(fetchMock)).toEqual(["/api/v1/admin/vaises/requests/r1/erase"]);
    await act(async () =>
      pending.resolve(json(200, { ...FIRST, contact: null, contact_kind: null, anonymised_at: "2026-10-11T00:00:00Z" })),
    );
    expect(within(row(/lapkričio 14/)).getByText("Kontaktai ištrinti")).toBeTruthy();
  });

  it("a failed erase restores the contact and names the request", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    renderList();
    fireEvent.click(within(row(/lapkričio 14/)).getByRole("button", { name: "Ištrinti kontaktus" }));
    await act(async () =>
      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Ištrinti kontaktus" })),
    );
    expect(within(row(/lapkričio 14/)).getByText("jonas@example.com")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("2026 m. lapkričio 14 d.");
  });
});

describe("paging and tabs", () => {
  it("Rodyti daugiau fetches the next page with the cursor", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(200, { items: [SECOND], next_cursor: null }));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <RequestsList
        initialTab="new"
        initialPage={{ items: [FIRST], next_cursor: "abc" }}
        highlightId={null}
        highlighted={null}
      />,
    );
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Rodyti daugiau" })));
    expect(urls(fetchMock)).toEqual(["/api/v1/admin/vaises/requests?status=new&cursor=abc"]);
    expect(row(/Konsultacija/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Rodyti daugiau" })).toBeNull();
  });

  it("switching to Atsakytos shows a skeleton, then the handled list and its empty state", async () => {
    const pending = deferred();
    const fetchMock = vi.fn().mockReturnValue(pending.promise);
    vi.stubGlobal("fetch", fetchMock);
    renderList();
    fireEvent.click(screen.getByRole("tab", { name: "Atsakytos" }));
    expect(screen.getByRole("status", { name: "Kraunama…" })).toBeTruthy();
    expect(urls(fetchMock)).toEqual(["/api/v1/admin/vaises/requests?status=handled"]);
    await act(async () => pending.resolve(json(200, { items: [], next_cursor: null })));
    expect(screen.getByText("Atsakytų užklausų dar nėra")).toBeTruthy();
  });

  it("shows an error with retry when loading fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(500, {}))
      .mockResolvedValueOnce(json(200, { items: [], next_cursor: null }));
    vi.stubGlobal("fetch", fetchMock);
    renderList();
    await act(async () => fireEvent.click(screen.getByRole("tab", { name: "Atsakytos" })));
    expect(screen.getByRole("alert").textContent).toContain("Nepavyko įkelti užklausų.");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Bandyti dar kartą" })));
    expect(screen.getByText("Atsakytų užklausų dar nėra")).toBeTruthy();
  });

  it("a handled request moves into an already loaded Atsakytos tab", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(200, { items: [], next_cursor: null }))
      .mockResolvedValueOnce(json(200, { ...FIRST, status: "handled" }));
    vi.stubGlobal("fetch", fetchMock);
    renderList();
    await act(async () => fireEvent.click(screen.getByRole("tab", { name: "Atsakytos" })));
    await act(async () => fireEvent.click(screen.getByRole("tab", { name: "Naujos" })));
    await act(async () => fireEvent.click(within(row(/lapkričio 14/)).getByRole("button", { name: "Pažymėti atsakytu" })));
    await act(async () => fireEvent.click(screen.getByRole("tab", { name: "Atsakytos" })));
    expect(row(/lapkričio 14/)).toBeTruthy();
  });
});

describe("uzklausos page", () => {
  function ctx(query: Record<string, string> = {}, cookie?: string): GetServerSidePropsContext {
    return {
      resolvedUrl: "/admin/vaises/uzklausos",
      query,
      req: { headers: cookie ? { cookie } : {} },
    } as unknown as GetServerSidePropsContext;
  }
  const me = () => json(200, { account_type: "superadmin" });

  it("redirects when not a superadmin", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(401, {})));
    expect(await getServerSideProps(ctx())).toEqual({
      redirect: { destination: "/admin/login?next=%2Fadmin%2Fvaises%2Fuzklausos", permanent: false },
    });
  });

  it("loads the first page of new requests, forwarding the cookie", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(me())
      .mockResolvedValueOnce(json(200, { items: [FIRST], next_cursor: "c" }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await getServerSideProps(ctx({}, "s=1"));
    expect(String(fetchMock.mock.calls[1][0])).toMatch(/\/admin\/vaises\/requests\?status=new$/);
    expect((fetchMock.mock.calls[1][1] as RequestInit).headers).toMatchObject({ cookie: "s=1" });
    expect(result).toEqual({
      props: {
        initialTab: "new",
        initialPage: { items: [FIRST], next_cursor: "c" },
        highlightId: null,
        highlighted: null,
      },
    });
  });

  it("fetches ?id= separately when it is not on the first page", async () => {
    const far = makeRequest({ id: "r9" });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(me())
      .mockResolvedValueOnce(json(200, far))
      .mockResolvedValueOnce(json(200, { items: [FIRST], next_cursor: null }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await getServerSideProps(ctx({ id: "r9" }));
    expect(String(fetchMock.mock.calls[1][0])).toMatch(/\/admin\/vaises\/requests\/r9$/);
    expect(result).toMatchObject({ props: { highlightId: "r9", highlighted: far, initialTab: "new" } });
  });

  it("opens the Atsakytos tab for a handled ?id=", async () => {
    const done = makeRequest({ id: "r9", status: "handled" });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(me())
      .mockResolvedValueOnce(json(200, done))
      .mockResolvedValueOnce(json(200, { items: [done], next_cursor: null }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await getServerSideProps(ctx({ id: "r9" }));
    expect(String(fetchMock.mock.calls[2][0])).toMatch(/requests\?status=handled$/);
    expect(result).toMatchObject({ props: { initialTab: "handled" } });
  });

  it("passes a failed first load through as a null page", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(me()).mockResolvedValueOnce(json(500, {})));
    expect(await getServerSideProps(ctx())).toMatchObject({ props: { initialPage: null } });
  });

  it("renders inside the admin layout", () => {
    render(<RequestsPage initialTab="new" initialPage={{ items: [], next_cursor: null }} highlightId={null} highlighted={null} />);
    expect(screen.getByRole("navigation", { name: "Administravimas" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Užklausos" })).toBeTruthy();
  });
});
