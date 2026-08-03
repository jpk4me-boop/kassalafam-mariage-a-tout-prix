/**
 * Relance des onboardings inachevés — helpers PURS (aucun accès DB, aucun
 * secret). Réutilise la source de vérité UNIQUE de complétude
 * (`computeStepCompletion` / `firstIncompleteStep`,
 * src/lib/onboarding/completion.ts) : AUCUNE règle de complétude dupliquée ici.
 */
import {
  computeStepCompletion,
  firstIncompleteStep,
  ONBOARDING_TOTAL_STEPS,
  type OnboardingProfileData,
  type OnboardingStep,
} from "@/lib/onboarding/completion";

/** Libellés back-office des 8 étapes du wizard (même ordre que le parcours). */
export const ONBOARDING_STEP_LABELS: Record<OnboardingStep, string> = {
  1: "Source d’inscription",
  2: "Identité",
  3: "Date de naissance",
  4: "Situation & religion",
  5: "Profession & études",
  6: "Localisation",
  7: "Projet matrimonial",
  8: "Photos",
};

export type RelanceContact =
  | { channel: "whatsapp"; value: string; href: string }
  | { channel: "email"; value: string; href: string }
  | { channel: "none" };

/**
 * Canal de relance : WhatsApp d'abord (collecté depuis la migration
 * 20260802090000, donc souvent absent des inscriptions antérieures), sinon
 * l'email du compte, sinon aucun. Données STRICTEMENT back-office : ce helper
 * ne doit jamais alimenter une projection publique.
 */
export function relanceContact(
  whatsappPhone: string | null | undefined,
  email: string | null | undefined,
): RelanceContact {
  const phone = whatsappPhone?.trim() ?? "";
  if (phone !== "") {
    return {
      channel: "whatsapp",
      value: phone,
      href: `https://wa.me/${phone.replace(/^\+/, "")}`,
    };
  }
  const mail = email?.trim() ?? "";
  if (mail !== "") {
    return { channel: "email", value: mail, href: `mailto:${mail}` };
  }
  return { channel: "none" };
}

export type RelanceProgress = {
  /** Étape d'abandon = première étape non complétée (1..8). */
  stalledStep: OnboardingStep;
  /** Libellé de l'étape d'abandon. */
  stalledLabel: string;
  /** Étapes complétées (0..8). */
  completedSteps: number;
  totalSteps: number;
  /** Libellés des étapes restantes, dans l'ordre du parcours. */
  missingLabels: string[];
  /**
   * `true` : toutes les données sont là, seul le clic final explicite
   * « Envoyer mon profil » (RPC, étape 8) manque — même règle de reprise que
   * le wizard.
   */
  awaitingFinalSend: boolean;
};

/**
 * Progression et étape d'abandon d'un onboarding inachevé, dérivées de la
 * source de vérité partagée avec le wizard et le dashboard.
 */
export function relanceProgress(
  profile: OnboardingProfileData,
  hasPrimaryPhoto: boolean,
): RelanceProgress {
  const completion = computeStepCompletion(profile, hasPrimaryPhoto);
  const first = firstIncompleteStep(completion);
  // Données complètes sans marqueur : reprise à l'étape 8 pour l'envoi final
  // (miroir du comportement du wizard).
  const stalledStep = first ?? ONBOARDING_TOTAL_STEPS;

  const missingLabels: string[] = [];
  let completedSteps = 0;
  for (let step = 1; step <= ONBOARDING_TOTAL_STEPS; step++) {
    if (completion[step as OnboardingStep]) {
      completedSteps += 1;
    } else {
      missingLabels.push(ONBOARDING_STEP_LABELS[step as OnboardingStep]);
    }
  }

  return {
    stalledStep,
    stalledLabel: ONBOARDING_STEP_LABELS[stalledStep],
    completedSteps,
    totalSteps: ONBOARDING_TOTAL_STEPS,
    missingLabels,
    awaitingFinalSend: first === null,
  };
}
