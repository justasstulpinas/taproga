type StepDateProps = {
  weddingDate: string;
  onWeddingDateChange: (value: string) => void;
  onBack: () => void;
  onNext: () => void;
  error: string | null;
};

export default function StepDate({
  weddingDate,
  onWeddingDateChange,
  onBack,
  onNext,
  error,
}: StepDateProps) {
  return (
    <div className="space-y-6">
      <h2 className="text-center">Mūsų šventės data</h2>

      <input
        type="date"
        value={weddingDate}
        onChange={(e) => onWeddingDateChange(e.target.value)}
        className="w-full rounded-[12px] border border-borderSoft bg-white p-4 font-sans"
      />

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-pill border border-borderSoft px-8 py-4 transition-all duration-300 ease-out active:scale-95"
        >
          Atgal
        </button>

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
