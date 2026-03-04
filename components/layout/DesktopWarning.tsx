import { useEffect, useState } from "react";

export default function DesktopWarning() {
  const [isDesktop, setIsDesktop] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    function handleResize() {
      setIsDesktop(window.innerWidth >= 1024);
    }

    handleResize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  if (!isDesktop || dismissed) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6">
      <div className="w-full max-w-xl rounded-2xl bg-white p-12 text-center shadow-soft">
        <p className="muted mb-4">Desktop warning</p>
        <h2 className="mb-4">This invitation is designed for mobile experience.</h2>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="bg-action text-white px-10 py-4 rounded-pill transition-all duration-300 ease-out active:scale-95 hover:bg-actionActive"
        >
          Continue anyway
        </button>
      </div>
    </div>
  );
}
