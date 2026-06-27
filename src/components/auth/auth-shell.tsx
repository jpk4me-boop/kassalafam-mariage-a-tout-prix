import Link from "next/link";

import { Logo } from "@/components/landing/logo";

type AuthShellProps = {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
};

/**
 * Conteneur premium mobile-first partagé par /login et /register.
 * Reprend la palette crème/chocolat/champagne de la landing.
 */
export function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-12">
      {/* Halos lumineux d'ambiance */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-champagne-400/25 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -right-24 h-96 w-96 rounded-full bg-choco-400/15 blur-3xl"
      />

      <div className="relative w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Link href="/" aria-label="Retour à l'accueil KASSALAFAM">
            <Logo />
          </Link>
        </div>

        <div className="glass rounded-3xl p-6 shadow-card sm:p-8">
          <div className="mb-6 text-center">
            <h1 className="font-serif text-2xl font-semibold text-choco-700 sm:text-3xl">
              {title}
            </h1>
            <p className="mt-2 text-sm text-ink-700/70">{subtitle}</p>
          </div>

          {children}
        </div>

        <p className="mt-6 text-center text-sm text-ink-700/70">{footer}</p>
      </div>
    </main>
  );
}
