import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { resolveShareToken } from "@/lib/server/profile-share-links";

/**
 * Partage PR3 — Projection PUBLIQUE minimale d'un profil partagé (/p/[token]).
 *
 * SERVER-ONLY. Ce module utilise `createAdminClient` (service_role) : il ne
 * doit JAMAIS être importé depuis un composant "use client".
 *
 * Confidentialité (contraintes absolues) :
 *   - la validité du jeton est tranchée EXCLUSIVEMENT par `resolveShareToken`
 *     (PR2), revérifiée à CHAQUE requête : révocation, expiration, retrait de
 *     consentement ou suspension invalident immédiatement la page ;
 *   - `null` pour TOUT jeton invalide, sans distinction de cause (la page rend
 *     un 404 générique uniforme) ;
 *   - la projection retournée est la SEULE charge utile exposable : prénom,
 *     âge CALCULÉ côté serveur (jamais la date de naissance), ville, pays,
 *     intention, biographie courte tronquée et un simple booléen
 *     `hasPublicPhoto`. JAMAIS d'UUID, de jeton, de `storage_path`, d'URL
 *     Supabase, de coordonnées ni de champs de modération — aucune ligne
 *     `profiles` complète ne sort ;
 *   - la photo n'est JAMAIS servie par lien signé Supabase Storage : un tel
 *     lien contient le storage_path EN CLAIR, or la convention du bucket est
 *     `{UUID profil}/{UUID photo}.{ext}` — l'exposer dans le HTML public
 *     révélerait l'UUID du membre. Les octets sont diffusés par l'endpoint
 *     serveur /p/[token]/photo via `getPublicSharedPhoto` ;
 *   - `blur_photos = true` → la photo n'est ni annoncée ni téléchargeable
 *     (un flou CSS laisserait l'original téléchargeable) : avatar neutre ;
 *   - un échec de photo ne rend jamais le profil indisponible
 *     (`hasPublicPhoto` retombe simplement sur `false`).
 */

const BUCKET = "profile-photos";
/** Longueur maximale de la biographie publique (« courte biographie »). */
const BIO_MAX_LENGTH = 280;
/** Types d'image autorisés — miroir de `allowed_mime_types` du bucket. */
const ALLOWED_PHOTO_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
/** Taille maximale servie — miroir du `file_size_limit` du bucket (3 Mo). */
const MAX_PHOTO_BYTES = 3145728;

/** Charge utile exposable au navigateur — aucun identifiant technique. */
export type PublicSharedProfile = {
  firstName: string | null;
  age: number | null;
  city: string | null;
  country: string | null;
  intention: string;
  bio: string | null;
  /** true = une photo principale autorisée existe (servie par /p/[token]/photo). */
  hasPublicPhoto: boolean;
};

/** Octets de la photo publique, prêts à être diffusés par le route handler. */
export type PublicSharedPhoto = {
  body: ArrayBuffer;
  contentType: string;
};

/** Âge révolu calculé côté serveur — la date exacte n'est jamais transmise. */
function computeAge(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDelta = now.getMonth() - birth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age >= 0 && age <= 120 ? age : null;
}

/** Biographie courte : vide → null, sinon tronquée à BIO_MAX_LENGTH. */
function shortBio(bio: string | null): string | null {
  const trimmed = bio?.trim();
  if (!trimmed) return null;
  if (trimmed.length <= BIO_MAX_LENGTH) return trimmed;
  return `${trimmed.slice(0, BIO_MAX_LENGTH).trimEnd()}…`;
}

/**
 * Résout un jeton public et retourne la présentation limitée du profil, ou
 * `null` pour tout jeton invalide (comportement public strictement uniforme).
 */
export async function getPublicSharedProfile(
  token: string,
): Promise<PublicSharedProfile | null> {
  if (typeof window !== "undefined") {
    throw new Error(
      "getPublicSharedProfile est server-only (service_role) et ne doit jamais être appelé côté client.",
    );
  }

  // Seule porte d'entrée : la résolution PR2 (forme du jeton, hash, expiration,
  // révocation, consentement et publiabilité revérifiés à chaque appel).
  const resolved = await resolveShareToken(token);
  if (!resolved) return null;

  const admin = createAdminClient();

  // Colonnes STRICTEMENT nécessaires à la projection publique — jamais `*`.
  const { data: profile, error } = await admin
    .from("profiles")
    .select("first_name, birth_date, city, country, intention, bio, blur_photos")
    .eq("id", resolved.profile_id)
    .maybeSingle();

  if (error || !profile) return null;

  // Existence de la photo principale AUTORISÉE : simple booléen dans la
  // projection — le storage_path est lu ici (module server-only) pour vérifier
  // l'existence, mais n'est JAMAIS retourné. Octets servis par /p/[token]/photo.
  let hasPublicPhoto = false;
  if (!profile.blur_photos) {
    const { data: photoRows } = await admin
      .from("photos")
      .select("storage_path, mime_type")
      .eq("profile_id", resolved.profile_id)
      .eq("is_primary", true)
      .limit(1);

    const photo = photoRows?.[0];
    hasPublicPhoto =
      !!photo?.storage_path &&
      photo.mime_type != null &&
      ALLOWED_PHOTO_MIME_TYPES.has(photo.mime_type);
  }

  return {
    firstName: profile.first_name?.trim() || null,
    age: computeAge(profile.birth_date),
    city: profile.city,
    country: profile.country,
    intention: profile.intention,
    bio: shortBio(profile.bio),
    hasPublicPhoto,
  };
}

/**
 * Diffusion contrôlée de la photo principale d'un profil partagé : re-résout
 * le jeton (toutes les conditions de publication sont revérifiées), applique
 * `blur_photos`, télécharge l'objet côté serveur (client admin) et retourne
 * UNIQUEMENT les octets + un Content-Type validé. `null` — sans distinction de
 * cause — pour : jeton invalide, floutage activé, photo absente, type MIME
 * hors liste blanche, taille excessive ou échec de téléchargement. Ni le
 * jeton, ni le chemin, ni l'UUID ne sont journalisés ou retournés.
 */
export async function getPublicSharedPhoto(
  token: string,
): Promise<PublicSharedPhoto | null> {
  if (typeof window !== "undefined") {
    throw new Error(
      "getPublicSharedPhoto est server-only (service_role) et ne doit jamais être appelé côté client.",
    );
  }

  const resolved = await resolveShareToken(token);
  if (!resolved) return null;

  const admin = createAdminClient();

  const { data: profile, error } = await admin
    .from("profiles")
    .select("blur_photos")
    .eq("id", resolved.profile_id)
    .maybeSingle();

  if (error || !profile || profile.blur_photos) return null;

  const { data: photoRows } = await admin
    .from("photos")
    .select("storage_path, mime_type")
    .eq("profile_id", resolved.profile_id)
    .eq("is_primary", true)
    .limit(1);

  const photo = photoRows?.[0];
  if (
    !photo?.storage_path ||
    photo.mime_type == null ||
    !ALLOWED_PHOTO_MIME_TYPES.has(photo.mime_type)
  ) {
    return null;
  }

  // Téléchargement SERVEUR de l'objet : aucune URL signée n'est créée, le
  // storage_path ne quitte jamais ce module.
  const { data: blob, error: downloadError } = await admin.storage
    .from(BUCKET)
    .download(photo.storage_path);

  if (downloadError || !blob) return null;
  if (blob.size === 0 || blob.size > MAX_PHOTO_BYTES) return null;

  return {
    body: await blob.arrayBuffer(),
    contentType: photo.mime_type,
  };
}
