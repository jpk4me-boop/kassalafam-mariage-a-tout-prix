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
};

export function formFromProfile(p: OnboardingProfileData): WizardForm {
  return {
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
  };
}
