"use client";

import { ArrowRight, ListChecks, Sparkles } from "lucide-react";

import { PrimaryButton } from "@/components/ui/field";

/**
 * Écran de reprise du wizard (volet B) — affiché UNIQUEMENT pour un membre qui
 * REVIENT sur un parcours entamé (mode complet, reprise au-delà de l'étape 1).
 * Accueille par le prénom, montre la progression et les étapes restantes, puis
 * renvoie vers les étapes existantes. AUCUNE règle de complétude ici : tout
 * est calculé par le wizard depuis la source de vérité de complétude
 * (lib/onboarding) et reçu en props. Contenu original KASSALAFAM.
 */
export function OnboardingResume({
  firstName,
  completedSteps,
  totalSteps,
  missingLabels,
  onResume,
}: {
  /** Prénom d'accueil ; déjà nettoyé côté serveur (jamais un placeholder). */
  firstName?: string | null;
  completedSteps: number;
  totalSteps: number;
  /** Libellés des étapes restantes, dans l'ordre du parcours (source unique
   *  `ONBOARDING_STEP_LABELS`). Vide = seul l'envoi final manque. */
  missingLabels: string[];
  onResume: () => void;
}) {
  const greeting = firstName ? `Bon retour, ${firstName} !` : "Bon retour !";
  const finalSendOnly = missingLabels.length === 0;
  const remaining = missingLabels.length;
  const percentage = Math.round((completedSteps / totalSteps) * 100);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-champagne-400/20 text-choco-600">
          <Sparkles size={26} />
        </span>
        <h2 className="font-serif text-2xl font-semibold text-choco-700 sm:text-3xl">
          {greeting}
        </h2>
        <p className="max-w-md text-sm text-ink-700/75">
          {finalSendOnly
            ? "Tout est complet : il ne reste que l’envoi de votre profil."
            : remaining === 1
              ? "Votre inscription est bien avancée : il ne vous reste qu’une étape."
              : `Votre inscription est bien avancée : il ne vous reste que ${remaining} étapes.`}
        </p>
      </div>

      {/* Progression — tout ce qui est déjà enregistré est conservé. */}
      <div className="rounded-2xl border border-champagne-500/30 bg-cream-50/60 p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-choco-700">
            {completedSteps} étape{completedSteps > 1 ? "s" : ""} sur{" "}
            {totalSteps} déjà complétée{completedSteps > 1 ? "s" : ""}
          </span>
          <span className="text-ink-700/60">{percentage} %</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-champagne-400/20">
          <div
            className="h-full rounded-full bg-choco-600 transition-all"
            style={{ width: `${percentage}%` }}
            aria-hidden
          />
        </div>
      </div>

      {finalSendOnly ? null : (
        <div className="flex items-start gap-3 rounded-2xl border border-champagne-500/30 bg-cream-50/60 p-4">
          <ListChecks size={18} className="mt-0.5 shrink-0 text-choco-600" />
          <span className="text-sm text-ink-700/80">
            Reste à compléter : {missingLabels.join(", ")}.
          </span>
        </div>
      )}

      <PrimaryButton type="button" onClick={onResume}>
        {finalSendOnly ? "Envoyer mon profil" : "Reprendre où j’en étais"}
        <ArrowRight size={16} />
      </PrimaryButton>

      <p className="text-center text-xs text-ink-700/55">
        Tout ce que vous aviez renseigné a été conservé.
      </p>
    </div>
  );
}
