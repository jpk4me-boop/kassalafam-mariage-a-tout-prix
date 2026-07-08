import { ONBOARDING_TOTAL_STEPS } from "@/lib/onboarding/completion";

/**
 * Barre de progression du wizard : « Étape N/8 » + pourcentage (exigence 5).
 * `step` est l'indice 1-based de l'étape courante.
 */
export function OnboardingProgress({ step }: { step: number }) {
  const total = ONBOARDING_TOTAL_STEPS;
  const clamped = Math.min(Math.max(step, 1), total);
  const percent = Math.round((clamped / total) * 100);

  return (
    <div className="mb-6">
      <div className="mb-2 flex items-center justify-between text-xs font-medium text-ink-700/70">
        <span>
          Étape {clamped}/{total}
        </span>
        <span className="tabular-nums text-champagne-600">{percent}%</span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-champagne-500/20"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={`Progression de l'inscription : étape ${clamped} sur ${total}`}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-champagne-400 to-choco-500 transition-[width] duration-500 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
