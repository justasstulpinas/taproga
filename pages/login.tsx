import { useState } from "react";
import { useRouter } from "next/router";
import { signInWithPassword } from "@/services/auth/auth.write";
import { ServiceError } from "@/shared/errors";

function getErrorMessage(error: unknown) {
  return error instanceof ServiceError ? error.message : "Something went wrong";
}

export default function Login() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();

    try {
      const data = await signInWithPassword(email, password);
      console.log("LOGIN RESULT", { data, error: null });

      const returnTo =
        typeof router.query.returnTo === "string"
          ? router.query.returnTo
          : "/host";

      router.push(returnTo);
    } catch (err: unknown) {
      console.log("LOGIN RESULT", { data: null, error: err });

      const message = getErrorMessage(err);
      setError(message);
      alert(message);
    }
  }

  return (
    <form onSubmit={handleLogin}>
      <h1>Login</h1>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <input
        type="email"
        placeholder="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        type="password"
        placeholder="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <button type="submit">Login</button>
    </form>
  );
}
