import type { GetServerSidePropsContext } from "next";
import { afterEach, describe, expect, it, vi } from "vitest";
import { requireSuperadmin } from "@/lib/admin/requireSuperadmin";

function ctx(resolvedUrl = "/admin/vaises/datos", cookie?: string) {
  return {
    resolvedUrl,
    req: { headers: cookie ? { cookie } : {} },
  } as unknown as GetServerSidePropsContext;
}

function stubMe(status: number, body: unknown = {}) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("requireSuperadmin", () => {
  it("returns props for a superadmin", async () => {
    stubMe(200, { account_type: "superadmin" });
    expect(await requireSuperadmin(ctx())).toEqual({ props: {} });
  });

  it("redirects to login with the encoded current path on 401", async () => {
    stubMe(401);
    expect(await requireSuperadmin(ctx("/admin/vaises/uzklausos?id=a b"))).toEqual({
      redirect: {
        destination: "/admin/login?next=%2Fadmin%2Fvaises%2Fuzklausos%3Fid%3Da%20b",
        permanent: false,
      },
    });
  });

  it("redirects a signed-in non-superadmin", async () => {
    stubMe(200, { account_type: "newlywed" });
    expect(await requireSuperadmin(ctx())).toHaveProperty("redirect");
  });

  it("redirects when the API is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    expect(await requireSuperadmin(ctx())).toHaveProperty("redirect");
  });

  it("forwards the cookie header to the API me endpoint", async () => {
    const fetchMock = stubMe(200, { account_type: "superadmin" });
    await requireSuperadmin(ctx("/admin/vaises/datos", "session=abc"));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/auth\/me$/);
    expect((init as RequestInit).headers).toMatchObject({ cookie: "session=abc" });
  });
});
