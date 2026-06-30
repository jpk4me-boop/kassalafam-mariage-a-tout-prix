import { createAdminClient } from "@/lib/supabase/admin";
import type {
  DiscoverCandidate,
  DiscoverCandidateWithPhoto,
} from "@/lib/types/database";

/**
 * L3D-B PR1 — Signature SERVEUR des photos de candidats de découverte.
 *
 * SERVER-ONLY. Ce module utilise `createAdminClient` (service_role) : il ne
 * doit JAMAIS être importé depuis un composant "use client". `createAdminClient`
 * lève déjà si exécuté côté navigateur ; on ajoute une garde défensive.
 *
 * Confidentialité (contraintes absolues) :
 *   - le `storage_path` est lu UNIQUEMENT côté serveur et n'est JAMAIS
 *     sérialisé vers le client : la charge utile exposable ne contient que les
 *     champs sûrs de `DiscoverCandidate` + `signedUrl` ;
 *   - on ne signe une URL que pour les candidats `has_photo === true` ET
 *     `is_blurred === false` ; sinon `signedUrl` vaut `null` (la carte affichera
 *     un placeholder « Photo protégée ») ;
 *   - les candidats proviennent EXCLUSIVEMENT de la RPC `discover_candidates`
 *     (donc déjà : approuvés, genre opposé, univers correct).
 */

const BUCKET = "profile-photos";
const SIGNED_URL_TTL = 300; // 5 minutes

/**
 * Enrichit une liste de candidats (issue de la RPC) d'une URL signée éphémère
 * pour leur photo principale, dans le strict respect de `is_blurred`/`has_photo`.
 * Ne renvoie jamais `storage_path`.
 */
export async function attachSignedPhotos(
  candidates: DiscoverCandidate[],
): Promise<DiscoverCandidateWithPhoto[]> {
  if (typeof window !== "undefined") {
    throw new Error(
      "attachSignedPhotos est server-only (service_role) et ne doit jamais être appelé côté client.",
    );
  }

  // Candidats éligibles à une URL signée : photo présente ET non floutée.
  const eligible = candidates.filter((c) => c.has_photo && !c.is_blurred);

  const urlByProfile = new Map<string, string>();

  if (eligible.length > 0) {
    const admin = createAdminClient();

    // Chemins des photos principales — récupérés UNIQUEMENT côté serveur.
    const { data: rows, error: rowsError } = await admin
      .from("photos")
      .select("profile_id, storage_path")
      .in(
        "profile_id",
        eligible.map((c) => c.id),
      )
      .eq("is_primary", true);

    if (rowsError) {
      console.error(
        "[candidate-photos] lecture chemins échouée:",
        rowsError.message,
      );
    } else {
      const pathByProfile = new Map<string, string>();
      const profileByPath = new Map<string, string>();
      for (const r of rows ?? []) {
        pathByProfile.set(r.profile_id, r.storage_path);
        profileByPath.set(r.storage_path, r.profile_id);
      }

      const paths = [...pathByProfile.values()];
      if (paths.length > 0) {
        const { data: signed, error: signError } = await admin.storage
          .from(BUCKET)
          .createSignedUrls(paths, SIGNED_URL_TTL);

        if (signError) {
          console.error(
            "[candidate-photos] signature échouée:",
            signError.message,
          );
        } else {
          for (const s of signed ?? []) {
            // `s.path` est le chemin demandé ; on remappe vers le profil et on
            // ne conserve QUE l'URL signée (jamais le chemin) dans la sortie.
            const profileId = s.path ? profileByPath.get(s.path) : undefined;
            if (profileId && s.signedUrl) {
              urlByProfile.set(profileId, s.signedUrl);
            }
          }
        }
      }
    }
  }

  // Charge utile exposable : champs sûrs + signedUrl (null si inéligible).
  return candidates.map((c) => ({
    ...c,
    signedUrl: urlByProfile.get(c.id) ?? null,
  }));
}
