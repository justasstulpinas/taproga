import Link from "next/link";
import { useRouter } from "next/router";
import { useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api/client";
import { adminLt } from "@/lib/i18n/admin.lt";

const copy = adminLt.nav;

const NAV_ITEMS = [
  { href: "/admin/vaises/uzklausos", label: copy.requests },
  { href: "/admin/vaises/datos", label: copy.dates },
] as const;

const TARGET_CLASS =
  "inline-flex min-h-[2.95rem] items-center px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-dark)]";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signOut() {
    setSigningOut(true);
    setError(null);
    try {
      await apiFetch<void>("/auth/logout", { method: "POST" });
      await router.push("/admin/login");
    } catch {
      setError(copy.signOutFailed);
      setSigningOut(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg-main)] text-[var(--text-primary)]">
      <header className="border-b border-[var(--line-soft)]">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-2 px-4">
          <span className="mr-2 text-lg">{adminLt.brand}</span>
          <nav aria-label={copy.label} className="flex flex-1 flex-wrap">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={router.pathname === item.href ? "page" : undefined}
                className={`${TARGET_CLASS} ${router.pathname === item.href ? "underline underline-offset-4" : "text-[var(--text-secondary)]"}`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <button type="button" onClick={signOut} disabled={signingOut} className={`${TARGET_CLASS} disabled:opacity-50`}>
            {signingOut ? copy.signingOut : copy.signOut}
          </button>
        </div>
        {error && (
          <p role="alert" className="mx-auto max-w-5xl px-4 pb-2 text-sm">
            {error}
          </p>
        )}
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
