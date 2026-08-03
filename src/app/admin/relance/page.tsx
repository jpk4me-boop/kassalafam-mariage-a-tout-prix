import Link from "next/link";
import {
  CalendarClock,
  ChevronRight,
  Mail,
  MessageCircle,
  TriangleAlert,
  UserRound,
} from "lucide-react";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin-guard";
import type { MemberActivitySummaryRow, ProfileRow } from "@/lib/types/database";
import {
  ONBOARDING_PROFILE_COLUMNS,
  type OnboardingProfileData,
} from "@/lib/onboarding/completion";
import { relanceContact, relanceProgress } from "@/lib/admin/relance";
import { CopyEmailButton } from "@/components/admin/copy-email-button";

// Rendu dynamique : dépend de la session (cookies) et d'env serveur.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Relance — Administration",
};

const DAY_FMT = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });
const DATE_FMT = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeStyle: "short",
});

function fmtDay(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : DAY_FMT.format(d);
}
function fmt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : DATE_FMT.format(d);
}

/** Colonnes lues : la sélection d'onboarding partagée + identité de relance. */
const RELANCE_COLUMNS = `id, created_at, last_name, whatsapp_phone, ${ONBOARDING_PROFILE_COLUMNS}`;

type RelanceProfileRow = OnboardingProfileData &
  Pick<ProfileRow, "id" | "created_at" | "last_name" | "whatsapp_phone">;

export default async function AdminRelancePage() {
  // Authentification + contrôle admin — 100 % côté serveur (garde centralisée).
  await requireAdmin("/admin/relance");

  let rows: RelanceProfileRow[] = [];
  const primaryPhotoIds = new Set<string>();
  const emailById = new Map<string, string | null>();
  const lastSignInById = new Map<string, string | null>();
  let loadError: string | null = null;

  try {
    const admin = createAdminClient();

    // 1. Onboardings inachevés : marqueur `onboarding_completed_at` absent,
    //    comptes actifs uniquement (on ne relance pas un compte suspendu).
    //    Le comptage réel (audit 03/08) est de quelques unités ; pas de
    //    pagination tant que ce volume reste marginal.
    const { data, error } = await admin
      .from("profiles")
      .select(RELANCE_COLUMNS)
      .is("onboarding_completed_at", null)
      .eq("account_status", "active")
      .order("created_at", { ascending: false });

    if (error) throw error;
    rows = (data ?? []) as unknown as RelanceProfileRow[];

    const ids = rows.map((r) => r.id);
    if (ids.length > 0) {
      // 2. Photo principale : UN SEUL SELECT pour tous les ids (jamais un
      //    appel par membre). Nécessaire à l'étape 8 de la complétude.
      const { data: photoRows } = await admin
        .from("photos")
        .select("profile_id")
        .in("profile_id", ids)
        .eq("is_primary", true);
      for (const p of photoRows ?? []) primaryPhotoIds.add(p.profile_id);

      // 3. Dernière connexion : RPC groupée (auth.users.last_sign_in_at).
      //    Échec NON bloquant : la liste reste utilisable sans cette colonne.
      try {
        const { data: activity } = await admin.rpc(
          "admin_get_member_activity",
          { p_profile_ids: ids },
        );
        for (const row of (activity ?? []) as MemberActivitySummaryRow[]) {
          lastSignInById.set(row.profile_id, row.last_sign_in_at);
        }
      } catch {
        // Colonne « Dernière connexion » simplement absente.
      }

      // 4. Email du compte (auth.users, relation 1:1) — canal de repli quand
      //    le WhatsApp n'a pas été collecté. Best-effort, affichage admin
      //    serveur uniquement, jamais transmis à un bundle client.
      await Promise.all(
        ids.map(async (id) => {
          try {
            const { data: userRes } = await admin.auth.admin.getUserById(id);
            emailById.set(id, userRes?.user?.email ?? null);
          } catch {
            emailById.set(id, null);
          }
        }),
      );
    }
  } catch (err) {
    loadError =
      err instanceof Error ? err.message : "Lecture des membres indisponible.";
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-champagne-600">
          Back-office
        </p>
        <h1 className="mt-2 font-serif text-3xl font-semibold text-choco-700 sm:text-4xl">
          Profils à relancer
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-700/70">
          Inscriptions dont le parcours n’a pas été envoyé : étape d’abandon,
          progression et canal de contact. Lecture privilégiée côté serveur ;
          aucune donnée sensible n’atteint le navigateur.
        </p>
      </header>

      {loadError ? (
        <div className="flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/5 px-5 py-4 text-sm text-red-800">
          <TriangleAlert size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Lecture admin indisponible</p>
            <p className="mt-1 text-red-800/80">
              Vérifiez que <code>SUPABASE_SERVICE_ROLE_KEY</code> est définie
              côté serveur. Détail : {loadError}
            </p>
          </div>
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border border-champagne-500/25 bg-cream-50/60 px-5 py-6 text-sm text-ink-700/70">
          Aucun onboarding inachevé : tous les membres inscrits ont envoyé leur
          profil.
        </p>
      ) : (
        <>
          <p className="text-sm text-ink-700/70">
            <span className="font-semibold text-choco-700">{rows.length}</span>{" "}
            parcours inachevé{rows.length > 1 ? "s" : ""}
          </p>

          <ul className="flex flex-col gap-4">
            {rows.map((profile) => {
              const progress = relanceProgress(
                profile,
                primaryPhotoIds.has(profile.id),
              );
              const contact = relanceContact(
                profile.whatsapp_phone,
                emailById.get(profile.id),
              );
              const displayName =
                [profile.first_name?.trim(), profile.last_name?.trim()]
                  .filter(Boolean)
                  .join(" ") || "Sans prénom";

              return (
                <li
                  key={profile.id}
                  className="rounded-2xl border border-champagne-500/25 bg-cream-50/60 p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="inline-flex items-center gap-2 font-serif text-lg font-semibold text-choco-700">
                        <UserRound
                          size={17}
                          className="text-champagne-600"
                          aria-hidden
                        />
                        {displayName}
                      </p>
                      <p className="mt-1 inline-flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-ink-700/60">
                        <span className="inline-flex items-center gap-1">
                          <CalendarClock size={13} aria-hidden />
                          Inscrit le {fmtDay(profile.created_at)}
                        </span>
                        <span>
                          Dernière connexion :{" "}
                          {fmt(lastSignInById.get(profile.id) ?? null)}
                        </span>
                      </p>
                    </div>
                    <Link
                      href={`/admin/members/${profile.id}`}
                      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-champagne-500/30 bg-cream-100/60 px-3 py-1.5 text-xs font-medium text-choco-700 transition-colors hover:bg-champagne-400/15"
                    >
                      Fiche membre
                      <ChevronRight size={14} aria-hidden />
                    </Link>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-champagne-400/15 px-2.5 py-1 text-xs font-medium text-ink-700/70">
                      {progress.completedSteps}/{progress.totalSteps} étapes
                    </span>
                    <span className="inline-flex items-center rounded-full border border-amber-600/25 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-800">
                      {progress.awaitingFinalSend
                        ? "Envoi final restant"
                        : `Abandon à l’étape ${progress.stalledStep} — ${progress.stalledLabel}`}
                    </span>
                  </div>

                  {progress.missingLabels.length > 0 ? (
                    <p className="mt-2 text-xs text-ink-700/60">
                      Reste à compléter : {progress.missingLabels.join(", ")}.
                    </p>
                  ) : null}

                  <div className="mt-3 border-t border-champagne-500/15 pt-3 text-sm">
                    {contact.channel === "whatsapp" ? (
                      <a
                        href={contact.href}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 font-medium text-emerald-700 hover:text-emerald-800"
                      >
                        <MessageCircle size={15} aria-hidden />
                        WhatsApp : {contact.value}
                      </a>
                    ) : contact.channel === "email" ? (
                      <span className="inline-flex flex-wrap items-center gap-2">
                        <a
                          href={contact.href}
                          className="inline-flex items-center gap-1.5 font-medium text-choco-700 hover:text-choco-800"
                        >
                          <Mail size={15} aria-hidden />
                          {contact.value}
                        </a>
                        <CopyEmailButton email={contact.value} />
                      </span>
                    ) : (
                      <span className="text-ink-700/50">
                        Aucun canal de contact disponible.
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
