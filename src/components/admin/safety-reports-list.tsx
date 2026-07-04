import {
  Archive,
  BadgeCheck,
  Clock,
  MessageSquareWarning,
  TriangleAlert,
} from "lucide-react";

import type {
  SafetyReportActionRow,
  SafetyReportRow,
  SafetyReportStatus,
} from "@/lib/types/database";
import { reasonLabel, SAFETY_STATUS_LABELS } from "@/lib/admin/safety-reports";
import { SafetyReportHistory } from "@/components/admin/safety-report-history";
import { SafetyReportActions } from "@/components/admin/safety-report-actions";

/**
 * Liste back-office des signalements (L3F-C1 lecture seule + L3F-C2B traitement).
 *
 * Rendu serveur. Le contenu du message provient EXCLUSIVEMENT du snapshot
 * (`message_content_snapshot`), jamais d'une lecture live de `messages`. Ne
 * reçoit que l'identité minimale (prénom) des profils concernés.
 *
 * L3F-C2B ajoute, par carte :
 *  - l'HISTORIQUE append-only (composant serveur), rendu à partir des actions
 *    déjà lues côté serveur ;
 *  - les ACTIONS de traitement (composant client) UNIQUEMENT pour les statuts
 *    non terminaux (`open` / `reviewing`). Le composant client ne reçoit que
 *    `reportId` + `currentStatus` — aucune donnée sensible.
 * La note de décision n'est pas dupliquée : elle est portée par l'historique.
 */

const DATE_FMT = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return DATE_FMT.format(new Date(iso));
}

const STATUS_BADGE: Record<
  SafetyReportStatus,
  { Icon: typeof BadgeCheck; className: string }
> = {
  open: {
    Icon: TriangleAlert,
    className: "border-amber-500/40 bg-amber-400/15 text-amber-800",
  },
  reviewing: {
    Icon: Clock,
    className: "border-champagne-500/40 bg-champagne-400/15 text-choco-700",
  },
  resolved: {
    Icon: BadgeCheck,
    className: "border-emerald-600/30 bg-emerald-600/10 text-emerald-700",
  },
  dismissed: {
    Icon: Archive,
    className: "border-ink-700/20 bg-ink-700/5 text-ink-700/70",
  },
};

function SafetyStatusBadge({ status }: { status: SafetyReportStatus }) {
  const { Icon, className } = STATUS_BADGE[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium ${className}`}
    >
      <Icon size={13} />
      {SAFETY_STATUS_LABELS[status]}
    </span>
  );
}

/**
 * Identité minimale d'un profil concerné. `id` peut être NULL si le profil a
 * été supprimé (FK ON DELETE SET NULL) : on l'indique explicitement plutôt que
 * d'afficher un vide ambigu.
 */
function Identity({
  id,
  nameById,
}: {
  id: string | null;
  nameById: Map<string, string | null>;
}) {
  if (!id) {
    return <span className="text-ink-700/40">Compte supprimé</span>;
  }
  const name = nameById.get(id)?.trim();
  if (name) return <span className="text-choco-700">{name}</span>;
  return <span className="text-ink-700/40">Sans prénom</span>;
}

export function SafetyReportsList({
  rows,
  nameById,
  historyByReport,
}: {
  rows: SafetyReportRow[];
  nameById: Map<string, string | null>;
  historyByReport: Map<string, SafetyReportActionRow[]>;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-champagne-500/25 bg-cream-100/40 px-6 py-12 text-center text-sm text-ink-700/60">
        Aucun signalement pour ce filtre.
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-4">
      {rows.map((row) => (
        <li
          key={row.id}
          className="rounded-2xl border border-champagne-500/25 bg-cream-50/60 p-4 sm:p-5"
        >
          {/* En-tête : statut + motif + date du signalement */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <SafetyStatusBadge status={row.status} />
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-red-500/25 bg-red-500/5 px-2.5 py-1 text-xs font-medium text-red-800">
                <MessageSquareWarning size={13} />
                {reasonLabel(row.reason)}
              </span>
            </div>
            <span className="text-xs text-ink-700/60">
              Signalé le {formatDate(row.created_at)}
            </span>
          </div>

          {/* Déclarant → profil signalé (identité minimale) */}
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className="text-ink-700/50">Déclarant :</span>
            <span className="font-medium">
              <Identity id={row.reporter_id} nameById={nameById} />
            </span>
            <span className="text-ink-700/30">·</span>
            <span className="text-ink-700/50">Profil signalé :</span>
            <span className="font-medium">
              <Identity id={row.reported_user_id} nameById={nameById} />
            </span>
          </div>

          {/* Message signalé — TOUJOURS le snapshot, jamais une lecture live */}
          <div className="mt-3 rounded-xl border border-champagne-500/20 bg-cream-100/50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-700/50">
                Message signalé
              </p>
              <p className="text-xs text-ink-700/55">
                Envoyé le {formatDate(row.message_created_at_snapshot)}
              </p>
            </div>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm text-ink-700/90">
              {row.message_content_snapshot}
            </p>
            {row.message_id === null ? (
              <p className="mt-2 text-xs italic text-ink-700/45">
                Message d’origine supprimé — contenu conservé depuis le snapshot.
              </p>
            ) : null}
          </div>

          {/* Détails complémentaires facultatifs */}
          {row.details && row.details.trim() ? (
            <div className="mt-3">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-700/50">
                Détails du déclarant
              </p>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm text-ink-700/80">
                {row.details}
              </p>
            </div>
          ) : null}

          {/* Indication robuste des références liées devenues NULL */}
          {row.match_id === null ? (
            <p className="mt-3 text-xs italic text-ink-700/45">
              Relation associée supprimée.
            </p>
          ) : null}

          {/* Historique append-only des décisions (présentation serveur) */}
          <SafetyReportHistory actions={historyByReport.get(row.id) ?? []} />

          {/* Traitement : actions pour open/reviewing ; sinon décision finale */}
          {row.status === "open" || row.status === "reviewing" ? (
            <SafetyReportActions reportId={row.id} currentStatus={row.status} />
          ) : (
            <p className="mt-3 border-t border-champagne-500/20 pt-3 text-xs text-ink-700/55">
              Décision finale enregistrée :{" "}
              <span className="font-medium text-choco-700">
                {SAFETY_STATUS_LABELS[row.status]}
              </span>
              . Ce signalement ne peut plus être modifié.
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
