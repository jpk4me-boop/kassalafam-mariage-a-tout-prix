/**
 * Constantes & helpers partagés pour la lecture back-office des signalements
 * (L3F-C1). Fichier PUR (importable client ET serveur) : aucun accès DB, aucun
 * secret. Les valeurs techniques (`status`, `reason`) reflètent exactement les
 * contraintes CHECK de `public.safety_reports` ; seuls les libellés sont FR.
 */

import type {
  SafetyReportReason,
  SafetyReportStatus,
} from "@/lib/types/database";

/** Clé de filtre de l'écran : « all » + les 4 statuts réels. */
export type SafetyReportFilterKey = "all" | SafetyReportStatus;

/** Filtres proposés dans la barre du back-office (ordre d'affichage). */
export const SAFETY_REPORT_FILTERS: {
  key: SafetyReportFilterKey;
  label: string;
}[] = [
  { key: "all", label: "Tous" },
  { key: "open", label: "À traiter" },
  { key: "reviewing", label: "En examen" },
  { key: "resolved", label: "Résolus" },
  { key: "dismissed", label: "Classés" },
];

/**
 * Garde de type : valide une valeur de statut ISSUE DE `searchParams` (donc non
 * fiable) AVANT de l'utiliser côté serveur. N'accepte que les 4 statuts réels
 * (« all » n'est pas un statut : il est traité à part comme absence de filtre).
 */
export function isSafetyReportStatus(
  value: string | undefined,
): value is SafetyReportStatus {
  return (
    value === "open" ||
    value === "reviewing" ||
    value === "resolved" ||
    value === "dismissed"
  );
}

/** Libellés FR des statuts (présentation seule). */
export const SAFETY_STATUS_LABELS: Record<SafetyReportStatus, string> = {
  open: "À traiter",
  reviewing: "En examen",
  resolved: "Résolu",
  dismissed: "Classé",
};

/** Libellés FR des motifs de signalement (présentation seule). */
export const SAFETY_REASON_LABELS: Record<SafetyReportReason, string> = {
  harassment: "Harcèlement",
  sexual_content: "Contenu sexuel",
  scam: "Arnaque",
  hate: "Discours haineux",
  threat: "Menace",
  impersonation: "Usurpation d'identité",
  spam: "Spam",
  other: "Autre",
};

/** Libellé FR d'un motif, robuste à une valeur inattendue (repli « Autre »). */
export function reasonLabel(reason: string): string {
  return SAFETY_REASON_LABELS[reason as SafetyReportReason] ?? "Autre";
}

/* -------------------------------------------------------------------------- */
/* L3F-C2B — Traitement des signalements (helpers PURS, client + serveur).    */
/*                                                                            */
/* Aucune écriture, aucun secret, aucun accès DB : ces constantes reflètent   */
/* EXACTEMENT les règles de la fonction transactionnelle                      */
/* `admin_transition_safety_report` (backend L3F-C2A) et servent à la fois    */
/* de garde UI et de garde serveur. La base reste l'autorité finale.          */
/* -------------------------------------------------------------------------- */

/** Statuts depuis lesquels une transition admin est possible (non terminaux). */
export type SafetyActionableStatus = "open" | "reviewing";

/** Statuts cibles autorisés (jamais `open` : pas de réouverture au MVP). */
export type SafetyTargetStatus = "reviewing" | "resolved" | "dismissed";

/** Bornes de la note — cohérentes avec le CHECK DB (btrim, 10..2000). */
export const SAFETY_NOTE_MIN = 10;
export const SAFETY_NOTE_MAX = 2000;

/** Description d'une transition proposée dans l'UI. */
export type SafetyTransition = {
  newStatus: SafetyTargetStatus;
  /** Libellé FR du bouton d'action. */
  label: string;
  /** Note obligatoire (décision finale) ou facultative (prise en charge). */
  requiresNote: boolean;
  /** Accent visuel (review / resolve / dismiss). */
  tone: "review" | "resolve" | "dismiss";
};

/**
 * Matrice des transitions AUTORISÉES, identique à la garde serveur de
 * `admin_transition_safety_report` :
 *   open      → reviewing | resolved | dismissed
 *   reviewing → resolved  | dismissed
 * `resolved` et `dismissed` sont terminaux (aucune entrée). L'UI ne doit
 * proposer QUE ces transitions.
 */
export const SAFETY_TRANSITIONS: Record<
  SafetyActionableStatus,
  SafetyTransition[]
> = {
  open: [
    {
      newStatus: "reviewing",
      label: "Prendre en charge",
      requiresNote: false,
      tone: "review",
    },
    { newStatus: "resolved", label: "Résoudre", requiresNote: true, tone: "resolve" },
    {
      newStatus: "dismissed",
      label: "Classer sans suite",
      requiresNote: true,
      tone: "dismiss",
    },
  ],
  reviewing: [
    { newStatus: "resolved", label: "Résoudre", requiresNote: true, tone: "resolve" },
    {
      newStatus: "dismissed",
      label: "Classer sans suite",
      requiresNote: true,
      tone: "dismiss",
    },
  ],
};

/**
 * Libellés FR des statuts pour l'HISTORIQUE (timeline). Distinct de
 * SAFETY_STATUS_LABELS (badges) : `dismissed` s'y lit « Classé sans suite ».
 */
export const SAFETY_STATUS_TIMELINE_LABELS: Record<SafetyReportStatus, string> = {
  open: "À traiter",
  reviewing: "En examen",
  resolved: "Résolu",
  dismissed: "Classé sans suite",
};

/** Statut depuis lequel une action est possible (garde serveur pour p_expected_status). */
export function isSafetyActionableStatus(
  value: string | null | undefined,
): value is SafetyActionableStatus {
  return value === "open" || value === "reviewing";
}

/** Statut cible valide (garde serveur pour p_new_status). */
export function isSafetyTargetStatus(
  value: string | null | undefined,
): value is SafetyTargetStatus {
  return value === "reviewing" || value === "resolved" || value === "dismissed";
}

/** Vrai si la transition `from → to` figure dans la matrice autorisée. */
export function isAllowedSafetyTransition(from: string, to: string): boolean {
  if (!isSafetyActionableStatus(from)) return false;
  return SAFETY_TRANSITIONS[from].some((t) => t.newStatus === to);
}

/** Note obligatoire pour une décision finale (resolved / dismissed). */
export function safetyNoteRequired(to: SafetyTargetStatus): boolean {
  return to === "resolved" || to === "dismissed";
}

/** Validation d'UUID (défensive) avant l'appel RPC. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * État de retour de la Server Action de transition (importable client +
 * serveur ; un fichier "use server" ne peut exporter que des fonctions async).
 */
export type SafetyReportActionState =
  | { ok: true; message: string }
  | { ok: false; error: string; code?: string };

/** Message FR générique (aucune erreur PostgreSQL brute exposée). */
export const SAFETY_ERROR_FALLBACK =
  "Une erreur est survenue pendant le traitement du signalement.";

/**
 * Mapping des erreurs MÉTIER STABLES de `admin_transition_safety_report` vers
 * des messages FR. Toute autre erreur retombe sur SAFETY_ERROR_FALLBACK — la
 * chaîne PostgreSQL brute n'est jamais renvoyée au navigateur.
 */
export const SAFETY_ERROR_MESSAGES: Record<string, string> = {
  REPORT_NOT_FOUND: "Ce signalement n’existe plus.",
  REPORT_STATUS_CONFLICT:
    "Ce signalement a été modifié par un autre administrateur. La page va être actualisée.",
  REPORT_ALREADY_FINAL: "Ce signalement a déjà reçu une décision finale.",
  INVALID_REPORT_TRANSITION: "Cette transition de statut n’est pas autorisée.",
  NOTE_REQUIRED: "Une note de décision est obligatoire.",
  NOTE_LENGTH_INVALID: "La note doit contenir entre 10 et 2 000 caractères.",
  ACTOR_NOT_FOUND: "Le compte administrateur n’a pas pu être identifié.",
};

/**
 * Traduit un code d'erreur (message d'exception plpgsql) en message FR + code
 * stable éventuel. Le `code` n'est renvoyé QUE pour les erreurs métier connues
 * (jamais un SQLSTATE ni un détail interne).
 */
export function mapSafetyError(raw: string | null | undefined): {
  message: string;
  code?: string;
} {
  if (raw && raw in SAFETY_ERROR_MESSAGES) {
    return { message: SAFETY_ERROR_MESSAGES[raw], code: raw };
  }
  return { message: SAFETY_ERROR_FALLBACK };
}
