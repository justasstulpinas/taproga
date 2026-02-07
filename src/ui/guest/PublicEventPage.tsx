import { EventPublic } from "@/src/domain/event/event.types";
import { Countdown } from "@/src/ui/components/Countdown";

export type PublicEventPageProps = {
  event: EventPublic;
  formattedDate: string;
  verifiedName: string | null;
  inputName: string;
  inputPhrase: string;
  error: string | null;
  lockedOut: boolean;
  onInputNameChange: (value: string) => void;
  onInputPhraseChange: (value: string) => void;
  onVerifySubmit: (e: React.FormEvent) => void;
};

export function PublicEventPage({
  event,
  formattedDate,
  verifiedName,
  inputName,
  inputPhrase,
  error,
  lockedOut,
  onInputNameChange,
  onInputPhraseChange,
  onVerifySubmit,
}: PublicEventPageProps) {
  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      {!verifiedName ? (
        <form onSubmit={onVerifySubmit} className="w-full max-w-sm text-center">
          <h1 className="text-2xl font-semibold mb-4">Enter your details</h1>

          <input
            type="text"
            value={inputName}
            onChange={(e) => onInputNameChange(e.target.value)}
            className="w-full border px-3 py-2 mb-3"
            placeholder="Your full name"
            disabled={lockedOut}
            required
          />

          <input
            type="text"
            value={inputPhrase}
            onChange={(e) => onInputPhraseChange(e.target.value)}
            className="w-full border px-3 py-2 mb-3"
            placeholder="Verification phrase"
            disabled={lockedOut}
            required
          />

          {error && <p className="text-sm text-red-600 mb-2">{error}</p>}

          {lockedOut && (
            <p className="text-sm text-red-600 mb-2">
              Too many attempts. Restart your session.
            </p>
          )}

          <button
            type="submit"
            className="w-full bg-black text-white py-2"
            disabled={lockedOut}
          >
            Continue
          </button>
        </form>
      ) : (
        <div className="text-center">
          <h1 className="text-3xl font-semibold mb-4">{event.title}</h1>
          <p className="text-lg">{formattedDate}</p>
          <Countdown eventDate={event.event_date} />
        </div>
      )}
    </main>
  );
}
