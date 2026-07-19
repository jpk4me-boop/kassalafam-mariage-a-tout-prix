import Link from "next/link";

import { ONBOARDING_TOTAL_STEPS } from "@/lib/onboarding/completion";
import { Logo } from "@/components/landing/logo";

/**
 * En-tête de progression du wizard, collant en haut de l'écran : identité
 * KASSALAFAM + « Étape X sur 8 » + pourcentage réel (12,5 % par étape) + barre.
 * Le pourcentage est calculé depuis l'étape réelle — jamais dupliqué à la main
 * dans les écrans. L'information est portée par le texte ET la barre (jamais
 * par la couleur seule) ; l'animation de largeur respecte
 * `prefers-reduced-motion` via `motion-safe`.
 */
export function ProgressHeader({ step }: { step: number }) {
  const total = ONBOARDING_TOTAL_STEPS;
  const clamped = Math.min(Math.max(step, 1), total);
  const percent = (clamped / total) * 100;
  const percentLabel = `${percent.toLocaleString("fr-FR", {
    maximumFractionDigits: 1,
  })} %`;

  return (
    <header className="sticky top-0 z-40 border-b border-champagne-500/20 bg-cream-50/85 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-2.5 px-4 py-3 sm:px-0">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" aria-label="Retour à l'accueil KASSALAFAM">
            <Logo className="[&_span]:text-sm" />
          </Link>
          <p className="flex items-baseline gap-2 text-xs font-medium text-ink-700/70">
            <span>
              Étape {clamped} sur {total}
            </span>
            <span aria-hidden>·</span>
            <span className="font-semibold tabular-nums text-champagne-600">
              {percentLabel}
            </span>
          </p>
        </div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-valuetext={percentLabel}
          aria-label={`Progression de l'inscription : étape ${clamped} sur ${total}`}
          className="h-2 w-full overflow-hidden rounded-full bg-champagne-500/20"
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-champagne-400 to-choco-500 ease-out motion-safe:transition-[width] motion-safe:duration-500"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    </header>
  );
}
