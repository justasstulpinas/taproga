import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { HostNewEventPage } from "@/ui/host/HostNewEventPage";
import { createEvent } from "@/services/event/event.write";
import { NewEventInput } from "@/domain/event/event.types";
import { getSession } from "@/services/auth/auth.read";
import { ServiceError } from "@/shared/errors";

function getErrorMessage(error: unknown) {
  return error instanceof ServiceError ? error.message : "Something went wrong";
}

export default function NewEventPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function ensureAuthenticatedHost() {
      try {
        const session = await getSession();
        if (!session || !session.user.email) {
          router.replace("/login");
          return;
        }
      } catch (err: unknown) {
        if (isMounted) {
          setError(getErrorMessage(err));
        }
        return;
      } finally {
        if (isMounted) {
          setCheckingAuth(false);
        }
      }
    }

    ensureAuthenticatedHost();

    return () => {
      isMounted = false;
    };
  }, [router]);

  async function handleCreate(input: NewEventInput) {
    setError(null);

    try {
      const created = await createEvent(input);
      await router.replace(`/host/events/${created.id}`);
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      setError(message);
      alert(message);
    }
  }

  if (checkingAuth) {
    return <main className="p-6">Checking authentication...</main>;
  }

  return <HostNewEventPage error={error} onCreate={handleCreate} />;
}
