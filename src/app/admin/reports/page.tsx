import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { TriangleAlert } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUserId } from "@/lib/auth/admin";
import type {
  SafetyReportRow,
  SafetyReportActionRow,
} from "@/lib/types/database";
import {
  SAFETY_REPORT_FILTERS,
  type SafetyReportFilterKey,
  isSafetyReportStatus,
} from "@/lib/admin/safety-reports";
import { SafetyReportsList } from "@/components/admin/safety-reports-list";

// Rendu dynamique : dépend de la session (cookies), des searchParams et de
// variables d'env serveur. Jamais pré-rendu statiquement.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Signalements — Administration",
};

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  // 1. Authentification + contrôle admin — 100 % côté serveur (session anon).
  //    Modèle identique à /admin/verification.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/admin/reports");
  }
  if (!isAdminUserId(user.id)) {
    // 404 plutôt que 403 : ne révèle pas l'existence du back-office.
    notFound();
  }

  // Filtre issu de searchParams (NON fiable) : validé avant toute utilisation.
  const { status } = await searchParams;
  const activeFilter: SafetyReportFilterKey = isSafetyReportStatus(status)
    ? status
    : "all";

  // 2. Lecture privilégiée (service_role, SERVEUR uniquement). READ-ONLY.
  //    La table safety_reports a RLS activée sans policy et privilèges membres
  //    révoqués : seul ce client (bypass RLS) peut la lire.
  let rows: SafetyReportRow[] = [];
  const nameById = new Map<string, string | null>();
  let loadError: string | null = null;

  try {
    const admin = createAdminClient();

    const { data, error } = await admin
      .from("safety_reports")
      .select(
        "id, reporter_id, reported_user_id, match_id, message_id, reason, details, message_content_snapshot, message_created_at_snapshot, status, reviewed_by, reviewed_at, resolution_note, created_at",
      )
      .order("created_at", { ascending: false });

    if (error) throw error;
    rows = (data ?? []) as SafetyReportRow[];

    // Identité minimale (prénom uniquement) des profils concernés. On ne
    // récupère QUE les ids réellement présents (déclarant + signalé non NULL).
    const ids = Array.from(
      new Set(
        rows
          .flatMap((r) => [r.reporter_id, r.reported_user_id])
          .filter((id): id is string => Boolean(id)),
      ),
    );

    if (ids.length > 0) {
      const { data: profiles, error: profilesError } = await admin
        .from("profiles")
        .select("id, first_name")
        .in("id", ids);

      if (profilesError) throw profilesError;
      for (const p of profiles ?? []) {
        nameById.set(p.id, p.first_name);
      }
    }
  } catch (err) {
    loadError =
      err instanceof Error
        ? err.message
        : "Lecture des signalements indisponible.";
  }

  const counts = {
    all: rows.length,
    open: rows.filter((r) => r.status === "open").length,
    reviewing: rows.filter((r) => r.status === "reviewing").length,
    resolved: rows.filter((r) => r.status === "resolved").length,
    dismissed: rows.filter((r) => r.status === "dismissed").length,
  } satisfies Record<SafetyReportFilterKey, number>;

  const visibleRows =
    activeFilter === "all"
      ? rows
      : rows.filter((r) => r.status === activeFilter);

  // 3. Historique append-only (L3F-C2B) — lu côté SERVEUR (service_role) pour
  //    les seuls signalements affichés. La lecture est COMPLÉMENTAIRE : un échec
  //    n'empêche pas la consultation de la liste (dégradation propre). Jamais lu
  //    depuis le navigateur.
  const historyByReport = new Map<string, SafetyReportActionRow[]>();
  if (!loadError && visibleRows.length > 0) {
    try {
      const admin = createAdminClient();
      const ids = visibleRows.map((r) => r.id);

      const { data, error } = await admin
        .from("safety_report_actions")
        .select(
          "id, report_id, actor_id, actor_email_snapshot, previous_status, new_status, note, created_at",
        )
        .in("report_id", ids)
        .order("created_at", { ascending: true });

      if (error) throw error;

      for (const action of (data ?? []) as SafetyReportActionRow[]) {
        const list = historyByReport.get(action.report_id) ?? [];
        list.push(action);
        historyByReport.set(action.report_id, list);
      }
    } catch (err) {
      // Non bloquant : la liste read-only reste consultable sans l'historique.
      console.error(
        "[admin/reports] lecture historique échouée:",
        err instanceof Error ? err.message : "erreur inconnue",
      );
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-champagne-600">
          Modération
        </p>
        <h1 className="mt-2 font-serif text-3xl font-semibold text-choco-700 sm:text-4xl">
          Signalements
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-700/70">
          Consultation en lecture seule des signalements de messages. Le contenu
          affiché provient d’une copie serveur (snapshot) conservée au moment du
          signalement.{" "}
          <span className="font-medium text-choco-700">
            {counts.open} à traiter
          </span>
          .
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
      ) : (
        <>
          {/* Filtres par statut */}
          <nav className="flex flex-wrap gap-2">
            {SAFETY_REPORT_FILTERS.map((filter) => {
              const isActive = filter.key === activeFilter;
              const href =
                filter.key === "all"
                  ? "/admin/reports"
                  : `/admin/reports?status=${filter.key}`;
              return (
                <Link
                  key={filter.key}
                  href={href}
                  className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? "border-choco-600/30 bg-choco-600/10 text-choco-700"
                      : "border-champagne-500/30 bg-cream-100/50 text-ink-700/70 hover:text-choco-600"
                  }`}
                >
                  {filter.label}
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      isActive
                        ? "bg-choco-600/15 text-choco-700"
                        : "bg-champagne-400/20 text-ink-700/60"
                    }`}
                  >
                    {counts[filter.key]}
                  </span>
                </Link>
              );
            })}
          </nav>

          <SafetyReportsList
            rows={visibleRows}
            nameById={nameById}
            historyByReport={historyByReport}
          />
        </>
      )}
    </div>
  );
}
