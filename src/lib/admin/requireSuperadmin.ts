import type { GetServerSidePropsContext, Redirect } from "next";

const SUPERADMIN = "superadmin";
const LOGIN_PATH = "/admin/login";

function apiOrigin(): string {
  return process.env.API_ORIGIN ?? "http://localhost:8000";
}

function loginRedirect(path: string): { redirect: Redirect } {
  return {
    redirect: { destination: `${LOGIN_PATH}?next=${encodeURIComponent(path)}`, permanent: false },
  };
}

async function isSuperadmin(cookie: string | undefined): Promise<boolean> {
  try {
    const response = await fetch(`${apiOrigin()}/api/v1/auth/me`, {
      headers: { accept: "application/json", ...(cookie ? { cookie } : {}) },
    });
    if (response.status !== 200) return false;
    const user = (await response.json()) as { account_type?: string };
    return user.account_type === SUPERADMIN;
  } catch {
    return false;
  }
}

export async function requireSuperadmin(
  ctx: GetServerSidePropsContext,
): Promise<{ redirect: Redirect } | { props: Record<string, never> }> {
  if (await isSuperadmin(ctx.req.headers.cookie)) return { props: {} };
  return loginRedirect(ctx.resolvedUrl);
}
