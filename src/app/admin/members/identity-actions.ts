"use server";

import { revalidatePath } from "next/cache";

import { resolveSuperAdminActor } from "@/lib/auth/admin-guard";
import {
  IDENTITY_REASON_MAX,
  IDENTITY_REASON_MIN,
  adultCutoffIsoDate,
  isIdentityGender,
  isIdentityUuid,
  isValidIsoDate,
  mapIdentityCorrectionError,
  type IdentityCorrectionActionState,
} from "@/lib/admin/identity-correction";
import { createAdminClient } from "@/lib/supabase/admin";

export async function correctProfileIdentityAction(input: {
  profileId: string;
  gender?: string | null;
  birthDate?: string | null;
  reason: string;
}): Promise<IdentityCorrectionActionState> {
  // La session et SUPER_ADMIN_USER_IDS sont validés AVANT l'instanciation du
  // client service_role. actorId n'est jamais accepté depuis le navigateur.
  const auth = await resolveSuperAdminActor();
  if (!auth.ok) return { ok: false, error: auth.error };

  const profileId = input.profileId.trim();
  const gender = input.gender?.trim() || null;
  const birthDate = input.birthDate?.trim() || null;
  const reason = input.reason.trim();

  if (!isIdentityUuid(profileId)) {
    return { ok: false, error: "Ce membre n’existe plus." };
  }

  if (profileId === auth.actor.userId) {
    return {
      ok: false,
      error:
        "Vous ne pouvez pas corriger les champs d’identité de votre propre compte.",
      code: "SELF_IDENTITY_CORRECTION_FORBIDDEN",
    };
  }

  if (!isIdentityGender(gender)) {
    return { ok: false, error: "Le genre demandé est invalide." };
  }

  if (birthDate !== null) {
    if (!isValidIsoDate(birthDate)) {
      return { ok: false, error: "La date de naissance est invalide." };
    }

    if (birthDate > adultCutoffIsoDate()) {
      return {
        ok: false,
        error:
          "La date de naissance doit correspondre à un âge d’au moins 18 ans.",
      };
    }
  }

  if (reason.length < IDENTITY_REASON_MIN || reason.length > IDENTITY_REASON_MAX) {
    return {
      ok: false,
      error: "Le motif doit contenir entre 10 et 2 000 caractères.",
    };
  }

  const admin = createAdminClient();
  const { error } = await admin.rpc("admin_correct_profile_identity_fields", {
    p_profile_id: profileId,
    p_gender: gender,
    p_birth_date: birthDate,
    p_reason: reason,
    p_actor_id: auth.actor.userId,
  });

  if (error) {
    const mapped = mapIdentityCorrectionError(error.message);
    return { ok: false, error: mapped.message, code: mapped.code };
  }

  revalidatePath("/admin/members");
  revalidatePath(`/admin/members/${profileId}`);
  revalidatePath("/admin/audit");
  revalidatePath("/admin/analytics");

  return {
    ok: true,
    message: "Les champs d’identité ont été corrigés et journalisés.",
  };
}