"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAdminActor } from "@/lib/auth/admin-guard";
import {
  type ActionResult,
  REJECTION_REASON_MIN,
  REJECTION_REASON_MAX,
  mapVerificationError,
} from "@/lib/admin/verification";
import { isUuid } from "@/lib/admin/safety-reports";
import {
  buildVerificationNotification,
  type VerificationNotificationStatus,
} from "@/lib/notifications";

/**
 * Crée la notification membre après une action admin réussie. Best-effort :
 * une notification qui échoue ne doit PAS faire échouer le changement de statut
 * déjà appliqué (déjà écrit en base par la RPC transactionnelle). L'échec est
 * journalisé de façon sécurisée (aucun secret). profileId == auth.users.id.
 */
async function createVerificationNotification(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  status: VerificationNotificationStatus,
  motif: string | null,
): Promise<void> {
  const notif = buildVerificationNotification(status, motif);
  const { error } = await admin.from("member_notifications").insert({
    user_id: userId,
    type: notif.type,
    title: notif.title,
    body: notif.body,
    verification_status: status,
    related_profile_id: userId,
  });
  if (error) {
    // Log sécurisé : message d'erreur Supabase uniquement (jamais de clé).
    console.error("[notifications] création échouée:", error.message);
  }
}

/**
 * Server Actions de vérification — SERVEUR UNIQUEMENT (L3-B2A → L3G).
 *
 * Chaque action :
 *  1. lit la session via le client anon serveur (cookies) et vérifie l'admin
 *     (allowlist ADMIN_USER_IDS) via `resolveAdminActor` — AVANT tout privilège ;
 *  2. n'instancie le client service_role qu'APRÈS validation admin ;
 *  3. écrit via l'UNIQUE chemin transactionnel `admin_set_verification_status`
 *     (L3G) : verrou + concurrence optimiste (p_expected_status) + validation +
 *     UPDATE verification_* + INSERT admin_audit_log, dans UNE transaction.
 *
 * Aucun `.update()` direct : la décision et son historique d'audit sont
 * atomiques. `p_actor_id` provient EXCLUSIVEMENT de la session admin validée.
 * Les erreurs PostgreSQL brutes ne sont jamais exposées (mapVerificationError).
 * La notification membre reste best-effort APRÈS le succès.
 */

/** Chemins à revalider après une décision de vérification réussie. */
function revalidateVerificationPaths(): void {
  revalidatePath("/admin/verification");
  revalidatePath("/admin/members");
  revalidatePath("/admin/audit");
  revalidatePath("/dashboard");
}

/** Appel commun à la RPC transactionnelle + mapping d'erreurs. */
async function applyVerification(
  actorId: string,
  profileId: string,
  expectedStatus: string,
  newStatus: "approved" | "rejected" | "paused",
  reason: string | null,
): Promise<ActionResult> {
  const admin = createAdminClient();
  const { error } = await admin.rpc("admin_set_verification_status", {
    p_profile_id: profileId,
    p_expected_status: expectedStatus,
    p_new_status: newStatus,
    p_reason: reason,
    p_actor_id: actorId,
  });

  if (error) {
    const mapped = mapVerificationError(error.message);
    // Conflit de concurrence : invalider pour récupérer le statut récent.
    if (mapped.code === "VERIFICATION_STATUS_CONFLICT") {
      revalidateVerificationPaths();
    }
    return { ok: false, error: mapped.message, code: mapped.code };
  }

  // Notification best-effort (ne bloque jamais le succès déjà écrit).
  const notifStatus: VerificationNotificationStatus = newStatus;
  await createVerificationNotification(admin, profileId, notifStatus, reason);

  revalidateVerificationPaths();
  return { ok: true };
}

function validateReason(
  reasonRaw: string,
  kind: "rejet" | "pause",
): { ok: true; value: string } | { ok: false; error: string } {
  const reason = (reasonRaw ?? "").trim();
  if (reason.length < REJECTION_REASON_MIN) {
    return {
      ok: false,
      error: `Le motif de ${kind} doit contenir au moins ${REJECTION_REASON_MIN} caractères.`,
    };
  }
  if (reason.length > REJECTION_REASON_MAX) {
    return {
      ok: false,
      error: `Le motif de ${kind} ne doit pas dépasser ${REJECTION_REASON_MAX} caractères.`,
    };
  }
  return { ok: true, value: reason };
}

export async function approveProfileAction(
  profileId: string,
  expectedStatus: string,
): Promise<ActionResult> {
  const auth = await resolveAdminActor();
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!isUuid(profileId)) return { ok: false, error: "Profil introuvable." };

  return applyVerification(
    auth.actor.userId,
    profileId,
    expectedStatus,
    "approved",
    null,
  );
}

export async function pauseProfileAction(
  profileId: string,
  reasonRaw: string,
  expectedStatus: string,
): Promise<ActionResult> {
  const auth = await resolveAdminActor();
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!isUuid(profileId)) return { ok: false, error: "Profil introuvable." };

  const reason = validateReason(reasonRaw, "pause");
  if (!reason.ok) return { ok: false, error: reason.error };

  return applyVerification(
    auth.actor.userId,
    profileId,
    expectedStatus,
    "paused",
    reason.value,
  );
}

export async function rejectProfileAction(
  profileId: string,
  reasonRaw: string,
  expectedStatus: string,
): Promise<ActionResult> {
  const auth = await resolveAdminActor();
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!isUuid(profileId)) return { ok: false, error: "Profil introuvable." };

  const reason = validateReason(reasonRaw, "rejet");
  if (!reason.ok) return { ok: false, error: reason.error };

  return applyVerification(
    auth.actor.userId,
    profileId,
    expectedStatus,
    "rejected",
    reason.value,
  );
}
