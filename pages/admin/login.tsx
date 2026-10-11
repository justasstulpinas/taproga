import Head from "next/head";
import { useRouter } from "next/router";
import { useState, type FormEvent } from "react";
import { apiFetch } from "@/lib/api/client";
import { ApiError, messageFor } from "@/lib/api/errors";
import { safeNext } from "@/lib/admin/safeNext";
import { adminLt } from "@/lib/i18n/admin.lt";

const copy = adminLt.login;

function loginErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "INVALID_CREDENTIALS" || error.code === "EMAIL_NOT_VERIFIED") {
      return copy.invalidCredentials;
    }
    if (error.code === "RATE_LIMITED") return copy.rateLimited;
  }
  return messageFor(error);
}

const FIELD_CLASS =
  "min-h-[2.95rem] w-full rounded-[var(--radius-md)] border border-[var(--line-strong)] bg-white px-[var(--control-pad-x)] text-base text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-dark)]";

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
      await apiFetch("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
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
      <main className="flex min-h-screen items-center justify-center bg-[var(--bg-main)] px-4 py-8 text-[var(--text-primary)]">
        <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4" noValidate>
          <h1 className="text-2xl">{copy.title}</h1>
          <div className="space-y-2">
            <label htmlFor="admin-email" className="block text-sm text-[var(--text-secondary)]">
              {copy.email}
            </label>
            <input
              id="admin-email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={FIELD_CLASS}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="admin-password" className="block text-sm text-[var(--text-secondary)]">
              {copy.password}
            </label>
            <input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={FIELD_CLASS}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-[var(--text-primary)]">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="min-h-[2.95rem] w-full rounded-[var(--radius-md)] bg-[var(--accent-dark)] px-[var(--button-pad-x)] text-base text-[var(--bg-main)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-dark)] disabled:opacity-50"
          >
            {submitting ? copy.submitting : copy.submit}
          </button>
        </form>
      </main>
    </>
  );
}
