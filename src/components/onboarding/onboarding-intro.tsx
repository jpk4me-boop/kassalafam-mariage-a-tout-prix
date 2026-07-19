"use client";

import { ArrowRight, HeartHandshake, Lock, Sparkles } from "lucide-react";

import { PrimaryButton } from "@/components/ui/field";

/**
 * Écran d'introduction du wizard — affiché UNIQUEMENT pour un nouveau profil
 * incomplet (exigence 4). Accueille le membre par son prénom si disponible,
 * présente en quelques mots le déroulé et rassure sur la confidentialité, puis
 * lance le parcours. Contenu original KASSALAFAM.
 */
export function OnboardingIntro({
  firstName,
  onStart,
}: {
  /** Prénom d'accueil ; déjà nettoyé côté serveur (jamais un placeholder). */
  firstName?: string | null;
  onStart: () => void;
}) {
  const greeting = firstName ? `Bienvenue, ${firstName} !` : "Bienvenue !";

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
          Quelques étapes simples pour vous présenter avec sincérité. Tout est
          enregistré au fur et à mesure : vous pourrez reprendre à tout moment.
        </p>
      </div>

      <ul className="flex flex-col gap-3">
        <li className="flex items-start gap-3 rounded-2xl border border-champagne-500/30 bg-cream-50/60 p-4">
          <HeartHandshake size={18} className="mt-0.5 shrink-0 text-choco-600" />
          <span className="text-sm text-ink-700/80">
            Huit étapes courtes : votre identité, votre situation et votre projet
            de foyer.
          </span>
        </li>
        <li className="flex items-start gap-3 rounded-2xl border border-champagne-500/30 bg-cream-50/60 p-4">
          <Lock size={18} className="mt-0.5 shrink-0 text-choco-600" />
          <span className="text-sm text-ink-700/80">
            Vos photos restent privées et floutées par défaut. Vous gardez la
            main sur ce que vous partagez.
          </span>
        </li>
      </ul>

      <PrimaryButton type="button" onClick={onStart}>
        Créer mon profil
        <ArrowRight size={16} />
      </PrimaryButton>
    </div>
  );
}
