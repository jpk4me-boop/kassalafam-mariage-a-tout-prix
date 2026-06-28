"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUserId } from "@/lib/auth/admin";
import {
  type ActionResult,
  REJECTION_REASON_MIN,
  REJECTION_REASON_MAX,
} from "@/lib/admin/verification";

/**
 * Server Actions de modération — SERVEUR UNIQUEMENT (L3-B2A).
 *
 * Chaque action :
 *  1. lit la session via le client anon serveur (cookies),
 *  2. vérifie que l'appelant est admin (allowlist ADMIN_USER_IDS),
 *  3. n'instancie le client service_role qu'APRÈS validation admin.
 *
 * Le client service_role a auth.uid() = NULL : il passe le trigger
 * trg_profiles_guard_verification qui bloque les membres. Aucune clé
 * service_role n'est jamais exposée au client (ces fonctions ne tournent
 * que côté serveur ; le Client Component n'en reçoit qu'une référence RPC).
 */

async function requireAdmin(): Promise<
  { adminId: string } | { error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Session expirée. Reconnectez-vous." };
  if (!isAdminUserId(user.id)) return { error: "Accès non autorisé." };
  return { adminId: user.id };
}

export async function approveProfileAction(
  profileId: string,
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if ("error" in auth) return { ok: false, error: auth.error };
  if (!profileId) return { ok: false, error: "Profil introuvable." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({
      verification_status: "approved",
      verification_reviewed_at: new Date().toISOString(),
      verification_reviewed_by: auth.adminId,
      verification_rejection_reason: null,
    })
    .eq("id", profileId);

  if (error) return { ok: false, error: "Mise à jour impossible. Réessayez." };

  revalidatePath("/admin/verification");
  return { ok: true };
}

export async function rejectProfileAction(
  profileId: string,
  reasonRaw: string,
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if ("error" in auth) return { ok: false, error: auth.error };
  if (!profileId) return { ok: false, error: "Profil introuvable." };

  const reason = (reasonRaw ?? "").trim();
  if (reason.length < REJECTION_REASON_MIN) {
    return {
      ok: false,
      error: `Le motif de rejet doit contenir au moins ${REJECTION_REASON_MIN} caractères.`,
    };
  }
  if (reason.length > REJECTION_REASON_MAX) {
    return {
      ok: false,
      error: `Le motif de rejet ne doit pas dépasser ${REJECTION_REASON_MAX} caractères.`,
    };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({
      verification_status: "rejected",
      verification_reviewed_at: new Date().toISOString(),
      verification_reviewed_by: auth.adminId,
      verification_rejection_reason: reason,
    })
    .eq("id", profileId);

  if (error) return { ok: false, error: "Mise à jour impossible. Réessayez." };

  revalidatePath("/admin/verification");
  return { ok: true };
}
