import type { ReactNode } from "react";

type OnboardingLayoutProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
};

export default function OnboardingLayout({
  title,
  subtitle,
  children,
}: OnboardingLayoutProps) {
  return (
    <main className="min-h-screen bg-bg px-6 py-16 text-textPrimary">
      <div className="mx-auto w-full max-w-text space-y-8">
        <header className="space-y-3 text-center">
          <h1>{title}</h1>
          {subtitle ? <p className="muted">{subtitle}</p> : null}
        </header>

        <section className="rounded-2xl border border-borderSoft bg-white p-8 shadow-soft">
          {children}
        </section>
      </div>
    </main>
  );
}
