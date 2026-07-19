"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import type {
  CreateProfileShareLinkResult,
  MemberProfileShareLinkItem,
} from "@/lib/types/database";

export type ProfileShareDuration = "1d" | "7d" | "30d";

export type ProfileShareActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string };

const DURATION_MS: Record<ProfileShareDuration, number> = {
  "1d": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

const ERROR_MESSAGES: Record<string, string> = {
  ACCOUNT_SUSPENDED:
    "Votre compte est suspendu. Vous ne pouvez pas créer ou renouveler un lien.",
  CONSENT_REQUIRED:
    "Autorisez d’abord le partage public limité de votre profil.",
  PROFILE_NOT_PUBLISHABLE:
    "Votre profil doit être actif, vérifié et entièrement complété avant le partage.",
  LINK_ALREADY_ACTIVE:
    "Un lien est déjà actif. Révoquez-le ou remplacez-le pour obtenir une nouvelle adresse.",
  EXPIRY_TOO_SHORT: "La durée du lien est trop courte.",
  EXPIRY_TOO_LONG: "La durée du lien dépasse la limite autorisée.",
  LINK_NOT_FOUND: "Ce lien n’existe plus ou ne vous appartient pas.",
  PROFILE_NOT_FOUND: "Votre profil n’existe plus.",
};

const FALLBACK_ERROR =
  "L’opération sur votre lien de partage n’a pas pu être effectuée. Réessayez.";

function mapError(raw: string | null | undefined): {
  error: string;
  code?: string;
} {
  if (raw && raw in ERROR_MESSAGES) {
    return { error: ERROR_MESSAGES[raw], code: raw };
  }
  return { error: FALLBACK_ERROR };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

async function authenticatedClient() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      ok: false as const,
      result: {
        ok: false as const,
        error: "Session expirée. Veuillez vous reconnecter.",
        code: "AUTH_REQUIRED",
      },
    };
  }

  return { ok: true as const, supabase };
}

function expiresAt(duration: ProfileShareDuration): string {
  return new Date(Date.now() + DURATION_MS[duration]).toISOString();
}

export async function getMyProfileShareLinkAction(): Promise<
  ProfileShareActionResult<MemberProfileShareLinkItem | null>
> {
  const auth = await authenticatedClient();
  if (!auth.ok) return auth.result;

  const { data, error } = await auth.supabase.rpc(
    "get_my_profile_share_link_status",
  );

  if (error) {
    const mapped = mapError(error.message);
    return { ok: false, ...mapped };
  }

  return { ok: true, data: data?.[0] ?? null };
}

export async function createMyProfileShareLinkAction(input: {
  duration: ProfileShareDuration;
}): Promise<ProfileShareActionResult<CreateProfileShareLinkResult>> {
  const auth = await authenticatedClient();
  if (!auth.ok) return auth.result;

  if (!(input.duration in DURATION_MS)) {
    return { ok: false, error: "Durée de partage invalide." };
  }

  const { data, error } = await auth.supabase.rpc(
    "create_my_profile_share_link",
    { p_expires_at: expiresAt(input.duration) },
  );

  if (error || !data?.[0]) {
    const mapped = mapError(error?.message);
    return { ok: false, ...mapped };
  }

  revalidatePath("/profile");
  return { ok: true, data: data[0] };
}

export async function rotateMyProfileShareLinkAction(input: {
  duration: ProfileShareDuration;
}): Promise<ProfileShareActionResult<CreateProfileShareLinkResult>> {
  const auth = await authenticatedClient();
  if (!auth.ok) return auth.result;

  if (!(input.duration in DURATION_MS)) {
    return { ok: false, error: "Durée de partage invalide." };
  }

  const { data, error } = await auth.supabase.rpc(
    "rotate_my_profile_share_link",
    { p_expires_at: expiresAt(input.duration) },
  );

  if (error || !data?.[0]) {
    const mapped = mapError(error?.message);
    return { ok: false, ...mapped };
  }

  revalidatePath("/profile");
  return { ok: true, data: data[0] };
}

export async function revokeMyProfileShareLinkAction(input: {
  linkId: string;
}): Promise<ProfileShareActionResult<{ alreadyRevoked: boolean }>> {
  const auth = await authenticatedClient();
  if (!auth.ok) return auth.result;

  if (!isUuid(input.linkId)) {
    return { ok: false, error: ERROR_MESSAGES.LINK_NOT_FOUND };
  }

  const { data, error } = await auth.supabase.rpc(
    "revoke_my_profile_share_link",
    { p_link_id: input.linkId },
  );

  if (error) {
    const mapped = mapError(error.message);
    return { ok: false, ...mapped };
  }

  revalidatePath("/profile");
  return { ok: true, data: { alreadyRevoked: data === false } };
}
