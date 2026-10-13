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
    <div className="admin-root">
      <header className="admin-header">
        <div className="admin-header-inner">
          <span className="admin-brand">{adminLt.brand}</span>
          <nav aria-label={copy.label} className="admin-nav">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={router.pathname === item.href ? "page" : undefined}
                className="admin-nav-link"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <button type="button" onClick={signOut} disabled={signingOut} className="admin-link-btn">
            {signingOut ? copy.signingOut : copy.signOut}
          </button>
        </div>
        {error && (
          <p role="alert" className="admin-header-error">
            {error}
          </p>
        )}
      </header>
      <main className="admin-main">{children}</main>
    </div>
  );
}
