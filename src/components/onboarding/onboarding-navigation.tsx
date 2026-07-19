"use client";

import { ArrowLeft, ArrowRight, Loader2, Send } from "lucide-react";

import { PrimaryButton } from "@/components/ui/field";

/**
 * Pied de navigation partagé des étapes 2 à 8 du wizard : bouton retour
 * discret, action principale (Continuer / Envoyer mon profil) avec état de
 * chargement et protection double-clic (désactivation pendant `busy`), et
 * échappatoire « Continuer plus tard » quand le parcours l'autorise.
 * Comportements strictement identiques à l'ancien pied inline du wizard.
 */
export function OnboardingNavigation({
  showBack,
  onBack,
  onNext,
  nextDisabled,
  busy,
  isLastStep,
  canContinueLater,
  onContinueLater,
  continueLaterDisabled,
}: {
  showBack: boolean;
  onBack: () => void;
  onNext: () => void;
  nextDisabled: boolean;
  busy: boolean;
  isLastStep: boolean;
  canContinueLater: boolean;
  onContinueLater: () => void;
  continueLaterDisabled: boolean;
}) {
  return (
    <div className="mt-7 flex flex-col gap-4">
      <div className="flex items-center gap-3">
        {showBack ? (
          <button
            type="button"
            onClick={onBack}
            disabled={busy}
            className="inline-flex items-center justify-center gap-1.5 rounded-full border border-champagne-500/40 bg-cream-50/60 px-5 py-3 text-sm font-medium text-choco-700 transition-colors hover:bg-champagne-400/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-champagne-400/50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <ArrowLeft size={16} />
            Retour
          </button>
        ) : null}

        <PrimaryButton
          type="button"
          onClick={onNext}
          disabled={nextDisabled}
          className="flex-1"
        >
          {busy ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Enregistrement…
            </>
          ) : isLastStep ? (
            <>
              <Send size={16} />
              Envoyer mon profil
            </>
          ) : (
            <>
              Continuer
              <ArrowRight size={16} />
            </>
          )}
        </PrimaryButton>
      </div>

      {canContinueLater ? (
        <div className="flex flex-col items-center gap-1 text-center">
          <button
            type="button"
            onClick={onContinueLater}
            disabled={continueLaterDisabled}
            className="rounded-full px-4 py-2 text-sm font-medium text-choco-700/75 underline-offset-4 transition-colors hover:text-choco-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-champagne-400/50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Continuer plus tard
          </button>
          <p className="text-xs text-ink-700/55">
            Les étapes déjà validées sont enregistrées.
          </p>
        </div>
      ) : null}
    </div>
  );
}
