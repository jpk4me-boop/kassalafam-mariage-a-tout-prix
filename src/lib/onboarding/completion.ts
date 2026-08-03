/**
 * Helper CENTRAL de complétude du parcours d'onboarding KASSALAFAM.
 *
 * DEUX CONCEPTS DISTINCTS (arbitrage produit) :
 *   - `onboarding_completed_at` (marqueur, posé par la RPC
 *     complete_member_onboarding) = le membre a explicitement TERMINÉ et
 *     envoyé son parcours initial. C'est LUI que le routage utilise
 *     (middleware + résolution de mode).
 *   - `isProfileDataComplete` = complétude DYNAMIQUE : les données actuelles
 *     satisfont les exigences du produit. C'est ELLE que le dashboard et le
 *     bandeau « Profil incomplet » utilisent : un membre peut redevenir
 *     incomplet via /profile sans que son onboarding initial rouvre.
 *
 * Une SEULE source de vérité, partagée par :
 *   - le Server Component (choix du mode A / B / C, sans SELECT redondant) ;
 *   - le wizard client (reprise à la première étape incomplète) ;
 *   - le dashboard (bandeau de complétude dynamique).
 * Miroir serveur : public.profile_meets_onboarding_requirements (migration
 * 20260708130000) — toute évolution doit être faite DES DEUX CÔTÉS.
 *
 * Les 8 étapes du parcours (voir le wizard) :
 *   1. Acquisition          → acquisition_source_recorded_at
 *   2. Identité             → first_name + gender
 *   3. Date de naissance    → birth_date (≥ 18 ans, cf. `isAdultBirthDate`)
 *   4. Situation            → marital_status + religion
 *   5. Profession / études  → profession + education_level + height_cm
 *   6. Localisation         → origin_country + origin_city (origine) puis
 *                             country + city + region (résidence)
 *   7. Projet matrimonial   → marriage_goals + desired_partner_traits +
 *                             polygamy_preference + children_intent +
 *                             bio + partner_expectations
 *   8. Photos               → au moins une photo principale, puis FIN
 *                             EXPLICITE (« Envoyer mon profil » → RPC)
 */
import type { ProfileRow } from "@/lib/types/database";
import { CHOICE_SET_MAX, CHOICE_SET_MIN } from "@/lib/onboarding/options";

export const ONBOARDING_TOTAL_STEPS = 8;
export const PROFILE_COMPLETION_STEPS = [2, 3, 4, 5, 6, 7, 8] as const;
export const ONBOARDING_MIN_AGE = 18;

export type OnboardingStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/**
 * Libellés des 8 étapes — SOURCE UNIQUE, partagée par l'écran de reprise du
 * wizard (membre) et la vue « Relance » (back-office). Même ordre que le
 * parcours ; toute évolution des étapes se répercute ici une seule fois.
 */
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

/** Sous-ensemble des colonnes profil réellement lues par l'onboarding. Évite de
 *  trimballer (et d'exposer côté client) la ligne profil entière. */
export type OnboardingProfileData = Pick<
  ProfileRow,
  | "first_name"
  | "gender"
  | "birth_date"
  | "marital_status"
  | "religion"
  | "country"
  | "city"
  | "profession"
  | "education_level"
  | "height_cm"
  | "origin_country"
  | "origin_city"
  | "region"
  | "marriage_goals"
  | "desired_partner_traits"
  | "polygamy_preference"
  | "children_intent"
  | "bio"
  | "partner_expectations"
  | "acquisition_source_recorded_at"
  | "onboarding_completed_at"
  // Pseudo affiché (migration 53) : COLLECTÉ à l'étape 2 (facultatif), jamais
  // exigé par la complétude — aucune règle ne le lit dans ce module.
  | "pseudo"
>;

/** Colonnes à sélectionner côté serveur pour alimenter le wizard en UN seul SELECT. */
export const ONBOARDING_PROFILE_COLUMNS =
  "first_name, gender, birth_date, marital_status, religion, country, city, profession, education_level, height_cm, origin_country, origin_city, region, marriage_goals, desired_partner_traits, polygamy_preference, children_intent, bio, partner_expectations, acquisition_source_recorded_at, onboarding_completed_at, pseudo";

function isFilled(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidChoiceSet(values: readonly string[] | null | undefined): boolean {
  if (!Array.isArray(values)) return false;
  const size = values.length;
  if (size < CHOICE_SET_MIN || size > CHOICE_SET_MAX) return false;
  return new Set(values).size === size;
}

/**
 * Validation d'âge minimum (exigence 7 : 18 ans révolus), côté application, en
 * plus des CHECK base. `birthISO` est une date "YYYY-MM-DD". Renvoie false si la
 * valeur est absente ou invalide.
 */
export function isAdultBirthDate(
  birthISO: string | null | undefined,
  minAge = ONBOARDING_MIN_AGE,
): boolean {
  if (!birthISO) return false;
  const birth = new Date(`${birthISO}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return false;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age >= minAge;
}

export type StepCompletion = Record<OnboardingStep, boolean>;

/**
 * Complétude étape par étape. `hasPrimaryPhoto` vient d'un SELECT léger sur
 * `photos` (une photo principale existe-t-elle ?). L'étape 3 exige une date de
 * naissance VALIDE (≥ 18 ans) : une date < 18 ans est considérée incomplète et
 * la reprise s'y arrêtera.
 */
export function computeStepCompletion(
  profile: OnboardingProfileData,
  hasPrimaryPhoto: boolean,
): StepCompletion {
  return {
    1: profile.acquisition_source_recorded_at != null,
    2: isFilled(profile.first_name) && profile.gender != null,
    3: isAdultBirthDate(profile.birth_date),
    4: profile.marital_status != null && profile.religion != null,
    5:
      isFilled(profile.profession) &&
      profile.education_level != null &&
      profile.height_cm != null,
    6:
      isFilled(profile.origin_country) &&
      isFilled(profile.origin_city) &&
      isFilled(profile.country) &&
      isFilled(profile.city) &&
      isFilled(profile.region),
    7:
      isValidChoiceSet(profile.marriage_goals) &&
      isValidChoiceSet(profile.desired_partner_traits) &&
      profile.polygamy_preference != null &&
      profile.children_intent != null &&
      isFilled(profile.bio) &&
      isFilled(profile.partner_expectations),
    8: hasPrimaryPhoto,
  };
}

/** Première étape (1..8) non complétée, ou `null` si tout est complet. */
export function firstIncompleteStep(
  completion: StepCompletion,
): OnboardingStep | null {
  for (let step = 1; step <= ONBOARDING_TOTAL_STEPS; step++) {
    if (!completion[step as OnboardingStep]) return step as OnboardingStep;
  }
  return null;
}

/**
 * Complétude DYNAMIQUE canonique du profil (étapes 2 à 8 du parcours) :
 * les données actuellement enregistrées satisfont les exigences du produit.
 * L'acquisition (étape 1) est volontairement traitée À PART dans la résolution
 * de mode — elle reste obligatoire avant la finalisation (contrôle serveur).
 *
 * Utilisée par : le dashboard (bandeau « Profil incomplet »), la résolution de
 * mode ci-dessous et la reprise du wizard. Miroir serveur :
 * public.profile_meets_onboarding_requirements (qui inclut aussi l'acquisition).
 */
export function isProfileDataComplete(
  profile: OnboardingProfileData,
  hasPrimaryPhoto: boolean,
): boolean {
  return computeProfileCompletionSummary(
    profile,
    hasPrimaryPhoto,
  ).complete;
}

export type ProfileCompletionSummary = Readonly<{
  completedSteps: number;
  totalSteps: number;
  percentage: number;
  complete: boolean;
}>;

/**
 * Résumé de complétude du profil matrimonial.
 *
 * L'étape Acquisition est exclue : elle constitue une information marketing
 * interne et non une information du profil présenté aux autres membres.
 */
export function computeProfileCompletionSummary(
  profile: OnboardingProfileData,
  hasPrimaryPhoto: boolean,
): ProfileCompletionSummary {
  const completion = computeStepCompletion(
    profile,
    hasPrimaryPhoto,
  );

  const completedSteps = PROFILE_COMPLETION_STEPS.reduce(
    (count, step) =>
      count + (completion[step] ? 1 : 0),
    0,
  );

  const totalSteps = PROFILE_COMPLETION_STEPS.length;
  const percentage = Math.round(
    (completedSteps / totalSteps) * 100,
  );

  return {
    completedSteps,
    totalSteps,
    percentage,
    complete: completedSteps === totalSteps,
  };
}

export function computeProfileCompletionPercentage(
  profile: OnboardingProfileData,
  hasPrimaryPhoto: boolean,
): number {
  return computeProfileCompletionSummary(
    profile,
    hasPrimaryPhoto,
  ).percentage;
}

export type OnboardingMode = "full" | "acquisition_only" | "complete";

/**
 * Décision de mode, UNIQUE point de branchement (exclusif) :
 *   - `complete`         : `onboarding_completed_at` posé — le membre a
 *                          explicitement terminé son parcours initial
 *                          (Mode C → redirection immédiate, aucun wizard rendu) ;
 *   - `acquisition_only` : marqueur NULL, acquisition NULL, mais toutes les
 *                          étapes 2 à 8 déjà complètes (profil historique
 *                          intégralement rempli) — Mode B : seule l'étape
 *                          acquisition, puis finalisation RPC et redirection ;
 *   - `full`             : tous les autres cas — Mode A : wizard complet,
 *                          reprise à la première étape incomplète ; si tout est
 *                          complet mais que le marqueur manque, reprise à
 *                          l'étape 8 pour le clic final explicite.
 */
export function resolveOnboardingMode(
  profile: OnboardingProfileData,
  hasPrimaryPhoto: boolean,
): OnboardingMode {
  if (profile.onboarding_completed_at != null) return "complete";

  const acquisitionRecorded = profile.acquisition_source_recorded_at != null;
  const dataComplete = isProfileDataComplete(profile, hasPrimaryPhoto);

  if (!acquisitionRecorded && dataComplete) return "acquisition_only";
  return "full";
}
