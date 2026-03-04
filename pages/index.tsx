import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-bg px-6 py-16 text-textPrimary">
      <div className="mx-auto flex w-full max-w-layout flex-col items-center justify-center gap-8 text-center">
        <h1>Ta Proga</h1>
        <p className="max-w-text">
          Elegantiški vestuvių kvietimai su panel builder sistema.
        </p>

        <Link
          href="/register"
          className="rounded-pill bg-action px-10 py-4 text-white transition-all duration-300 ease-out hover:bg-actionActive active:scale-95"
        >
          Register
        </Link>
      </div>
    </main>
  );
}
