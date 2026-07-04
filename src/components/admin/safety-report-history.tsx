import { ArrowRight, History } from "lucide-react";

import type { SafetyReportActionRow } from "@/lib/types/database";
import { SAFETY_STATUS_TIMELINE_LABELS } from "@/lib/admin/safety-reports";

/**
 * Historique APPEND-ONLY d'un signalement — PRÉSENTATION SEULE, 100 % serveur
 * (L3F-C2B). Rendu à partir des lignes `safety_report_actions` déjà lues côté
 * serveur (client service_role) : ce composant ne lit rien lui-même et ne tente
 * JAMAIS de modifier une ligne (la table est immuable en base). Les entrées sont
 * affichées dans un ordre chronologique cohérent (de la plus ancienne à la plus
 * récente).
 */

const DATE_FMT = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeStyle: "short",
});

function statusLabel(status: string): string {
  return (
    SAFETY_STATUS_TIMELINE_LABELS[
      status as keyof typeof SAFETY_STATUS_TIMELINE_LABELS
    ] ?? status
  );
}

export function SafetyReportHistory({
  actions,
}: {
  actions: SafetyReportActionRow[];
}) {
  if (actions.length === 0) return null;

  // Ordre chronologique ascendant (défensif : indépendant de l'ordre reçu).
  const ordered = [...actions].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  return (
    <div className="mt-3 border-t border-champagne-500/20 pt-3">
      <p className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-ink-700/50">
        <History size={13} />
        Historique des décisions
      </p>

      <ol className="flex flex-col gap-2">
        {ordered.map((action) => {
          const actor = action.actor_email_snapshot?.trim();
          return (
            <li
              key={action.id}
              className="rounded-xl border border-champagne-500/20 bg-cream-100/40 px-3 py-2 text-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                <span className="inline-flex items-center gap-1.5 font-medium text-choco-700">
                  {statusLabel(action.previous_status)}
                  <ArrowRight size={13} className="text-ink-700/40" />
                  {statusLabel(action.new_status)}
                </span>
                <span className="text-xs text-ink-700/55">
                  {DATE_FMT.format(new Date(action.created_at))}
                </span>
              </div>

              <p className="mt-1 text-xs text-ink-700/60">
                {actor ? (
                  <>
                    Par <span className="text-ink-700/80">{actor}</span>
                  </>
                ) : (
                  <span className="italic text-ink-700/45">
                    Compte administrateur supprimé
                  </span>
                )}
              </p>

              {action.note && action.note.trim() ? (
                <p className="mt-2 whitespace-pre-wrap break-words text-sm text-ink-700/85">
                  {action.note}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
