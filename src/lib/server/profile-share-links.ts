import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAdminActor } from "@/lib/auth/admin-guard";
import { isUuid } from "@/lib/admin/safety-reports";
import type {
  AdminProfileShareLinkItem,
  CreateProfileShareLinkResult,
  ResolveProfileShareLinkResult,
} from "@/lib/types/database";

/**
 * Partage PR2 — Helper SERVEUR du cycle de vie des liens de partage publics.
 *
 * Modèle de sécurité identique aux actions admin existantes :
 *  1. la session admin est validée AVANT toute création du client privilégié
 *     (`resolveAdminActor`) pour créer/révoquer/lister ;
 *  2. toutes les écritures passent par les RPC SECURITY DEFINER service_role
 *     (`create/revoke_profile_share_link`) — jamais d'accès direct à la table ;
 *  3. le jeton public en clair n'existe que dans la valeur de retour de la
 *     création : il n'est JAMAIS journalisé ni relisible ensuite ;
 *  4. les erreurs PostgreSQL brutes ne sont jamais exposées (mapping FR
 *     générique, convention mapAccountError) ;
 *  5. `import "server-only"` fait échouer le build si ce module est importé
 *     depuis un Client Component. Aucune page ni interface dans cette PR.
 *
 * `resolveShareToken` est la seule fonction SANS garde admin : elle servira au
 * rendu SERVEUR de la page publique (PR3), où le jeton est lui-même la
 * capacité d'accès. Elle ne renvoie aucune donnée de présentation.
 */

/** Message FR générique (aucune erreur PostgreSQL brute exposée). */
export const SHARE_LINK_ERROR_FALLBACK =
  "Une erreur est survenue pendant l’opération sur le lien de partage.";

/**
 * Mapping des erreurs MÉTIER STABLES des RPC de liens vers des messages FR.
 * Toute autre erreur retombe sur SHARE_LINK_ERROR_FALLBACK.
 */
export const SHARE_LINK_ERROR_MESSAGES: Record<string, string> = {
  ACTOR_NOT_FOUND: "Le compte administrateur n’a pas pu être identifié.",
  PROFILE_NOT_FOUND: "Ce profil n’existe plus.",
  CONSENT_REQUIRED:
    "Ce membre n’a pas donné (ou a retiré) son autorisation de partage.",
  PROFILE_NOT_PUBLISHABLE:
    "Ce profil ne remplit pas les conditions de publication (compte actif, profil vérifié et complet).",
  LINK_ALREADY_ACTIVE:
    "Un lien de partage est déjà actif pour ce profil. Révoquez-le avant d’en créer un nouveau.",
  EXPIRY_TOO_SHORT: "L’expiration doit être d’au moins une heure.",
  EXPIRY_TOO_LONG: "L’expiration ne peut pas dépasser 30 jours.",
  LINK_NOT_FOUND: "Ce lien de partage n’existe plus.",
  REASON_LENGTH_INVALID: "Le motif ne peut pas dépasser 500 caractères.",
};

function mapShareLinkError(raw: string | null | undefined): {
  message: string;
  code?: string;
} {
  if (raw && raw in SHARE_LINK_ERROR_MESSAGES) {
    return { message: SHARE_LINK_ERROR_MESSAGES[raw], code: raw };
  }
  return { message: SHARE_LINK_ERROR_FALLBACK };
}

export type ShareLinkResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string };

/**
 * Crée un lien de partage pour `profileId` (admin uniquement). `token` n'est
 * retourné qu'une seule fois : à l'appelant de l'afficher immédiatement puis
 * de ne le conserver nulle part côté serveur.
 */
export async function createProfileShareLink(input: {
  profileId: string;
  /** ISO 8601, optionnel — défaut serveur : 7 jours (borné 1 h..30 jours). */
  expiresAt?: string | null;
}): Promise<ShareLinkResult<CreateProfileShareLinkResult>> {
  const auth = await resolveAdminActor();
  if (!auth.ok) return { ok: false, error: auth.error };

  if (!isUuid(input.profileId)) {
    return { ok: false, error: SHARE_LINK_ERROR_MESSAGES.PROFILE_NOT_FOUND };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("create_profile_share_link", {
    p_profile_id: input.profileId,
    p_actor_id: auth.actor.userId,
    p_expires_at: input.expiresAt ?? null,
  });

  if (error || !data?.[0]) {
    const mapped = mapShareLinkError(error?.message);
    return { ok: false, error: mapped.message, code: mapped.code };
  }
  return { ok: true, data: data[0] };
}

/**
 * Révoque un lien (admin uniquement). Idempotent : `alreadyRevoked` indique
 * qu'un précédent retrait avait déjà eu lieu (historique d'origine conservé).
 */
export async function revokeProfileShareLink(input: {
  linkId: string;
  reason?: string | null;
}): Promise<ShareLinkResult<{ alreadyRevoked: boolean }>> {
  const auth = await resolveAdminActor();
  if (!auth.ok) return { ok: false, error: auth.error };

  if (!isUuid(input.linkId)) {
    return { ok: false, error: SHARE_LINK_ERROR_MESSAGES.LINK_NOT_FOUND };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("revoke_profile_share_link", {
    p_link_id: input.linkId,
    p_actor_id: auth.actor.userId,
    p_reason: input.reason ?? null,
  });

  if (error) {
    const mapped = mapShareLinkError(error.message);
    return { ok: false, error: mapped.message, code: mapped.code };
  }
  return { ok: true, data: { alreadyRevoked: data === false } };
}

/**
 * Résout un jeton public côté SERVEUR (page publique PR3). Renvoie `null`
 * pour TOUT jeton invalide (inconnu, altéré, expiré, révoqué, consentement
 * retiré, profil non publiable) — aucune cause n'est distinguée, aucun UUID
 * ne doit être transmis au navigateur par l'appelant.
 */
export async function resolveShareToken(
  token: string,
): Promise<ResolveProfileShareLinkResult | null> {
  // Forme stricte du jeton (43 caractères base64 URL-safe) : tout écart est
  // rejeté sans requête, comme côté SQL.
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("resolve_profile_share_link", {
    p_token: token,
  });

  if (error || !data?.[0]) return null;
  return data[0];
}

/**
 * Liste les métadonnées des liens (admin uniquement, fiche membre PR4).
 * Jamais de jeton ni de hash dans le résultat.
 */
export async function listProfileShareLinks(input: {
  profileId?: string | null;
}): Promise<ShareLinkResult<AdminProfileShareLinkItem[]>> {
  const auth = await resolveAdminActor();
  if (!auth.ok) return { ok: false, error: auth.error };

  if (input.profileId != null && !isUuid(input.profileId)) {
    return { ok: false, error: SHARE_LINK_ERROR_MESSAGES.PROFILE_NOT_FOUND };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("admin_list_profile_share_links", {
    p_profile_id: input.profileId ?? null,
  });

  if (error) {
    const mapped = mapShareLinkError(error.message);
    return { ok: false, error: mapped.message, code: mapped.code };
  }
  return { ok: true, data: data ?? [] };
}
