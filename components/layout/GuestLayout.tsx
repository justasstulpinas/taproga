import type { ReactNode } from "react";

type GuestLayoutProps = {
  children: ReactNode;
};

export default function GuestLayout({ children }: GuestLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col bg-bg text-textPrimary">
      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-layout">{children}</div>
      </main>
    </div>
  );
}
