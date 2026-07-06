"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAdminActor } from "@/lib/auth/admin-guard";
import {
  SAFETY_NOTE_MIN,
  SAFETY_NOTE_MAX,
  isUuid,
  isSafetyActionableStatus,
  isSafetyTargetStatus,
  isAllowedSafetyTransition,
  safetyNoteRequired,
  mapSafetyError,
  type SafetyReportActionState,
} from "@/lib/admin/safety-reports";

/**
 * Server Action de TRAITEMENT d'un signalement — SERVEUR UNIQUEMENT (L3F-C2B).
 *
 * Modèle de sécurité identique à /admin/verification :
 *  1. lit la session via le client anon serveur (cookies) ;
 *  2. vérifie l'appartenance à l'allowlist admin (ADMIN_USER_IDS) ;
 *  3. n'instancie le client service_role qu'APRÈS validation admin.
 *
 * L'UNIQUE écriture possible est la RPC transactionnelle
 * `admin_transition_safety_report` (L3F-C2A) : aucune opération directe
 * .update()/.insert()/.delete(), aucun accès au client Supabase navigateur.
 * `p_actor_id` provient EXCLUSIVEMENT de la session admin validée — jamais du
 * formulaire. `p_expected_status` porte l'état affiché à l'admin (garde de
 * concurrence optimiste, tranchée en base). La base reste l'autorité finale ;
 * cette validation serveur ne fait que rejeter tôt les entrées invalides et
 * n'expose jamais l'erreur PostgreSQL brute.
 *
 * Le contrôle d'accès est délégué à `resolveAdminActor` (garde centralisée),
 * qui inclut les super administrateurs.
 */

export async function transitionSafetyReportAction(input: {
  reportId: string;
  expectedStatus: string;
  newStatus: string;
  note: string;
}): Promise<SafetyReportActionState> {
  // 1. Admin d'abord — avant toute création du client privilégié.
  const auth = await resolveAdminActor();
  if (!auth.ok) return { ok: false, error: auth.error };

  const reportId = input.reportId;
  const expectedStatus = input.expectedStatus;
  const newStatus = input.newStatus;
  const note = (input.note ?? "").trim();

  // 2. Validation serveur préalable (garde tôt ; la base tranche in fine).
  if (!isUuid(reportId)) {
    return { ok: false, error: "Ce signalement n’existe plus." };
  }
  if (!isSafetyActionableStatus(expectedStatus)) {
    // expectedStatus doit valoir open | reviewing (états non terminaux).
    return {
      ok: false,
      error: "Cette transition de statut n’est pas autorisée.",
    };
  }
  if (!isSafetyTargetStatus(newStatus)) {
    return {
      ok: false,
      error: "Cette transition de statut n’est pas autorisée.",
    };
  }
  if (!isAllowedSafetyTransition(expectedStatus, newStatus)) {
    return {
      ok: false,
      error: "Cette transition de statut n’est pas autorisée.",
    };
  }

  // 3. Règles de note (miroir du CHECK DB) : obligatoire 10..2000 pour une
  //    décision finale ; facultative mais <= 2000 pour la prise en charge.
  if (safetyNoteRequired(newStatus)) {
    if (note.length < SAFETY_NOTE_MIN || note.length > SAFETY_NOTE_MAX) {
      return {
        ok: false,
        error: "La note doit contenir entre 10 et 2 000 caractères.",
      };
    }
  } else if (note.length > SAFETY_NOTE_MAX) {
    return {
      ok: false,
      error: "La note ne doit pas dépasser 2 000 caractères.",
    };
  }

  // 4. Écriture UNIQUE : RPC transactionnelle (service_role, serveur).
  const admin = createAdminClient();
  const { error } = await admin.rpc("admin_transition_safety_report", {
    p_report_id: reportId,
    p_expected_status: expectedStatus,
    p_new_status: newStatus,
    p_note: note.length > 0 ? note : null,
    p_actor_id: auth.actor.userId,
  });

  if (error) {
    const mapped = mapSafetyError(error.message);
    // Conflit de concurrence : invalider pour récupérer le statut récent.
    if (mapped.code === "REPORT_STATUS_CONFLICT") {
      revalidatePath("/admin/reports");
    }
    return { ok: false, error: mapped.message, code: mapped.code };
  }

  // 5. Succès : la liste (et l'historique) doivent refléter le nouvel état.
  revalidatePath("/admin/reports");
  return { ok: true, message: "Signalement mis à jour." };
}
