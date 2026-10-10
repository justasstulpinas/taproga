import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabaseClient } from "@/infra/supabase.client";
import { logout } from "@/services/auth/auth.write";

type Props = {
  onNavigate: (sectionId: string) => void;
  onHeightChange?: (height: number) => void;
  logoutRedirectPath?: string;
  showAuthActions?: boolean;
  pageLabel?: string;
  brandHref?: string;
  tone?: "light" | "dark";
  navItems?: Array<{ id: string; label: string }>;
  /** Nav item for the section currently shown; marked with aria-current. */
  activeNavId?: string;
};

const NAV_ITEMS = [
  { id: "panel-intro", label: "Pradžia" },
  { id: "panel-templates", label: "Šablonai" },
  { id: "panel-pricing", label: "Kainos" },
  { id: "panel-start", label: "Kurti" },
];

export default function KvieciamTopBar({
  onNavigate,
  onHeightChange,
  logoutRedirectPath = "/kvieciam",
  showAuthActions = true,
  pageLabel = "KVIECIAM",
  brandHref = "/",
  tone = "light",
  navItems = NAV_ITEMS,
  activeNavId,
}: Props) {
  const headerRef = useRef<HTMLElement | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authResolved, setAuthResolved] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    if (!onHeightChange) return;
    const element = headerRef.current;
    if (!element) return;

    const reportHeight = () => {
      onHeightChange(element.offsetHeight);
    };

    reportHeight();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => {
        reportHeight();
      });
      observer.observe(element);
      window.addEventListener("resize", reportHeight);
      return () => {
        observer.disconnect();
        window.removeEventListener("resize", reportHeight);
      };
    }

    window.addEventListener("resize", reportHeight);
    return () => {
      window.removeEventListener("resize", reportHeight);
    };
  }, [onHeightChange]);

  useEffect(() => {
    if (!showAuthActions) return;
    let active = true;

    void supabaseClient.auth.getSession().then(({ data }) => {
      if (!active) return;
      setIsAuthenticated(Boolean(data.session));
      setAuthResolved(true);
    });

    const {
      data: { subscription },
    } = supabaseClient.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setIsAuthenticated(Boolean(session));
      setAuthResolved(true);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [showAuthActions]);

  const rightActions = useMemo(() => {
    if (!showAuthActions) {
      return <div className="kvieciam-topbar-actions" aria-hidden="true" />;
    }

    if (!authResolved) {
      return (
        <div className="kvieciam-topbar-actions">
          <span className="kvieciam-topbar-muted">...</span>
        </div>
      );
    }

    if (!isAuthenticated) {
      return (
        <div className="kvieciam-topbar-actions">
          <Link href="/login" className="kvieciam-topbar-link">
            Login
          </Link>
          <Link href="/register" className="kvieciam-topbar-cta">
            Register
          </Link>
        </div>
      );
    }

    return (
      <div className="kvieciam-topbar-actions">
        <Link href="/kvieciam/home" className="kvieciam-topbar-link">
          My Invitations
        </Link>
        <Link href="/kvieciam/home#profile" className="kvieciam-topbar-link">
          Profile
        </Link>
        <button
          type="button"
          onClick={async () => {
            if (isLoggingOut) return;
            setIsLoggingOut(true);
            try {
              await logout();
            } finally {
              window.location.assign(logoutRedirectPath);
            }
          }}
          className="kvieciam-topbar-link"
        >
          {isLoggingOut ? "Logging out..." : "Logout"}
        </button>
      </div>
    );
  }, [
    authResolved,
    isAuthenticated,
    isLoggingOut,
    logoutRedirectPath,
    showAuthActions,
  ]);

  return (
    <header
      ref={headerRef}
      className={`kvieciam-topbar ${
        tone === "dark" ? "kvieciam-topbar-tone-dark" : "kvieciam-topbar-tone-light"
      }`}
    >
      <div className="kvieciam-topbar-main">
        <nav className="kvieciam-topbar-nav">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className="kvieciam-topbar-link"
              aria-current={item.id === activeNavId ? "true" : undefined}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <Link
          href={brandHref}
          className="kvieciam-topbar-brand"
          style={{
            fontFamily: '"Cormorant Garamond", serif',
            textTransform: "uppercase",
          }}
        >
          {`TA PROGA ${pageLabel}`}
        </Link>

        {rightActions}
      </div>
    </header>
  );
}
