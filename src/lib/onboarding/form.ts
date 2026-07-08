/**
 * État de formulaire du wizard d'onboarding (valeurs « brutes » côté saisie :
 * chaînes pour les champs texte / sélecteurs, tableaux pour les multi-choix).
 * `formFromProfile` initialise cet état depuis la ligne profil déjà chargée
 * côté serveur (aucun SELECT client redondant).
 */
import type {
  ChildrenIntent,
  EducationLevel,
  Gender,
  MaritalStatus,
  MarriageGoal,
  PartnerTrait,
  PolygamyPreference,
} from "@/lib/types/database";
import type { OnboardingProfileData } from "@/lib/onboarding/completion";

export type WizardForm = {
  first_name: string;
  gender: "" | Gender;
  birth_date: string;
  marital_status: "" | MaritalStatus;
  profession: string;
  education_level: "" | EducationLevel;
  height_cm: string;
  country: string;
  city: string;
  origin_country: string;
  region: string;
  marriage_goals: MarriageGoal[];
  desired_partner_traits: PartnerTrait[];
  polygamy_preference: "" | PolygamyPreference;
  children_intent: "" | ChildrenIntent;
  bio: string;
  partner_expectations: string;
};

/**
 * `firstNameSuggestion` (métadonnées Auth) ne sert que de SUGGESTION initiale
 * quand la base n'a pas encore de prénom : la valeur reste modifiable et n'est
 * considérée enregistrée qu'après la sauvegarde de l'étape 2.
 */
export function formFromProfile(
  p: OnboardingProfileData,
  firstNameSuggestion?: string | null,
): WizardForm {
  return {
    first_name: p.first_name ?? firstNameSuggestion ?? "",
    gender: p.gender ?? "",
    birth_date: p.birth_date ?? "",
    marital_status: p.marital_status ?? "",
    profession: p.profession ?? "",
    education_level: p.education_level ?? "",
    height_cm: p.height_cm != null ? String(p.height_cm) : "",
    country: p.country ?? "",
    city: p.city ?? "",
    origin_country: p.origin_country ?? "",
    region: p.region ?? "",
    marriage_goals: p.marriage_goals ?? [],
    desired_partner_traits: p.desired_partner_traits ?? [],
    polygamy_preference: p.polygamy_preference ?? "",
    children_intent: p.children_intent ?? "",
    bio: p.bio ?? "",
    partner_expectations: p.partner_expectations ?? "",
  };
}
