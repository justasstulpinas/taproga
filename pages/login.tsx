import { useState } from "react";
import { useRouter } from "next/router";
import { LoginPage } from "@/ui/host/LoginPage";
import { signInWithPassword } from "@/services/auth/auth.write";
import { ServiceError } from "@/shared/errors";

function getErrorMessage(error: unknown) {
  return error instanceof ServiceError ? error.message : "Something went wrong";
}

export default function Login() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function handleLogin(email: string, password: string) {
    try {
      const data = await signInWithPassword(email, password);
      console.log("LOGIN RESULT", { data, error: null });

      router.replace("/host");
    } catch (err: unknown) {
      console.log("LOGIN RESULT", { data: null, error: err });

      const message = getErrorMessage(err);
      setError(message);
      alert(message);
    }
  }

  return <LoginPage error={error} onLogin={handleLogin} />;
}
