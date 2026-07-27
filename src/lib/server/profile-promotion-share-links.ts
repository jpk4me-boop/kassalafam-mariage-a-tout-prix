import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAdminActor } from "@/lib/auth/admin-guard";
import { isUuid } from "@/lib/admin/safety-reports";
import type { Database } from "@/lib/types/database";

export type ProfilePromotionShareChannel =
  | "facebook"
  | "instagram"
  | "snapchat"
  | "whatsapp";

export type ProfilePromotionShareLinkStatus =
  | "active"
  | "expired"
  | "revoked"
  | "invalidated";

export type CreateProfilePromotionShareLinkResult = {
  link_id: string;
  token: string;
  token_prefix: string;
  channel: ProfilePromotionShareChannel;
  expires_at: string;
  consent_expires_at: string;
};

export type ResolveProfilePromotionShareLinkResult = {
  link_id: string;
  profile_id: string;
  consent_id: string;
  photo_id: string;
  channel: ProfilePromotionShareChannel;
  expires_at: string;
};

export type AdminProfilePromotionShareLinkItem = {
  link_id: string;
  profile_id: string;
  consent_id: string;
  photo_id: string | null;
  token_prefix: string;
  channel: ProfilePromotionShareChannel;
  created_by: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  revoked_by: string | null;
  revocation_reason: string | null;
  status: ProfilePromotionShareLinkStatus;
};

export type AdminProfilePromotionShareStatus = {
  profile_id: string;
  consent_id: string | null;
  photo_id: string | null;
  channels: ProfilePromotionShareChannel[];
  consented_at: string | null;
  consent_expires_at: string | null;
  effectively_shareable: boolean;
  eligibility_reason: string;
  active_link_count: number;
};

export type ProfilePromotionShareResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string };

type ProfilePromotionShareStatusRpcRow = Omit<
  AdminProfilePromotionShareStatus,
  "channels" | "active_link_count"
> & {
  channels: unknown;
  active_link_count: number | string;
};

/**
 * Extension locale des RPC introduites par la migration de cette PR.
 *
 * Les types globaux de Database restent alignés sur la base actuellement
 * déployée. Cette extension disparaîtra lorsque les types Supabase seront
 * régénérés après l'application explicitement autorisée de la migration.
 */
type ProfilePromotionRpcDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Functions"> & {
    Functions: Database["public"]["Functions"] & {
      create_profile_promotion_share_link: {
        Args: {
          p_profile_id: string;
          p_actor_id: string;
          p_channel: ProfilePromotionShareChannel;
          p_expires_at?: string | null;
        };
        Returns: CreateProfilePromotionShareLinkResult[];
      };
      revoke_profile_promotion_share_link: {
        Args: {
          p_link_id: string;
          p_actor_id: string;
          p_reason?: string | null;
        };
        Returns: boolean;
      };
      admin_list_profile_promotion_share_links: {
        Args: { p_profile_id?: string | null };
        Returns: AdminProfilePromotionShareLinkItem[];
      };
      admin_get_profile_promotion_share_status: {
        Args: { p_profile_ids: string[] };
        Returns: ProfilePromotionShareStatusRpcRow[];
      };
      resolve_profile_promotion_share_link: {
        Args: { p_token: string };
        Returns: ResolveProfilePromotionShareLinkResult[];
      };
    };
  };
};

function createPromotionAdminClient(): SupabaseClient<ProfilePromotionRpcDatabase> {
  return createAdminClient() as unknown as SupabaseClient<ProfilePromotionRpcDatabase>;
}

const CHANNELS = new Set<ProfilePromotionShareChannel>([
  "facebook",
  "instagram",
  "snapchat",
  "whatsapp",
]);

const ERROR_MESSAGES: Record<string, string> = {
  ACTOR_NOT_FOUND: "Le compte administrateur n’a pas pu être identifié.",
  PROFILE_NOT_FOUND: "Ce profil n’existe plus.",
  INVALID_PROMOTION_CHANNEL: "Ce réseau social n’est pas pris en charge.",
  PROMOTION_CONSENT_REQUIRED:
    "Ce membre n’a pas autorisé la promotion de son profil.",
  PROMOTION_CONSENT_EXPIRED:
    "L’autorisation promotionnelle de ce membre a expiré.",
  PROMOTION_CHANNEL_NOT_AUTHORIZED:
    "Le membre n’a pas autorisé ce réseau social.",
  EXPIRY_TOO_SHORT: "Le lien doit rester valide pendant au moins une heure.",
  EXPIRY_TOO_LONG: "Le lien ne peut pas dépasser 30 jours.",
  EXPIRY_EXCEEDS_PROMOTION_CONSENT:
    "La durée demandée dépasse l’autorisation promotionnelle du membre.",
  ACTIVE_PROMOTION_LINK_LIMIT_REACHED:
    "La limite de liens promotionnels actifs est atteinte pour ce réseau.",
  PROMOTION_LINK_NOT_FOUND: "Ce lien promotionnel n’existe plus.",
  REASON_LENGTH_INVALID: "Le motif ne peut pas dépasser 500 caractères.",
};

const ELIGIBILITY_MESSAGES: Record<string, string> = {
  profile_not_found: "Ce profil n’existe plus.",
  account_suspended: "Le compte de ce membre est suspendu.",
  verification_required: "Le profil doit d’abord être approuvé.",
  onboarding_incomplete: "Le membre doit terminer son profil.",
  profile_incomplete: "Le profil ne contient pas toutes les informations requises.",
  photo_privacy_enabled:
    "Le membre a activé la protection de ses photos.",
  consent_required: "Le membre n’a pas autorisé la promotion de son profil.",
  consent_expired: "L’autorisation promotionnelle a expiré.",
  channel_not_authorized: "Ce réseau n’a pas été autorisé par le membre.",
  photo_required: "Aucune photo promotionnelle n’a été choisie.",
  photo_invalid: "La photo promotionnelle n’est plus utilisable.",
};

const FALLBACK_ERROR =
  "L’opération sur le lien promotionnel n’a pas pu être effectuée.";

function mapError(raw: string | null | undefined): {
  error: string;
  code?: string;
} {
  if (!raw) return { error: FALLBACK_ERROR };

  if (raw in ERROR_MESSAGES) {
    return { error: ERROR_MESSAGES[raw], code: raw };
  }

  const eligibilityPrefix = "PROMOTION_PROFILE_NOT_SHAREABLE:";
  if (raw.startsWith(eligibilityPrefix)) {
    const reason = raw.slice(eligibilityPrefix.length);
    return {
      error:
        ELIGIBILITY_MESSAGES[reason] ??
        "Ce profil ne remplit pas les conditions de partage.",
      code: reason,
    };
  }

  return { error: FALLBACK_ERROR };
}

function isChannel(value: string): value is ProfilePromotionShareChannel {
  return CHANNELS.has(value as ProfilePromotionShareChannel);
}

function normalizeChannels(values: unknown): ProfilePromotionShareChannel[] {
  if (!Array.isArray(values)) return [];
  return values.filter(
    (value): value is ProfilePromotionShareChannel =>
      typeof value === "string" && isChannel(value),
  );
}

function normalizeStatusRow(
  row: Omit<AdminProfilePromotionShareStatus, "channels" | "active_link_count"> & {
    channels: unknown;
    active_link_count: number | string;
  },
): AdminProfilePromotionShareStatus {
  return {
    ...row,
    channels: normalizeChannels(row.channels),
    active_link_count: Number(row.active_link_count) || 0,
  };
}

/**
 * Crée un lien opaque pour un réseau explicitement autorisé par le membre.
 * Le jeton en clair n’est disponible que dans cette valeur de retour.
 */
export async function createProfilePromotionShareLink(input: {
  profileId: string;
  channel: ProfilePromotionShareChannel;
  expiresAt?: string | null;
}): Promise<
  ProfilePromotionShareResult<CreateProfilePromotionShareLinkResult>
> {
  const auth = await resolveAdminActor();
  if (!auth.ok) return { ok: false, error: auth.error };

  if (!isUuid(input.profileId)) {
    return { ok: false, error: ERROR_MESSAGES.PROFILE_NOT_FOUND };
  }

  if (!isChannel(input.channel)) {
    return {
      ok: false,
      error: ERROR_MESSAGES.INVALID_PROMOTION_CHANNEL,
      code: "INVALID_PROMOTION_CHANNEL",
    };
  }

  const admin = createPromotionAdminClient();
  const { data, error } = await admin.rpc(
    "create_profile_promotion_share_link",
    {
      p_profile_id: input.profileId,
      p_actor_id: auth.actor.userId,
      p_channel: input.channel,
      p_expires_at: input.expiresAt ?? null,
    },
  );

  if (error || !data?.[0]) {
    const mapped = mapError(error?.message);
    return { ok: false, ...mapped };
  }

  const row = data[0] as CreateProfilePromotionShareLinkResult;
  if (!isChannel(row.channel)) {
    return { ok: false, error: FALLBACK_ERROR };
  }

  return { ok: true, data: row };
}

/** Révoque un lien sans supprimer son historique. */
export async function revokeProfilePromotionShareLink(input: {
  linkId: string;
  reason?: string | null;
}): Promise<ProfilePromotionShareResult<{ alreadyRevoked: boolean }>> {
  const auth = await resolveAdminActor();
  if (!auth.ok) return { ok: false, error: auth.error };

  if (!isUuid(input.linkId)) {
    return { ok: false, error: ERROR_MESSAGES.PROMOTION_LINK_NOT_FOUND };
  }

  const admin = createPromotionAdminClient();
  const { data, error } = await admin.rpc(
    "revoke_profile_promotion_share_link",
    {
      p_link_id: input.linkId,
      p_actor_id: auth.actor.userId,
      p_reason: input.reason ?? null,
    },
  );

  if (error) {
    const mapped = mapError(error.message);
    return { ok: false, ...mapped };
  }

  return { ok: true, data: { alreadyRevoked: data === false } };
}

/** Liste les métadonnées administratives, jamais les jetons ni leurs hashes. */
export async function listProfilePromotionShareLinks(input: {
  profileId?: string | null;
}): Promise<
  ProfilePromotionShareResult<AdminProfilePromotionShareLinkItem[]>
> {
  const auth = await resolveAdminActor();
  if (!auth.ok) return { ok: false, error: auth.error };

  if (input.profileId != null && !isUuid(input.profileId)) {
    return { ok: false, error: ERROR_MESSAGES.PROFILE_NOT_FOUND };
  }

  const admin = createPromotionAdminClient();
  const { data, error } = await admin.rpc(
    "admin_list_profile_promotion_share_links",
    { p_profile_id: input.profileId ?? null },
  );

  if (error) {
    const mapped = mapError(error.message);
    return { ok: false, ...mapped };
  }

  return {
    ok: true,
    data: (data ?? []) as AdminProfilePromotionShareLinkItem[],
  };
}

/**
 * Charge en un seul appel le consentement et l’éligibilité nécessaires aux
 * cartes de la page /admin/members.
 */
export async function getProfilePromotionShareStatuses(input: {
  profileIds: string[];
}): Promise<
  ProfilePromotionShareResult<AdminProfilePromotionShareStatus[]>
> {
  const auth = await resolveAdminActor();
  if (!auth.ok) return { ok: false, error: auth.error };

  const profileIds = Array.from(new Set(input.profileIds));
  if (profileIds.length > 100 || profileIds.some((id) => !isUuid(id))) {
    return {
      ok: false,
      error: "La liste des membres demandée est invalide.",
      code: "INVALID_PROFILE_IDS",
    };
  }

  if (profileIds.length === 0) return { ok: true, data: [] };

  const admin = createPromotionAdminClient();
  const { data, error } = await admin.rpc(
    "admin_get_profile_promotion_share_status",
    { p_profile_ids: profileIds },
  );

  if (error) {
    const mapped = mapError(error.message);
    return { ok: false, ...mapped };
  }

  return {
    ok: true,
    data: (data ?? []).map(normalizeStatusRow),
  };
}

/**
 * Résout un jeton côté serveur pour la future route /promo/[token].
 * Toute invalidité retourne null sans distinguer la cause.
 */
export async function resolveProfilePromotionShareToken(
  token: string,
): Promise<ResolveProfilePromotionShareLinkResult | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;

  const admin = createPromotionAdminClient();
  const { data, error } = await admin.rpc(
    "resolve_profile_promotion_share_link",
    { p_token: token },
  );

  if (error || !data?.[0]) return null;

  const row = data[0] as ResolveProfilePromotionShareLinkResult;
  return isChannel(row.channel) ? row : null;
}
