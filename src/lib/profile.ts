import type { ProfileRow } from "@/lib/types/database";

/** Champs requis pour considérer un profil matrimonial comme complet. */
export const REQUIRED_PROFILE_FIELDS = [
  "first_name",
  "gender",
  "birth_date",
  "country",
  "city",
  "bio",
] as const satisfies readonly (keyof ProfileRow)[];

/** Un profil est complet quand tous les champs requis sont renseignés. */
export function isProfileComplete(profile: ProfileRow | null): boolean {
  if (!profile) return false;
  return REQUIRED_PROFILE_FIELDS.every((field) => {
    const value = profile[field];
    return value !== null && value !== undefined && String(value).trim() !== "";
  });
}
