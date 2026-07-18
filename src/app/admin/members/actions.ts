"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAdminActor } from "@/lib/auth/admin-guard";
import {
  SUSPENSION_REASON_MIN,
  SUSPENSION_REASON_MAX,
  mapAccountError,
  isUuid,
  type AccountActionState,
} from "@/lib/admin/account-moderation";

/**
 * Server Action de MODÉRATION DE COMPTE — SERVEUR UNIQUEMENT (L3G).
 *
 * Modèle de sécurité identique aux autres actions admin :
 *  1. lit la session (cookies) et vérifie l'appartenance admin AVANT tout
 *     privilège (`resolveAdminActor`) ;
 *  2. n'instancie service_role qu'APRÈS validation admin ;
 *  3. l'UNIQUE écriture est la RPC transactionnelle `admin_set_account_status`
 *     (L3F-C3A) : verrou + concurrence optimiste + journal, dans UNE
 *     transaction. Aucune opération directe .update()/.insert()/.delete().
 *
 * `p_actor_id` vient EXCLUSIVEMENT de la session admin validée (jamais du
 * formulaire). `p_expected_status` porte l'état vu par l'admin (garde de
 * concurrence, tranchée en base). Les erreurs PostgreSQL brutes ne sont jamais
 * exposées (mapAccountError). Réservé aux transitions active ↔ suspended ; la
 * SUPPRESSION définitive n'est PAS implémentée ici (réservée super admin, phase
 * ultérieure).
 */
export async function setAccountStatusAction(input: {
  profileId: string;
  expectedStatus: string;
  newStatus: string;
  reason: string;
  reportId?: string | null;
}): Promise<AccountActionState> {
  // 1. Admin d'abord — avant toute création du client privilégié.
  const auth = await resolveAdminActor();
  if (!auth.ok) return { ok: false, error: auth.error };

  const profileId = input.profileId;
  const expectedStatus = input.expectedStatus;
  const newStatus = input.newStatus;
  const reason = (input.reason ?? "").trim();
  const reportId = input.reportId ?? null;

  // 2. Validation serveur préalable (la base tranche in fine).
  if (!isUuid(profileId)) {
    return { ok: false, error: "Ce membre n’existe plus." };
  }
  // Auto-modération interdite (défense en profondeur ; l'invariant autoritatif
  // est la garde SELF_MODERATION_FORBIDDEN de la RPC). L'identifiant de
  // l'acteur vient EXCLUSIVEMENT de la session validée, jamais du formulaire.
  if (profileId === auth.actor.userId) {
    return {
      ok: false,
      error: "Vous ne pouvez pas modifier le statut de votre propre compte.",
      code: "SELF_MODERATION_FORBIDDEN",
    };
  }
  if (expectedStatus !== "active" && expectedStatus !== "suspended") {
    return { ok: false, error: "Cette transition n’est pas autorisée." };
  }
  if (newStatus !== "active" && newStatus !== "suspended") {
    return { ok: false, error: "Cette transition n’est pas autorisée." };
  }
  if (newStatus === expectedStatus) {
    return { ok: false, error: "Le compte est déjà dans cet état." };
  }
  if (reason.length < SUSPENSION_REASON_MIN || reason.length > SUSPENSION_REASON_MAX) {
    return {
      ok: false,
      error: "Le motif doit contenir entre 10 et 2 000 caractères.",
    };
  }
  if (reportId !== null && !isUuid(reportId)) {
    return { ok: false, error: "Le signalement associé est invalide." };
  }

  // 3. Écriture UNIQUE : RPC transactionnelle (service_role, serveur).
  const admin = createAdminClient();
  const { error } = await admin.rpc("admin_set_account_status", {
    p_profile_id: profileId,
    p_expected_status: expectedStatus,
    p_new_status: newStatus,
    p_reason: reason,
    p_actor_id: auth.actor.userId,
    p_report_id: reportId,
  });

  if (error) {
    const mapped = mapAccountError(error.message);
    if (mapped.code === "ACCOUNT_STATUS_CONFLICT") {
      revalidatePath("/admin/members");
    }
    return { ok: false, error: mapped.message, code: mapped.code };
  }

  // 4. Succès : rafraîchir la liste, la fiche, le journal et les analyses.
  revalidatePath("/admin/members");
  revalidatePath("/admin/audit");
  revalidatePath("/admin/analytics");
  revalidatePath("/dashboard");
  return {
    ok: true,
    message:
      newStatus === "suspended"
        ? "Compte suspendu."
        : "Compte réactivé.",
  };
}
