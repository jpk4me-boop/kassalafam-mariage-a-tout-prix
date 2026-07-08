"use client";

import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";

/**
 * Écran final « Profil envoyé » (exigence : Confirmation). Le membre poursuit
 * ensuite vers la destination initialement demandée (ou /dashboard).
 */
export function OnboardingConfirmation({
  onContinue,
  busy,
}: {
  onContinue: () => void;
  busy?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-5 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-600/12 text-emerald-600">
        <CheckCircle2 size={34} />
      </span>
      <div>
        <h2 className="font-serif text-2xl font-semibold text-choco-700 sm:text-3xl">
          Profil envoyé
        </h2>
        <p className="mt-2 max-w-md text-sm text-ink-700/75">
          Merci ! Votre profil a bien été enregistré. Il sera examiné avant sa
          mise en relation. Vous pouvez dès maintenant accéder à votre espace.
        </p>
      </div>

      <button
        type="button"
        onClick={onContinue}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-br from-choco-600 to-choco-800 px-6 py-3 text-sm font-semibold text-cream-50 shadow-[0_14px_34px_-14px_rgba(43,26,18,0.85)] ring-1 ring-inset ring-champagne-400/30 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
      >
        {busy ? (
          <>
            <Loader2 size={18} className="animate-spin" />
            Redirection…
          </>
        ) : (
          <>
            Accéder à mon espace
            <ArrowRight size={16} />
          </>
        )}
      </button>
    </div>
  );
}
