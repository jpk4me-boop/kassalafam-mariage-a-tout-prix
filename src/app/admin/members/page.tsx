import { notFound, redirect } from "next/navigation";
import { TriangleAlert } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUserId } from "@/lib/auth/admin";
import type { AccountStatus } from "@/lib/types/database";
import {
  MemberModerationList,
  type AdminMemberRow,
} from "@/components/admin/member-moderation-list";

// Rendu dynamique : dépend de la session (cookies) et de variables d'env
// serveur (service_role). Jamais pré-rendu statiquement.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Comptes membres — Administration",
};

/** Forme brute lue en base (service_role, READ-ONLY). */
type ProfileModerationRow = {
  id: string;
  first_name: string | null;
  account_status: AccountStatus;
  suspended_at: string | null;
  suspension_reason: string | null;
  created_at: string;
};

export default async function AdminMembersPage() {
  // 1. Authentification + contrôle admin — 100 % côté serveur (session anon).
  //    Modèle identique à /admin/verification et /admin/reports.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/admin/members");
  }
  if (!isAdminUserId(user.id)) {
    // 404 plutôt que 403 : ne révèle pas l'existence du back-office.
    notFound();
  }

  // 2. Lecture privilégiée (service_role, SERVEUR uniquement). READ-ONLY :
  //    toute écriture passe EXCLUSIVEMENT par la Server Action + RPC C3A.
  let rows: AdminMemberRow[] = [];
  let loadFailed = false;

  try {
    const admin = createAdminClient();

    const { data, error } = await admin
      .from("profiles")
      .select(
        "id, first_name, account_status, suspended_at, suspension_reason, created_at",
      )
      .order("created_at", { ascending: false });

    if (error) throw error;
    const profiles = (data ?? []) as ProfileModerationRow[];

    // Emails best-effort via l'API admin (auth.users). Échec NON bloquant :
    // repli sur « — » et recherche par prénom uniquement. On PAGINE jusqu'à
    // épuisement — ne jamais s'arrêter silencieusement à la première page :
    //   - PER_PAGE fixe par requête ;
    //   - condition d'arrêt : un lot plus court que PER_PAGE (ou vide) marque la
    //     dernière page ;
    //   - garde-fou MAX_PAGES : anti-boucle défensif (≤ 1 M comptes).
    const emailById = new Map<string, string>();
    try {
      const PER_PAGE = 1000;
      const MAX_PAGES = 1000;
      for (let page = 1; page <= MAX_PAGES; page += 1) {
        const { data: usersPage, error: usersError } =
          await admin.auth.admin.listUsers({ page, perPage: PER_PAGE });
        if (usersError) throw usersError;
        const batch = usersPage?.users ?? [];
        for (const u of batch) {
          if (u.email) emailById.set(u.id, u.email);
        }
        if (batch.length < PER_PAGE) break;
      }
    } catch {
      // Liste d'emails indisponible : repli silencieux sur « — ». Le prénom et
      // le statut restent affichés : la page ne tombe pas (dégradation propre).
    }

    // Aplatissement : on sérialise des objets PLATS vers le Client Component
    // (email joint ici, jamais de Map ni de champ interne côté navigateur).
    rows = profiles.map((p) => ({
      id: p.id,
      first_name: p.first_name,
      email: emailById.get(p.id) ?? null,
      account_status: p.account_status,
      suspended_at: p.suspended_at,
      suspension_reason: p.suspension_reason,
      created_at: p.created_at,
    }));
  } catch (err) {
    // Détail journalisé côté SERVEUR uniquement : jamais renvoyé au navigateur.
    // Aucune erreur SQL brute, aucun nom de variable d'env, aucun détail
    // Supabase, aucune stack trace ne doivent atteindre le rendu HTML.
    console.error(
      "[admin/members] lecture des comptes échouée:",
      err instanceof Error ? err.message : "erreur inconnue",
    );
    loadFailed = true;
  }

  const suspendedCount = rows.filter(
    (r) => r.account_status === "suspended",
  ).length;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-champagne-600">
          Modération
        </p>
        <h1 className="mt-2 font-serif text-3xl font-semibold text-choco-700 sm:text-4xl">
          Comptes membres
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-700/70">
          Gestion des comptes : suspension et réactivation via un chemin serveur
          sécurisé. Un motif est requis pour chaque décision, conservé dans
          l’historique de modération.{" "}
          {!loadFailed ? (
            <span className="font-medium text-choco-700">
              {suspendedCount}{" "}
              {suspendedCount > 1 ? "comptes suspendus" : "compte suspendu"}
            </span>
          ) : null}
          {!loadFailed ? "." : null}
        </p>
      </header>

      {loadFailed ? (
        <div className="flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/5 px-5 py-4 text-sm text-red-800">
          <TriangleAlert size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Chargement impossible</p>
            <p className="mt-1 text-red-800/80">
              Impossible de charger les comptes membres pour le moment.
              Réessayez dans quelques instants.
            </p>
          </div>
        </div>
      ) : (
        <MemberModerationList rows={rows} currentAdminId={user.id} />
      )}
    </div>
  );
}
