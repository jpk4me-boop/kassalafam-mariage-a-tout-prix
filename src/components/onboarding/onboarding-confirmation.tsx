"use client";

import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  Compass,
  Loader2,
  MessageCircle,
} from "lucide-react";

import { PrimaryButton } from "@/components/ui/field";

/**
 * Écran final « Profil envoyé » (exigence : Confirmation). Le membre poursuit
 * ensuite vers la destination initialement demandée (ou /dashboard).
 *
 * PARTI PRIS : on explique CE QUI SE PASSE ensuite (examen à la main,
 * notification WhatsApp/email, exploration en attendant) mais on ne promet
 * AUCUN délai chiffré — aucune durée n'a été validée par l'équipe.
 */

const NEXT_STEPS = [
  {
    icon: BadgeCheck,
    title: "Examen à la main",
    description:
      "Chaque profil est vérifié par notre équipe avant d'être proposé aux autres membres.",
  },
  {
    icon: MessageCircle,
    title: "Vous serez prévenu(e)",
    description:
      "Un message WhatsApp ou un email vous informera dès la validation de votre profil.",
  },
  {
    icon: Compass,
    title: "Explorez en attendant",
    description:
      "Votre espace est déjà ouvert : découvrez la plateforme et peaufinez votre profil.",
  },
];

export function OnboardingConfirmation({
  onContinue,
  busy,
}: {
  onContinue: () => void;
  busy?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-600/12 text-emerald-600">
        <CheckCircle2 size={34} />
      </span>
      <div>
        <h2 className="font-serif text-2xl font-semibold text-choco-700 sm:text-3xl">
          Profil envoyé !
        </h2>
        <p className="mt-2 max-w-md text-sm text-ink-700/75">
          Merci de votre confiance. Voici ce qui se passe maintenant :
        </p>
      </div>

      <ul className="flex w-full max-w-md flex-col gap-2.5 text-left">
        {NEXT_STEPS.map((step) => (
          <li
            key={step.title}
            className="flex items-start gap-3 rounded-2xl border border-champagne-500/25 bg-cream-100/50 px-4 py-3"
          >
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-champagne-400/20 text-choco-600">
              <step.icon size={16} />
            </span>
            <span>
              <span className="block text-sm font-semibold text-choco-700">
                {step.title}
              </span>
              <span className="block text-xs leading-relaxed text-ink-700/70">
                {step.description}
              </span>
            </span>
          </li>
        ))}
      </ul>

      <PrimaryButton type="button" onClick={onContinue} disabled={busy}>
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
      </PrimaryButton>
    </div>
  );
}
