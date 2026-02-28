import { createServerClient } from "@supabase/ssr";
import { parse, serialize } from "cookie";
import type { GetServerSidePropsContext } from "next";
import { ENV } from "@/shared/env";

type ServerContext = Pick<GetServerSidePropsContext, "req" | "res">;

function appendSetCookieHeaders(ctx: ServerContext, cookies: string[]): void {
  const previous = ctx.res.getHeader("Set-Cookie");
  const current = Array.isArray(previous)
    ? previous.map(String)
    : previous
    ? [String(previous)]
    : [];

  ctx.res.setHeader("Set-Cookie", [...current, ...cookies]);
}

function getRequestCookies(
  ctx: ServerContext
): Array<{ name: string; value: string }> {
  const header = ctx.req.headers.cookie ?? "";
  const parsed = parse(header);

  return Object.entries(parsed).map(([name, value]) => ({
    name,
    value: value ?? "",
  }));
}

export function createSupabaseServerClient(ctx: ServerContext) {
  return createServerClient(ENV.SUPABASE_URL, ENV.SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return getRequestCookies(ctx);
      },
      setAll(cookiesToSet) {
        appendSetCookieHeaders(
          ctx,
          cookiesToSet.map(({ name, value, options }) =>
            serialize(name, value, { path: "/", ...options })
          )
        );
      },
    },
  });
}
