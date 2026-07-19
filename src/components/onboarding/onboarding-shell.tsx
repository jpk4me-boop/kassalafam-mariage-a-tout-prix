import Link from "next/link";

import { Logo } from "@/components/landing/logo";
import { ProgressHeader } from "@/components/onboarding/progress-header";

/**
 * Cadre visuel partagé du parcours d'onboarding : fond crème avec halos
 * champagne/chocolat, colonne de lecture centrée (max-w-lg) et carte `glass`
 * unique — les phases (intro, étapes, confirmation, Mode B) n'ont plus à
 * répéter le wrapper.
 *
 * `progressStep` fourni → l'en-tête de progression collant (logo + Étape X
 * sur 8 + barre) remplace le logo centré des phases sans progression.
 * `overflow-clip` (et non `hidden`) contient les halos sans créer de contexte
 * de défilement, ce qui préserve le comportement `sticky` de l'en-tête.
 */
export function OnboardingShell({
  children,
  progressStep,
}: {
  children: React.ReactNode;
  progressStep?: number;
}) {
  return (
    <main className="relative flex min-h-dvh flex-col overflow-clip">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-champagne-400/25 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -right-24 h-96 w-96 rounded-full bg-choco-400/15 blur-3xl"
      />

      {progressStep != null ? <ProgressHeader step={progressStep} /> : null}

      <div className="relative flex flex-1 flex-col items-center justify-center px-4 py-10 sm:py-12">
        <div className="w-full max-w-lg">
          {progressStep == null ? (
            <div className="mb-8 flex justify-center">
              <Link href="/" aria-label="Retour à l'accueil KASSALAFAM">
                <Logo />
              </Link>
            </div>
          ) : null}
          <div className="glass rounded-3xl p-6 shadow-card sm:p-8">
            {children}
          </div>
        </div>
      </div>
    </main>
  );
}
