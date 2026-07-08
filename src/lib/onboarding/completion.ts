/**
 * Helper CENTRAL de complétude du parcours d'onboarding KASSALAFAM.
 *
 * Une SEULE source de vérité, partagée par :
 *   - le Server Component (choix du mode A / B / C, sans SELECT redondant) ;
 *   - le wizard client (reprise à la première étape incomplète, cf. exigence 3).
 *
 * Les 8 étapes du parcours (voir le wizard) :
 *   1. Acquisition          → acquisition_source_recorded_at
 *   2. Genre                → gender
 *   3. Date de naissance    → birth_date (≥ 18 ans, cf. `isAdultBirthDate`)
 *   4. Situation            → marital_status
 *   5. Profession / études  → profession + education_level + height_cm
 *   6. Localisation         → country + city + origin_country + region
 *   7. Projet matrimonial   → marriage_goals + desired_partner_traits +
 *                             polygamy_preference + children_intent
 *   8. Photos               → au moins une photo principale
 */
import type { ProfileRow } from "@/lib/types/database";
import { CHOICE_SET_MAX, CHOICE_SET_MIN } from "@/lib/onboarding/options";

export const ONBOARDING_TOTAL_STEPS = 8;
export const ONBOARDING_MIN_AGE = 18;

export type OnboardingStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** Sous-ensemble des colonnes profil réellement lues par l'onboarding. Évite de
 *  trimballer (et d'exposer côté client) la ligne profil entière. */
export type OnboardingProfileData = Pick<
  ProfileRow,
  // `first_name` ne sert qu'à l'accueil de l'introduction (« Bienvenue, … »),
  // jamais à la complétude ; il est inclus pour éviter un SELECT dédié.
  | "first_name"
  | "gender"
  | "birth_date"
  | "marital_status"
  | "country"
  | "city"
  | "profession"
  | "education_level"
  | "height_cm"
  | "origin_country"
  | "region"
  | "marriage_goals"
  | "desired_partner_traits"
  | "polygamy_preference"
  | "children_intent"
  | "acquisition_source_recorded_at"
>;

/** Colonnes à sélectionner côté serveur pour alimenter le wizard en UN seul SELECT. */
export const ONBOARDING_PROFILE_COLUMNS =
  "first_name, gender, birth_date, marital_status, country, city, profession, education_level, height_cm, origin_country, region, marriage_goals, desired_partner_traits, polygamy_preference, children_intent, acquisition_source_recorded_at";

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
    2: profile.gender != null,
    3: isAdultBirthDate(profile.birth_date),
    4: profile.marital_status != null,
    5:
      isFilled(profile.profession) &&
      profile.education_level != null &&
      profile.height_cm != null,
    6:
      isFilled(profile.country) &&
      isFilled(profile.city) &&
      isFilled(profile.origin_country) &&
      isFilled(profile.region),
    7:
      isValidChoiceSet(profile.marriage_goals) &&
      isValidChoiceSet(profile.desired_partner_traits) &&
      profile.polygamy_preference != null &&
      profile.children_intent != null,
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

/** Colonnes « cœur » seules : sous-ensemble minimal suffisant pour
 *  `isCoreComplete`, permettant au middleware un SELECT allégé. */
export type CoreProfileData = Pick<
  OnboardingProfileData,
  "gender" | "birth_date" | "marital_status" | "country" | "city"
>;

/**
 * Complétude « CŒUR historique » : les informations d'identité matrimoniale qui
 * existaient AVANT les champs étendus (genre, naissance, situation, résidence)
 * plus une photo principale. Volontairement satisfaisable par un profil
 * historique (dont les champs étendus, tous facultatifs, sont NULL) : c'est le
 * critère du Mode B, qui évite de re-soumettre le wizard complet à un membre
 * déjà présent et n'ayant qu'à répondre à la question d'acquisition.
 */
export function isCoreComplete(
  profile: CoreProfileData,
  hasPrimaryPhoto: boolean,
): boolean {
  return (
    profile.gender != null &&
    profile.birth_date != null &&
    profile.marital_status != null &&
    typeof profile.country === "string" &&
    profile.country.trim().length > 0 &&
    typeof profile.city === "string" &&
    profile.city.trim().length > 0 &&
    hasPrimaryPhoto
  );
}

export type OnboardingMode = "full" | "acquisition_only" | "complete";

/**
 * Décision de mode, UNIQUE point de branchement (exclusif) — reposant sur la
 * SEULE complétude « cœur historique », de sorte qu'un membre déjà présent ne
 * soit JAMAIS forcé de renseigner rétroactivement les champs étendus (facultatifs) :
 *   - `complete`         : acquisition enregistrée ET profil cœur complet
 *                          (Mode C → redirection immédiate, aucun wizard rendu) —
 *                          y compris un profil historique dont les champs étendus
 *                          restent NULL ;
 *   - `acquisition_only` : acquisition NON enregistrée ET profil cœur complet
 *                          (Mode B → seule l'étape acquisition, puis redirection) ;
 *   - `full`             : profil cœur incomplet (Mode A → wizard complet, reprise
 *                          à la première étape incomplète). Couvre le nouvel
 *                          inscrit comme le membre ayant répondu à l'acquisition
 *                          mais dont le profil de base reste inachevé.
 *
 * Note : dans le wizard, `hasPrimaryPhoto` correspond à l'étape 8 (dernière),
 * atteignable uniquement après les étapes 5 et 7 ; pour un membre passé par le
 * wizard, cœur-complet équivaut donc à intégralement complet. Les deux ne
 * divergent que pour les profils historiques — pour lesquels la redirection est
 * précisément le comportement voulu.
 */
export function resolveOnboardingMode(
  profile: OnboardingProfileData,
  hasPrimaryPhoto: boolean,
): OnboardingMode {
  const acquisitionRecorded = profile.acquisition_source_recorded_at != null;
  const coreComplete = isCoreComplete(profile, hasPrimaryPhoto);

  if (acquisitionRecorded) {
    // Cœur complet → plus rien à demander (Mode C) ; sinon parcours complet.
    return coreComplete ? "complete" : "full";
  }
  // Acquisition non enregistrée : un profil historique déjà cœur-complet n'a que
  // la question d'acquisition à traiter (Mode B) ; sinon parcours complet.
  return coreComplete ? "acquisition_only" : "full";
}
