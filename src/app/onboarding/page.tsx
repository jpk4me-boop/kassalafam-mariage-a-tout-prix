import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import {
  ONBOARDING_PROFILE_COLUMNS,
  resolveOnboardingMode,
  type OnboardingProfileData,
} from "@/lib/onboarding/completion";
import { safeOnboardingRedirect } from "@/lib/onboarding/redirect";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";

/**
 * Onboarding KASSALAFAM — Server Component.
 *
 * Placé HORS du groupe (member) : pas d'en-tête membre, et surtout aucune
 * re-application de la garde d'onboarding (le middleware ne redirige pas
 * /onboarding vers lui-même → pas de boucle).
 *
 * Un SEUL SELECT profil (colonnes utiles) + une vérification légère « photo
 * principale » alimentent le helper central `resolveOnboardingMode` :
 *   - Mode C (`complete`)         : profil complet + acquisition enregistrée →
 *                                   redirection immédiate (aucun wizard rendu) ;
 *   - Mode B (`acquisition_only`) : profil historique complet, acquisition non
 *                                   enregistrée → seule l'étape acquisition ;
 *   - Mode A (`full`)             : profil incomplet → wizard 8 étapes, reprise
 *                                   à la première étape incomplète.
 *
 * La ligne profil est passée au wizard client (évite un SELECT client redondant).
 */

export const dynamic = "force-dynamic";

/** Profil « vide » pour un tout nouvel inscrit sans ligne `profiles` encore
 *  créée (elle le sera à l'étape 1 par la RPC record_acquisition_source). */
const EMPTY_PROFILE: OnboardingProfileData = {
  first_name: null,
  gender: null,
  birth_date: null,
  marital_status: null,
  religion: null,
  country: null,
  city: null,
  profession: null,
  education_level: null,
  height_cm: null,
  origin_country: null,
  origin_city: null,
  region: null,
  marriage_goals: null,
  desired_partner_traits: null,
  polygamy_preference: null,
  children_intent: null,
  bio: null,
  partner_expectations: null,
  acquisition_source_recorded_at: null,
  onboarding_completed_at: null,
};

/**
 * SUGGESTION de prénom issue des métadonnées Auth DÉJÀ chargées (aucun SELECT
 * supplémentaire). Sert uniquement à préremplir le champ « Prénom » de
 * l'étape 2 (valeur modifiable) et l'accueil de l'introduction — JAMAIS au
 * calcul de complétude ni au mode : seule la valeur en base compte.
 */
function firstNameSuggestionFromMetadata(
  metadata: Record<string, unknown> | undefined,
): string | null {
  const candidate =
    (typeof metadata?.first_name === "string" && metadata.first_name) ||
    (typeof metadata?.name === "string" && metadata.name) ||
    (typeof metadata?.full_name === "string" && metadata.full_name) ||
    "";
  const firstToken = candidate.trim().split(/\s+/)[0] ?? "";
  return firstToken.length > 0 ? firstToken : null;
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { redirect: rawRedirect } = await searchParams;
  const redirectTo = safeOnboardingRedirect(rawRedirect);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirect=${encodeURIComponent("/onboarding")}`);
  }

  // Un seul SELECT profil (colonnes utiles) + une lecture légère « photo
  // principale existe-t-elle ? ».
  const [{ data: profileRow }, { data: primaryPhoto }] = await Promise.all([
    supabase
      .from("profiles")
      .select(ONBOARDING_PROFILE_COLUMNS)
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("photos")
      .select("id")
      .eq("profile_id", user.id)
      .eq("is_primary", true)
      .limit(1)
      .maybeSingle(),
  ]);

  const profile = (profileRow as OnboardingProfileData | null) ?? EMPTY_PROFILE;
  const hasPrimaryPhoto = primaryPhoto != null;

  // Complétude et mode calculés sur la SEULE ligne base : la suggestion de
  // prénom (métadonnées Auth) est transmise à part et n'influence ni l'un ni
  // l'autre — sinon un prénom jamais enregistré marquerait l'étape 2 complète.
  const mode = resolveOnboardingMode(profile, hasPrimaryPhoto);

  // Mode C : parcours déjà finalisé (marqueur posé) → destination directe.
  if (mode === "complete") {
    redirect(redirectTo);
  }

  return (
    <OnboardingWizard
      mode={mode}
      userId={user.id}
      initialProfile={profile}
      firstNameSuggestion={firstNameSuggestionFromMetadata(user.user_metadata)}
      hasPrimaryPhoto={hasPrimaryPhoto}
      redirectTo={redirectTo}
    />
  );
}
