type StepNamesProps = {
  brideName: string;
  groomName: string;
  onBrideNameChange: (value: string) => void;
  onGroomNameChange: (value: string) => void;
  onNext: () => void;
  error: string | null;
};

export default function StepNames({
  brideName,
  groomName,
  onBrideNameChange,
  onGroomNameChange,
  onNext,
  error,
}: StepNamesProps) {
  return (
    <div className="space-y-6">
      <h2 className="text-center">Kas tuokiasi?</h2>

      <div className="grid gap-4">
        <input
          type="text"
          value={brideName}
          onChange={(e) => onBrideNameChange(e.target.value)}
          placeholder="Nuotakos vardas"
          className="w-full rounded-[12px] border border-borderSoft bg-white p-4 font-sans"
        />

        <input
          type="text"
          value={groomName}
          onChange={(e) => onGroomNameChange(e.target.value)}
          placeholder="Jaunikio vardas"
          className="w-full rounded-[12px] border border-borderSoft bg-white p-4 font-sans"
        />
      </div>

      <div className="rounded-2xl border border-borderSoft bg-bg p-6 text-center">
        <p className="font-serif text-[clamp(1.5rem,2.4vw,2.2rem)] uppercase tracking-[0.12em]">
          {(brideName || "Nuotaka").trim()} & {(groomName || "Jaunikis").trim()}
        </p>
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onNext}
          className="rounded-pill bg-action px-10 py-4 text-white transition-all duration-300 ease-out hover:bg-actionActive active:scale-95"
        >
          Toliau
        </button>
      </div>
    </div>
  );
}
