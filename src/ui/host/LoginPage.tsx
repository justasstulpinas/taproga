import { useState } from "react";

export type LoginPageProps = {
  error: string | null;
  onLogin: (email: string, password: string) => Promise<void> | void;
};

export function LoginPage({ error, onLogin }: LoginPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    await onLogin(email, password);
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
