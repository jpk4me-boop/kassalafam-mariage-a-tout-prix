"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUserId } from "@/lib/auth/admin";
import {
  SUSPENSION_REASON_MIN,
  SUSPENSION_REASON_MAX,
  isUuid,
  isAccountStatus,
  mapAccountModerationError,
  type AccountModerationActionState,
} from "@/lib/admin/account-moderation";

/**
 * Server Action de MODÉRATION DE COMPTE — SERVEUR UNIQUEMENT (L3F-C3B).
 *
 * Modèle de sécurité identique à /admin/verification et /admin/reports :
 *  1. lit la session via le client anon serveur (cookies) ;
 *  2. vérifie l'appartenance à l'allowlist admin (ADMIN_USER_IDS) ;
 *  3. n'instancie le client service_role qu'APRÈS validation admin.
 *
 * L'UNIQUE écriture possible est la RPC transactionnelle
 * `admin_set_account_status` (L3F-C3A) : aucun .update()/.insert()/.delete()
 * direct sur `profiles`, aucun accès au client Supabase navigateur, aucune clé
 * service_role dans le bundle client. `p_actor_id` provient EXCLUSIVEMENT de la
 * session admin validée — jamais du formulaire. `p_expected_status` porte l'état
 * affiché à l'admin (garde de concurrence optimiste, tranchée en base). La base
 * reste l'autorité finale ; cette validation serveur rejette tôt les entrées
 * invalides sans jamais exposer l'erreur PostgreSQL brute.
 *
 * NB — le motif est requis pour LES DEUX transitions : la RPC exige un motif
 * 10..2000 aussi bien pour suspendre que pour réactiver.
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

export async function setAccountStatusAction(input: {
  profileId: string;
  expectedStatus: string;
  newStatus: string;
  reason: string;
}): Promise<AccountModerationActionState> {
  // 1. Admin d'abord — avant toute création du client privilégié.
  const auth = await requireAdmin();
  if ("error" in auth) return { ok: false, error: auth.error };

  const profileId = input.profileId;
  const expectedStatus = input.expectedStatus;
  const newStatus = input.newStatus;
  const reason = (input.reason ?? "").trim();

  // 2. Validation serveur préalable (garde tôt ; la base tranche in fine).
  if (!isUuid(profileId)) {
    return { ok: false, error: "Ce membre n’existe plus." };
  }
  if (!isAccountStatus(expectedStatus) || !isAccountStatus(newStatus)) {
    return {
      ok: false,
      error: "Cette action n’est pas possible sur ce compte.",
    };
  }
  if (expectedStatus === newStatus) {
    return {
      ok: false,
      error: "Cette action n’est pas possible sur ce compte.",
    };
  }

  // 3. Garde d'AUTO-SUSPENSION : un administrateur ne peut pas suspendre son
  //    propre compte (éviter de se verrouiller hors du back-office). Cette garde
  //    est PROPRE à l'UI admin (le backend C3A ne l'impose pas) ; elle ne
  //    contourne aucune protection et n'affaiblit rien.
  //
  //    DETTE DE DURCISSEMENT BACKEND (hors L3F-C3B, aucune migration ici) :
  //    ajouter dans une NOUVELLE migration une garde SQL `p_actor_id <>
  //    p_profile_id` au sein de `admin_set_account_status`, afin de rendre
  //    l'invariant indépendant de TOUT appelant privilégié (pas seulement de
  //    cette Server Action). NE PAS modifier la migration C3A déjà appliquée.
  if (newStatus === "suspended" && profileId === auth.adminId) {
    return {
      ok: false,
      error: "Vous ne pouvez pas suspendre votre propre compte.",
    };
  }

  // 4. Motif OBLIGATOIRE (10..2000) pour LES DEUX transitions — miroir du CHECK
  //    DB et de la RPC. La base revalide ; ce contrôle évite un aller-retour.
  if (
    reason.length < SUSPENSION_REASON_MIN ||
    reason.length > SUSPENSION_REASON_MAX
  ) {
    return {
      ok: false,
      error: "Le motif doit contenir entre 10 et 2 000 caractères.",
    };
  }

  // 5. Écriture UNIQUE : RPC transactionnelle (service_role, serveur). Le
  //    client typé impose la présence des 5 paramètres requis ; p_report_id
  //    reste optionnel (non utilisé par cet écran généraliste de modération).
  const admin = createAdminClient();
  const { error } = await admin.rpc("admin_set_account_status", {
    p_profile_id: profileId,
    p_expected_status: expectedStatus,
    p_new_status: newStatus,
    p_reason: reason,
    p_actor_id: auth.adminId,
  });

  if (error) {
    const mapped = mapAccountModerationError(error.message);
    // Conflit de concurrence : invalider pour récupérer le statut récent.
    if (mapped.code === "ACCOUNT_STATUS_CONFLICT") {
      revalidatePath("/admin/members");
    }
    return { ok: false, error: mapped.message, code: mapped.code };
  }

  // 6. Succès : la liste doit refléter le nouvel état immédiatement.
  revalidatePath("/admin/members");
  return {
    ok: true,
    message: newStatus === "suspended" ? "Compte suspendu." : "Compte réactivé.",
  };
}
