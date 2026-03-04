import { useMemo } from "react";

type StepLocationProps = {
  venueName: string;
  venueAddress: string;
  onVenueNameChange: (value: string) => void;
  onVenueAddressChange: (value: string) => void;
  onBack: () => void;
  onFinish: () => void;
  saving: boolean;
  error: string | null;
};

export default function StepLocation({
  venueName,
  venueAddress,
  onVenueNameChange,
  onVenueAddressChange,
  onBack,
  onFinish,
  saving,
  error,
}: StepLocationProps) {
  const mapUrl = useMemo(() => {
    const trimmed = venueAddress.trim();
    if (!trimmed) {
      return "";
    }

    return `https://www.google.com/maps?q=${encodeURIComponent(
      trimmed
    )}&z=15&output=embed`;
  }, [venueAddress]);

  return (
    <div className="space-y-6">
      <h2 className="text-center">Mes susituoksime</h2>

      <div className="grid gap-4">
        <input
          type="text"
          value={venueName}
          onChange={(e) => onVenueNameChange(e.target.value)}
          placeholder="Vietos pavadinimas"
          className="w-full rounded-[12px] border border-borderSoft bg-white p-4 font-sans"
        />

        <input
          type="text"
          value={venueAddress}
          onChange={(e) => onVenueAddressChange(e.target.value)}
          placeholder="Adresas"
          className="w-full rounded-[12px] border border-borderSoft bg-white p-4 font-sans"
        />
      </div>

      {mapUrl ? (
        <div className="overflow-hidden rounded-2xl border border-borderSoft">
          <iframe
            title="Venue map preview"
            src={mapUrl}
            className="h-72 w-full"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      ) : null}

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={saving}
          className="rounded-pill border border-borderSoft px-8 py-4 transition-all duration-300 ease-out active:scale-95 disabled:opacity-50"
        >
          Atgal
        </button>

        <button
          type="button"
          onClick={onFinish}
          disabled={saving}
          className="rounded-pill bg-action px-10 py-4 text-white transition-all duration-300 ease-out hover:bg-actionActive active:scale-95 disabled:opacity-50"
        >
          {saving ? "Kuriama..." : "Sukurti kvietimą"}
        </button>
      </div>
    </div>
  );
}
