import "server-only";

import { notFound, redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { isAdminUserId, isSuperAdminUserId } from "@/lib/auth/admin";

/**
 * Gardes d'accès back-office — SERVEUR UNIQUEMENT.
 *
 * Une allowlist admin n'annule jamais une suspension de compte : chaque garde
 * relit `profiles.account_status` côté serveur avant d'autoriser une page ou une
 * Server Action. Un profil absent reste compatible avec les comptes techniques
 * historiques présents dans l'allowlist.
 */

export type AdminContext = {
  /** UUID `auth.users` de l'appelant validé. Jamais transmis au navigateur. */
  userId: string;
  /** Email de l'appelant (best-effort, depuis la session). */
  email: string | null;
  /** `true` si l'appelant appartient à SUPER_ADMIN_USER_IDS. */
  isSuperAdmin: boolean;
};

type SessionActor = {
  user: User | null;
  isSuspended: boolean;
  statusReadFailed: boolean;
};

async function getSessionActor(): Promise<SessionActor> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { user: null, isSuspended: false, statusReadFailed: false };
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("account_status")
    .eq("id", user.id)
    .maybeSingle();

  return {
    user,
    isSuspended: profile?.account_status === "suspended",
    statusReadFailed: error != null,
  };
}

/**
 * Garde de PAGE : exige un administrateur actif (super admin inclus).
 *
 * @param redirectPath chemin de retour encodé dans /login?redirect=…
 */
export async function requireAdmin(redirectPath: string): Promise<AdminContext> {
  const session = await getSessionActor();
  const { user } = session;

  if (!user) {
    redirect(`/login?redirect=${encodeURIComponent(redirectPath)}`);
  }
  if (session.isSuspended) {
    redirect("/account-suspended");
  }
  // Fail-closed pour le back-office : une panne de lecture du statut ne doit
  // jamais ouvrir un accès privilégié par défaut.
  if (session.statusReadFailed || !isAdminUserId(user.id)) {
    notFound();
  }

  return {
    userId: user.id,
    email: user.email ?? null,
    isSuperAdmin: isSuperAdminUserId(user.id),
  };
}

/** Garde de PAGE réservée au super administrateur actif. */
export async function requireSuperAdmin(
  redirectPath: string,
): Promise<AdminContext> {
  const ctx = await requireAdmin(redirectPath);
  if (!ctx.isSuperAdmin) {
    notFound();
  }
  return ctx;
}

/** Variante non bloquante pour les Server Actions. */
export type AdminActorResult =
  | { ok: true; actor: AdminContext }
  | { ok: false; error: string };

export async function resolveAdminActor(): Promise<AdminActorResult> {
  const session = await getSessionActor();
  const { user } = session;

  if (!user) return { ok: false, error: "Session expirée. Reconnectez-vous." };
  if (session.isSuspended) {
    return { ok: false, error: "Ce compte est suspendu." };
  }
  if (session.statusReadFailed || !isAdminUserId(user.id)) {
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
