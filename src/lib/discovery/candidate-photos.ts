import { createAdminClient } from "@/lib/supabase/admin";
import type { DiscoverCandidate } from "@/lib/types/database";

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
 *   - photo NON floutée : URL signée de l'ORIGINALE (inchangé) ;
 *   - photo FLOUTÉE : URL signée d'un DÉRIVÉ DÉGRADÉ généré côté serveur
 *     (≈28 px + flou gaussien, WebP) — l'originale ne part JAMAIS vers le
 *     navigateur ; même sans le flou CSS d'affichage, le dérivé ne contient
 *     plus l'information du visage. Le flou Farata (filtre CSS sur l'image
 *     réelle) est VOLONTAIREMENT exclu : il serait réversible en deux clics.
 *   - en cas d'échec de génération, `signedUrl` reste `null` et la carte
 *     retombe sur le placeholder « Photo protégée » (comportement historique) ;
 *   - les candidats proviennent EXCLUSIVEMENT de RPC sécurisées (donc déjà :
 *     approuvés, périmètre correct).
 */

const BUCKET = "profile-photos";
const SIGNED_URL_TTL = 300; // 5 minutes

// Dérivé dégradé : préfixe de cache dans le bucket + géométrie volontairement
// PAUVRE (28×35 ≈ l'aspect 4/5 des cartes). L'irréversibilité vient de la
// résolution, le flou gaussien lisse le rendu après agrandissement CSS.
const BLURRED_PREFIX = "blurred";
const BLURRED_WIDTH = 28;
const BLURRED_HEIGHT = 35;
const BLURRED_SIGMA = 4;
const BLURRED_QUALITY = 40;

/**
 * Garantit l'existence du dérivé dégradé d'une photo et renvoie son chemin
 * (`blurred/<chemin original>.webp`), ou `null` si la génération échoue.
 * Cache-first : un dérivé déjà présent dans le bucket n'est jamais régénéré
 * (le chemin original étant unique par téléversement, il n'est jamais périmé).
 */
async function ensureBlurredDerivative(
  admin: ReturnType<typeof createAdminClient>,
  originalPath: string,
): Promise<string | null> {
  const derivativePath = `${BLURRED_PREFIX}/${originalPath}.webp`;

  // Test d'existence économique : signer un objet absent échoue proprement.
  const cached = await admin.storage
    .from(BUCKET)
    .createSignedUrl(derivativePath, 60);
  if (!cached.error) return derivativePath;

  const original = await admin.storage.from(BUCKET).download(originalPath);
  if (original.error || !original.data) {
    console.error(
      "[candidate-photos] téléchargement original échoué:",
      original.error?.message,
    );
    return null;
  }

  try {
    const { default: sharp } = await import("sharp");
    const degraded = await sharp(Buffer.from(await original.data.arrayBuffer()))
      .rotate()
      .resize(BLURRED_WIDTH, BLURRED_HEIGHT, { fit: "cover" })
      .blur(BLURRED_SIGMA)
      .webp({ quality: BLURRED_QUALITY })
      .toBuffer();

    const uploaded = await admin.storage
      .from(BUCKET)
      .upload(derivativePath, degraded, {
        contentType: "image/webp",
        upsert: true,
      });
    if (uploaded.error) {
      console.error(
        "[candidate-photos] écriture dérivé échouée:",
        uploaded.error.message,
      );
      return null;
    }
    return derivativePath;
  } catch (error) {
    console.error(
      "[candidate-photos] génération dérivé échouée:",
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
}

/**
 * Enrichit une liste de candidats (issue de la RPC) d'une URL signée éphémère
 * pour leur photo principale : l'originale si la photo est publique, le dérivé
 * dégradé si le membre floute. Ne renvoie jamais `storage_path`.
 */
export async function attachSignedPhotos<T extends DiscoverCandidate>(
  candidates: T[],
): Promise<(T & { signedUrl: string | null })[]> {
  if (typeof window !== "undefined") {
    throw new Error(
      "attachSignedPhotos est server-only (service_role) et ne doit jamais être appelé côté client.",
    );
  }

  const withPhoto = candidates.filter((c) => c.has_photo);
  const urlByProfile = new Map<string, string>();

  if (withPhoto.length > 0) {
    const admin = createAdminClient();

    // Chemins des photos principales — récupérés UNIQUEMENT côté serveur.
    const { data: rows, error: rowsError } = await admin
      .from("photos")
      .select("profile_id, storage_path")
      .in(
        "profile_id",
        withPhoto.map((c) => c.id),
      )
      .eq("is_primary", true);

    if (rowsError) {
      console.error(
        "[candidate-photos] lecture chemins échouée:",
        rowsError.message,
      );
    } else {
      const blurredById = new Map(candidates.map((c) => [c.id, c.is_blurred]));
      const profileByPath = new Map<string, string>();
      const toSign: string[] = [];

      // Photos publiques : l'originale, telle quelle (comportement historique).
      for (const r of rows ?? []) {
        if (blurredById.get(r.profile_id) === false) {
          profileByPath.set(r.storage_path, r.profile_id);
          toSign.push(r.storage_path);
        }
      }

      // Photos floutées : le DÉRIVÉ dégradé, jamais l'originale. Chaque échec
      // individuel retombe sur le placeholder, sans bloquer les autres.
      const blurredRows = (rows ?? []).filter(
        (r) => blurredById.get(r.profile_id) === true,
      );
      const derivatives = await Promise.all(
        blurredRows.map((r) => ensureBlurredDerivative(admin, r.storage_path)),
      );
      derivatives.forEach((derivativePath, i) => {
        if (derivativePath) {
          profileByPath.set(derivativePath, blurredRows[i].profile_id);
          toSign.push(derivativePath);
        }
      });

      if (toSign.length > 0) {
        const { data: signed, error: signError } = await admin.storage
          .from(BUCKET)
          .createSignedUrls(toSign, SIGNED_URL_TTL);

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
