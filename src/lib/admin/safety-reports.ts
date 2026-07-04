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
