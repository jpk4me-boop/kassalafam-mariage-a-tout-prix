import "server-only";

import { notFound, redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { isAdminUserId, isSuperAdminUserId } from "@/lib/auth/admin";

/**
 * Gardes d'accès back-office — SERVEUR UNIQUEMENT.
 *
 * Centralise le contrôle d'accès à toutes les pages `/admin/*` et aux Server
 * Actions de modération, afin de ne PAS dupliquer la logique
 * `getUser() → allowlist` dans chaque fichier.
 *
 * Politique :
 *  - non authentifié  → `redirect` vers /login (avec retour) pour une PAGE ;
 *  - authentifié mais non admin → `notFound()` (404, ne révèle pas le
 *    back-office ni ne confirme l'existence d'un espace protégé) ;
 *  - action super-admin sur un simple admin → `notFound()` également.
 *
 * `import "server-only"` garantit un échec de build si ce module est
 * accidentellement importé dans un bundle client.
 */

export type AdminContext = {
  /** UUID `auth.users` de l'appelant validé. Jamais transmis au navigateur. */
  userId: string;
  /** Email de l'appelant (best-effort, depuis la session). */
  email: string | null;
  /** `true` si l'appelant appartient à SUPER_ADMIN_USER_IDS. */
  isSuperAdmin: boolean;
};

async function getSessionUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Garde de PAGE : exige un administrateur (super admin inclus). Redirige vers
 * la connexion si non authentifié, renvoie 404 si non autorisé. Retourne le
 * contexte admin (dont `isSuperAdmin`) sinon.
 *
 * @param redirectPath chemin de retour encodé dans /login?redirect=…
 */
export async function requireAdmin(redirectPath: string): Promise<AdminContext> {
  const user = await getSessionUser();
  if (!user) {
    redirect(`/login?redirect=${encodeURIComponent(redirectPath)}`);
  }
  if (!isAdminUserId(user.id)) {
    // 404 plutôt que 403 : ne révèle pas l'existence du back-office.
    notFound();
  }
  return {
    userId: user.id,
    email: user.email ?? null,
    isSuperAdmin: isSuperAdminUserId(user.id),
  };
}

/**
 * Garde de PAGE : exige un SUPER administrateur. Un simple admin (ou un membre)
 * reçoit une 404. À utiliser pour les fonctions sensibles (modération de
 * comptes, paramètres plateforme, journal d'administration).
 */
export async function requireSuperAdmin(
  redirectPath: string,
): Promise<AdminContext> {
  const ctx = await requireAdmin(redirectPath);
  if (!ctx.isSuperAdmin) {
    notFound();
  }
  return ctx;
}

/**
 * Variante NON bloquante pour les Server Actions : renvoie un résultat plutôt
 * que de rediriger / lever une 404, afin que l'action puisse retourner un
 * message d'erreur exploitable par l'UI (formulaire).
 */
export type AdminActorResult =
  | { ok: true; actor: AdminContext }
  | { ok: false; error: string };

export async function resolveAdminActor(): Promise<AdminActorResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Session expirée. Reconnectez-vous." };
  if (!isAdminUserId(user.id)) {
    return { ok: false, error: "Accès non autorisé." };
  }
  return {
    ok: true,
    actor: {
      userId: user.id,
      email: user.email ?? null,
      isSuperAdmin: isSuperAdminUserId(user.id),
    },
  };
}

/** Idem `resolveAdminActor` mais exige le rôle super administrateur. */
export async function resolveSuperAdminActor(): Promise<AdminActorResult> {
  const result = await resolveAdminActor();
  if (!result.ok) return result;
  if (!result.actor.isSuperAdmin) {
    return { ok: false, error: "Action réservée au super administrateur." };
  }
  return result;
}
