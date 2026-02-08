import type { FormEvent } from "react";

export type GuestVerificationFormProps = {
  inputName: string;
  inputPhrase: string;
  error: string | null;
  lockedOut: boolean;
  onNameChange: (value: string) => void;
  onPhraseChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
};

export function GuestVerificationForm({
  inputName,
  inputPhrase,
  error,
  lockedOut,
  onNameChange,
  onPhraseChange,
  onSubmit,
}: GuestVerificationFormProps) {
  return (
    <form onSubmit={onSubmit} className="w-full max-w-sm text-center">
      <h1 className="text-2xl font-semibold mb-4">Enter your details</h1>

      <input
        type="text"
        value={inputName}
        onChange={(e) => onNameChange(e.target.value)}
        className="w-full border px-3 py-2 mb-3"
        placeholder="Your full name"
        disabled={lockedOut}
        required
      />

      <input
        type="text"
        value={inputPhrase}
        onChange={(e) => onPhraseChange(e.target.value)}
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
  );
}
