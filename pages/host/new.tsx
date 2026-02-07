import { useState } from "react";
import { useRouter } from "next/router";
import { HostNewEventPage } from "@/src/ui/host/HostNewEventPage";
import { createEvent } from "@/src/services/event/event.write";
import { getNewEventValidationError } from "@/src/domain/event/event.rules";
import { NewEventInput } from "@/src/domain/event/event.types";
import { ServiceError } from "@/src/shared/errors";

function getErrorMessage(error: unknown) {
  return error instanceof ServiceError ? error.message : "Something went wrong";
}

export default function NewEventPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(input: NewEventInput) {
    const validationError = getNewEventValidationError(input);
    if (validationError) {
      setError(validationError);
      alert(validationError);
      return;
    }

    try {
      const { slug, draftToken } = await createEvent(input);
      router.replace(`/e/${slug}?draft=${draftToken}`);
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      alert(message);
    }
  }

  return <HostNewEventPage error={error} onCreate={handleCreate} />;
}
