import type { GetServerSidePropsContext, Redirect } from "next";
import { serverApiFetch } from "@/lib/admin/serverApi";
import { adminLoginPath } from "@/lib/admin/sessionExpiry";

const SUPERADMIN = "superadmin";

function loginRedirect(path: string): { redirect: Redirect } {
  return { redirect: { destination: adminLoginPath(path), permanent: false } };
}

async function isSuperadmin(cookie: string | undefined): Promise<boolean> {
  try {
    const response = await serverApiFetch("/auth/me", cookie);
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
