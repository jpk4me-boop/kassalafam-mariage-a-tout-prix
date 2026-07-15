/**
 * Libellés FR des valeurs contrôlées du wizard d'onboarding KASSALAFAM.
 *
 * Chaque liste est le MIROIR EXACT des valeurs autorisées par les CHECK de la
 * migration 20260707090000_add_profile_extended_matrimonial_fields (et du schéma
 * de base pour gender / marital_status). Toute divergence ferait échouer
 * l'écriture côté base : ne jamais introduire ici une valeur non permise.
 *
 * Les libellés sont propres à KASSALAFAM (aucun texte tiers réutilisé).
 */
import type {
  ChildrenIntent,
  EducationLevel,
  Gender,
  MaritalStatus,
  MarriageGoal,
  PartnerTrait,
  PolygamyPreference,
  Religion,
} from "@/lib/types/database";

export type Option<T extends string> = { value: T; label: string };

export const GENDER_OPTIONS: Option<Gender>[] = [
  { value: "homme", label: "Homme" },
  { value: "femme", label: "Femme" },
];

export const MARITAL_STATUS_OPTIONS: Option<MaritalStatus>[] = [
  { value: "celibataire", label: "Célibataire" },
  { value: "divorce", label: "Divorcé(e)" },
  { value: "veuf", label: "Veuf / Veuve" },
  { value: "separe", label: "Séparé(e)" },
];

/** religion : MIROIR du CHECK `profiles_religion_chk` (migration 20260715090000). */
export const RELIGION_OPTIONS: Option<Religion>[] = [
  { value: "christianisme", label: "Christianisme" },
  { value: "islam", label: "Islam" },
  { value: "autre", label: "Autre religion" },
  { value: "sans_religion", label: "Sans religion" },
];

export const EDUCATION_LEVEL_OPTIONS: Option<EducationLevel>[] = [
  { value: "secondary", label: "Secondaire / collège" },
  { value: "high_school", label: "Lycée / Baccalauréat" },
  { value: "bachelor", label: "Licence (Bac +3)" },
  { value: "master", label: "Master (Bac +5)" },
  { value: "doctorate", label: "Doctorat" },
  { value: "vocational", label: "Formation professionnelle" },
  { value: "other", label: "Autre" },
];

/** marriage_goals : 2 à 3 choix UNIQUES (contrainte base). */
export const MARRIAGE_GOAL_OPTIONS: Option<MarriageGoal>[] = [
  { value: "build_family", label: "Fonder une famille" },
  { value: "stable_home", label: "Construire un foyer stable" },
  { value: "life_partner", label: "Trouver un(e) partenaire de vie" },
  { value: "grow_together", label: "Grandir ensemble" },
  { value: "mutual_support", label: "Soutien mutuel" },
  { value: "serenity", label: "Vivre dans la sérénité" },
];

/** desired_partner_traits : 2 à 3 choix UNIQUES (contrainte base). */
export const PARTNER_TRAIT_OPTIONS: Option<PartnerTrait>[] = [
  { value: "kindness", label: "Bienveillance" },
  { value: "sincerity", label: "Sincérité" },
  { value: "ambition", label: "Ambition" },
  { value: "family_oriented", label: "Sens de la famille" },
  { value: "cultured", label: "Cultivé(e)" },
  { value: "sense_of_humor", label: "Sens de l'humour" },
  { value: "calm_mature", label: "Calme et mature" },
];

export const POLYGAMY_PREFERENCE_OPTIONS: Option<PolygamyPreference>[] = [
  { value: "no", label: "Non, monogamie uniquement" },
  { value: "yes", label: "Ouvert(e) à la polygamie" },
  { value: "discuss", label: "À discuter ensemble" },
];

export const CHILDREN_INTENT_OPTIONS: Option<ChildrenIntent>[] = [
  { value: "wants_children", label: "Je souhaite avoir des enfants" },
  { value: "does_not_want_children", label: "Je ne souhaite pas d'enfants" },
  { value: "has_children", label: "J'ai déjà des enfants" },
  { value: "discuss", label: "À discuter ensemble" },
];

/** Bornes de la taille — MIROIR du CHECK `profiles_height_cm_chk` (120..230). */
export const HEIGHT_MIN_CM = 120;
export const HEIGHT_MAX_CM = 230;

/** Bornes des listes de choix — MIROIR de `profiles_valid_choice_set(..., 2, 3)`. */
export const CHOICE_SET_MIN = 2;
export const CHOICE_SET_MAX = 3;

/** Longueurs texte — MIROIR des CHECK de la migration. */
export const PROFESSION_MIN = 2;
export const PROFESSION_MAX = 100;
export const ORIGIN_COUNTRY_MAX = 100;
export const REGION_MAX = 120;

/** bio / partner_expectations — MIROIR des CHECK `profiles_bio_len` et
 *  `profiles_partner_expectations_len` (≤ 2000), même règle que /profile. */
export const PROFILE_TEXT_MAX = 2000;
