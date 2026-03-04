import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { signInWithPassword, signUpWithPassword } from "@/services/auth/auth.write";
import { supabaseClient } from "@/infra/supabase.client";
import { ServiceError } from "@/shared/errors";

function getErrorMessage(error: unknown) {
  return error instanceof ServiceError ? error.message : "Something went wrong";
}

export default function Register() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void supabaseClient.auth.getSession().then(({ data }) => {
      if (data.session) {
        window.location.assign("/host");
      }
    });
  }, []);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Slaptažodžiai nesutampa.");
      return;
    }

    if (password.length < 6) {
      setError("Slaptažodis turi būti bent 6 simbolių.");
      return;
    }

    setLoading(true);

    try {
      const result = await signUpWithPassword(email, password);

      if (!result.session) {
        await signInWithPassword(email, password);
      }

      window.location.assign("/host");
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-bg px-6 py-16 text-textPrimary">
      <div className="mx-auto w-full max-w-text space-y-8 text-center">
        <h1>Register</h1>
        <p className="muted">Sukurkite paskyrą su el. paštu ir slaptažodžiu.</p>

        <form
          onSubmit={handleRegister}
          className="rounded-2xl border border-borderSoft bg-white p-8 shadow-soft"
        >
          <div className="grid gap-4">
            <input
              type="email"
              placeholder="El. paštas"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-[12px] border border-borderSoft bg-white p-4 font-sans"
              required
            />

            <input
              type="password"
              placeholder="Slaptažodis"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-[12px] border border-borderSoft bg-white p-4 font-sans"
              required
            />

            <input
              type="password"
              placeholder="Pakartokite slaptažodį"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-[12px] border border-borderSoft bg-white p-4 font-sans"
              required
            />

            <button
              type="submit"
              disabled={loading}
              className="rounded-pill bg-action px-10 py-4 text-white transition-all duration-300 ease-out hover:bg-actionActive active:scale-95 disabled:opacity-50"
            >
              {loading ? "Registruojama..." : "Registruotis"}
            </button>
          </div>

          {error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null}
        </form>

        <button
          type="button"
          onClick={() => {
            void router.push("/login");
          }}
          className="rounded-pill border border-borderSoft px-8 py-3 text-sm transition-all duration-300 ease-out active:scale-95"
        >
          Jau turi paskyrą? Prisijungti
        </button>
      </div>
    </main>
  );
}
