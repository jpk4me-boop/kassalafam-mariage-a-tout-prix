import type { ProfileRow } from "@/lib/types/database";

/**
 * MÉTRIQUE HISTORIQUE « informations essentielles » — délibérément DIFFÉRENTE
 * de la complétude canonique du parcours (`isProfileDataComplete`,
 * src/lib/onboarding/completion.ts).
 *
 * Sémantique : les champs texte d'identité + présentation existaient AVANT le
 * wizard 8 étapes ; cette mesure n'inclut NI la photo principale NI les champs
 * matrimoniaux étendus (profession, objectifs, etc.). Elle est conservée telle
 * quelle UNIQUEMENT pour la continuité des métriques admin (analytics « profils
 * complets » historiques, fiche membre back-office). Ne PAS l'utiliser pour le
 * dashboard membre, le bandeau « Profil incomplet » ou le routage d'onboarding.
 */
export const ESSENTIAL_PROFILE_FIELDS = [
  "first_name",
  "gender",
  "birth_date",
  "country",
  "city",
  "marital_status",
  "bio",
  "partner_expectations",
] as const satisfies readonly (keyof ProfileRow)[];

/** Mesure historique : tous les champs essentiels (texte) sont renseignés. */
export function hasEssentialProfileInfo(profile: ProfileRow | null): boolean {
  if (!profile) return false;
  return ESSENTIAL_PROFILE_FIELDS.every((field) => {
    const value = profile[field];
    return value !== null && value !== undefined && String(value).trim() !== "";
  });
}
