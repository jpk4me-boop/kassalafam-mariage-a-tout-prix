/**
 * L3G — Journal d'administration UNIFIÉ (lecture). Module PUR (client +
 * serveur) : il NORMALISE trois journaux immuables déjà existants en un flux
 * d'événements homogène et filtrable, SANS les dupliquer en base :
 *   - admin_audit_log            → décisions de vérification (verification_set) ;
 *   - account_moderation_actions → suspensions / réactivations de compte ;
 *   - safety_report_actions      → transitions de traitement des signalements.
 *
 * Chaque journal reste l'autorité de son domaine. Ce module ne fait AUCUN accès
 * DB : les lignes brutes sont lues côté serveur (service_role) puis passées ici.
 */

import type {
  AdminAuditLogRow,
  AccountModerationActionRow,
  SafetyReportActionRow,
  AdminAuditEventRow,
} from "@/lib/types/database";

/** Taille de page du journal (pagination réelle EN BASE, jamais de plafond). */
export const AUDIT_PAGE_SIZE = 25;

/** Origine d'un événement (sert aussi de clé de filtre « type d'action »). */
export type AuditSource = "verification" | "account" | "report";

/** Événement d'administration normalisé, indépendant de sa table d'origine. */
export type UnifiedAuditEvent = {
  /** Clé stable et unique inter-sources (préfixée par la source). */
  key: string;
  source: AuditSource;
  /** Libellé FR de l'action + résultat (ex. « Compte suspendu »). */
  actionLabel: string;
  /** Email de l'acteur admin (snapshot), ou `null` si indisponible. */
  actorEmail: string | null;
  /** UUID du membre ciblé (pour lien vers sa fiche), ou `null`. */
  targetProfileId: string | null;
  previousStatus: string | null;
  newStatus: string | null;
  /** Motif / note associé (peut être `null`). */
  note: string | null;
  /** Résultat : tous les événements journalisés sont des succès appliqués. */
  resultLabel: string;
  createdAt: string;
};

const RESULT_APPLIED = "Appliqué";

/** Libellé FR d'une décision de vérification selon le statut cible. */
function verificationLabel(newStatus: string | null): string {
  switch (newStatus) {
    case "approved":
      return "Vérification approuvée";
    case "rejected":
      return "Vérification refusée";
    case "paused":
      return "Vérification mise en pause";
    default:
      return "Décision de vérification";
  }
}

/** Libellé FR d'une transition de compte selon le statut cible. */
function accountLabel(newStatus: string | null): string {
  switch (newStatus) {
    case "suspended":
      return "Compte suspendu";
    case "active":
      return "Compte réactivé";
    default:
      return "Modération de compte";
  }
}

/** Libellé FR d'une transition de signalement selon le statut cible. */
function reportLabel(newStatus: string | null): string {
  switch (newStatus) {
    case "reviewing":
      return "Signalement pris en charge";
    case "resolved":
      return "Signalement résolu";
    case "dismissed":
      return "Signalement classé sans suite";
    default:
      return "Traitement de signalement";
  }
}

export function verificationEventsFrom(
  rows: AdminAuditLogRow[],
): UnifiedAuditEvent[] {
  return rows.map((r) => ({
    key: `verification:${r.id}`,
    source: "verification",
    actionLabel: verificationLabel(r.new_status),
    actorEmail: r.actor_email_snapshot,
    targetProfileId: r.target_profile_id_snapshot,
    previousStatus: r.previous_status,
    newStatus: r.new_status,
    note: r.reason,
    resultLabel: RESULT_APPLIED,
    createdAt: r.created_at,
  }));
}

export function accountEventsFrom(
  rows: AccountModerationActionRow[],
): UnifiedAuditEvent[] {
  return rows.map((r) => ({
    key: `account:${r.id}`,
    source: "account",
    actionLabel: accountLabel(r.new_status),
    actorEmail: r.actor_email_snapshot,
    targetProfileId: r.profile_id_snapshot,
    previousStatus: r.previous_status,
    newStatus: r.new_status,
    note: r.reason,
    resultLabel: RESULT_APPLIED,
    createdAt: r.created_at,
  }));
}

/**
 * Mappe une ligne renvoyée par la RPC paginée `admin_list_audit_events` (déjà
 * unifiée EN BASE) vers un `UnifiedAuditEvent`, en réutilisant exactement les
 * mêmes libellés que les normaliseurs par table.
 */
export function eventFromAuditRow(row: AdminAuditEventRow): UnifiedAuditEvent {
  const actionLabel =
    row.source === "verification"
      ? verificationLabel(row.new_status)
      : row.source === "account"
        ? accountLabel(row.new_status)
        : reportLabel(row.new_status);
  return {
    key: `${row.source}:${row.event_id}`,
    source: row.source,
    actionLabel,
    actorEmail: row.actor_email,
    targetProfileId: row.target_profile_id,
    previousStatus: row.previous_status,
    newStatus: row.new_status,
    note: row.note,
    resultLabel: RESULT_APPLIED,
    createdAt: row.created_at,
  };
}

export function reportEventsFrom(
  rows: SafetyReportActionRow[],
): UnifiedAuditEvent[] {
  return rows.map((r) => ({
    key: `report:${r.id}`,
    source: "report",
    actionLabel: reportLabel(r.new_status),
    actorEmail: r.actor_email_snapshot,
    // Un signalement ne référence pas directement un profil cible dans son
    // journal : pas de lien fiche membre depuis cette source.
    targetProfileId: null,
    previousStatus: r.previous_status,
    newStatus: r.new_status,
    note: r.note,
    resultLabel: RESULT_APPLIED,
    createdAt: r.created_at,
  }));
}

/**
 * Fusionne les trois sources en un flux unique trié du plus récent au plus
 * ancien (comparaison sur `createdAt`, déterministe et stable par `key`).
 */
export function mergeAuditEvents(
  ...groups: UnifiedAuditEvent[][]
): UnifiedAuditEvent[] {
  return groups
    .flat()
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() ||
        a.key.localeCompare(b.key),
    );
}

/* -------------------------------------------------------------------------- */
/* Filtres du journal unifié (validés depuis des searchParams non fiables).   */
/* -------------------------------------------------------------------------- */

export type AuditPeriod = "7d" | "30d" | "90d" | "all";
export type AuditSourceFilter = "all" | AuditSource;

export const AUDIT_SOURCE_FILTERS: {
  key: AuditSourceFilter;
  label: string;
}[] = [
  { key: "all", label: "Toutes les actions" },
  { key: "verification", label: "Vérification" },
  { key: "account", label: "Suspension / réactivation" },
  { key: "report", label: "Signalements" },
];

export const AUDIT_PERIODS: { key: AuditPeriod; label: string }[] = [
  { key: "7d", label: "7 jours" },
  { key: "30d", label: "30 jours" },
  { key: "90d", label: "90 jours" },
  { key: "all", label: "Tout" },
];

export function isAuditSourceFilter(
  value: string | undefined,
): value is AuditSourceFilter {
  return (
    value === "all" ||
    value === "verification" ||
    value === "account" ||
    value === "report"
  );
}

export function isAuditPeriod(value: string | undefined): value is AuditPeriod {
  return (
    value === "7d" || value === "30d" || value === "90d" || value === "all"
  );
}

const PERIOD_DAYS: Record<Exclude<AuditPeriod, "all">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

/** Borne basse (incluse) de la période, ou `null` pour « tout ». */
export function auditPeriodSince(period: AuditPeriod, now: Date): Date | null {
  if (period === "all") return null;
  const since = new Date(now);
  since.setUTCDate(since.getUTCDate() - PERIOD_DAYS[period]);
  return since;
}

export type AuditFilters = {
  source: AuditSourceFilter;
  period: AuditPeriod;
  /** Email d'administrateur (filtre exact), ou `null`. */
  actor: string | null;
  /** UUID de membre ciblé (filtre exact, ex. depuis une fiche), ou `null`. */
  target: string | null;
  /** Page courante (1-based) pour la pagination réelle du journal. */
  page: number;
};

/**
 * Construit une URL `/admin/audit?...` à partir des filtres courants et d'un
 * `patch`. Tout changement de filtre (source/période/acteur/cible) RÉINITIALISE
 * la page à 1, sauf si `patch.page` est fourni (navigation de pagination).
 */
export function buildAuditQuery(
  current: AuditFilters,
  patch: Partial<AuditFilters> = {},
): string {
  const next = { ...current, ...patch };
  const params = new URLSearchParams();
  if (next.source !== "all") params.set("source", next.source);
  if (next.period !== "30d") params.set("period", next.period);
  if (next.actor) params.set("actor", next.actor);
  if (next.target) params.set("target", next.target);

  const changedFilter = Object.keys(patch).some((k) => k !== "page");
  const page = patch.page ?? (changedFilter ? 1 : next.page);
  if (page > 1) params.set("page", String(page));

  const qs = params.toString();
  return qs ? `/admin/audit?${qs}` : "/admin/audit";
}
