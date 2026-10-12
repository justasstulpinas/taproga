import Head from "next/head";
import { useRouter } from "next/router";
import { useState, type FormEvent } from "react";
import { apiFetch } from "@/lib/api/client";
import { ApiError, messageFor } from "@/lib/api/errors";
import { safeNext } from "@/lib/admin/safeNext";
import { adminLt } from "@/lib/i18n/admin.lt";

const copy = adminLt.login;
const SUPERADMIN = "superadmin";

type LoginOut = { user: { account_type: string } };

function loginErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "INVALID_CREDENTIALS" || error.code === "EMAIL_NOT_VERIFIED") {
      return copy.invalidCredentials;
    }
    if (error.code === "RATE_LIMITED") return copy.rateLimited;
  }
  return messageFor(error);
}

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const { user } = await apiFetch<LoginOut>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      if (user.account_type !== SUPERADMIN) {
        // Valid credentials for a regular account: don't leave it signed in on the admin site.
        await apiFetch<void>("/auth/logout", { method: "POST" }).catch(() => undefined);
        setError(copy.notSuperadmin);
        setSubmitting(false);
        return;
      }
      await router.push(safeNext(router.query.next));
    } catch (caught) {
      setError(loginErrorMessage(caught));
      setSubmitting(false);
    }
  }

  return (
    <>
      <Head>
        <title>{copy.title}</title>
        <meta name="robots" content="noindex" />
      </Head>
      <main className="admin-root admin-login">
        <form onSubmit={onSubmit} className="admin-login-form" noValidate>
          <h1 className="admin-login-title">{copy.title}</h1>
          <div className="admin-field">
            <label htmlFor="admin-email" className="admin-label">
              {copy.email}
            </label>
            <input
              id="admin-email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="admin-input"
            />
          </div>
          <div className="admin-field">
            <label htmlFor="admin-password" className="admin-label">
              {copy.password}
            </label>
            <input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="admin-input"
            />
          </div>
          {error && (
            <p role="alert" className="admin-alert">
              {error}
            </p>
          )}
          <button type="submit" disabled={submitting} className="admin-btn admin-btn--primary admin-btn--full">
            {submitting ? copy.submitting : copy.submit}
          </button>
        </form>
      </main>
    </>
  );
}
