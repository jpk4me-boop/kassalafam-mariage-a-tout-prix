/**
 * Constantes & helpers PURS pour la MODÉRATION DES COMPTES (L3F-C3B).
 *
 * Fichier importable client ET serveur : aucun accès DB, aucun secret. Les
 * valeurs techniques (statuts, bornes de motif) reflètent EXACTEMENT les règles
 * de la RPC transactionnelle `admin_set_account_status` et des contraintes CHECK
 * de `public.profiles` (backend L3F-C3A). Seuls les libellés sont FR. La base
 * reste l'autorité finale : ces gardes ne font que rejeter tôt et guider l'UI.
 */

import type { AccountStatus } from "@/lib/types/database";

/** Clé de filtre de l'écran : « all » + les 2 statuts réels de compte. */
export type AccountFilterKey = "all" | AccountStatus;

/** Filtres proposés dans la barre du back-office (ordre d'affichage). */
export const ACCOUNT_MODERATION_FILTERS: {
  key: AccountFilterKey;
  label: string;
}[] = [
  { key: "all", label: "Tous" },
  { key: "active", label: "Actifs" },
  { key: "suspended", label: "Suspendus" },
];

/** Libellés FR des statuts de compte (présentation seule, ton non agressif). */
export const ACCOUNT_STATUS_LABELS: Record<AccountStatus, string> = {
  active: "Actif",
  suspended: "Suspendu",
};

/**
 * Garde de type : valide une valeur de statut NON fiable (searchParams,
 * formulaire) avant de l'utiliser. N'accepte que les 2 statuts réels.
 */
export function isAccountStatus(
  value: string | null | undefined,
): value is AccountStatus {
  return value === "active" || value === "suspended";
}

/**
 * Bornes du motif — cohérentes avec le CHECK DB et la RPC (btrim, 10..2000).
 * Le motif est OBLIGATOIRE pour LES DEUX transitions (suspension ET
 * réactivation) : la RPC `admin_set_account_status` refuse un motif vide ou hors
 * bornes quel que soit le sens. La raison de réactivation est conservée dans le
 * journal append-only (les colonnes du profil sont remises à NULL).
 */
export const SUSPENSION_REASON_MIN = 10;
export const SUSPENSION_REASON_MAX = 2000;

/** Validation d'UUID (défensive) avant l'appel RPC. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * État de retour de la Server Action de modération (importable client +
 * serveur ; un fichier "use server" ne peut exporter que des fonctions async).
 */
export type AccountModerationActionState =
  | { ok: true; message: string }
  | { ok: false; error: string; code?: string };

/** Message FR générique (aucune erreur PostgreSQL brute exposée au navigateur). */
export const ACCOUNT_MODERATION_ERROR_FALLBACK =
  "Une erreur est survenue pendant la mise à jour du compte.";

/**
 * Mapping des erreurs MÉTIER STABLES de `admin_set_account_status` vers des
 * messages FR exploitables. Toute autre erreur retombe sur le fallback — la
 * chaîne PostgreSQL brute n'est jamais renvoyée au navigateur.
 */
export const ACCOUNT_MODERATION_ERROR_MESSAGES: Record<string, string> = {
  PROFILE_NOT_FOUND: "Ce membre n’existe plus.",
  ACCOUNT_STATUS_CONFLICT:
    "Ce compte a été modifié par un autre administrateur. La page va être actualisée.",
  INVALID_ACCOUNT_STATUS: "Statut de compte invalide.",
  INVALID_ACCOUNT_TRANSITION:
    "Cette action n’est pas possible sur ce compte dans son état actuel.",
  REASON_REQUIRED: "Un motif est obligatoire.",
  REASON_LENGTH_INVALID: "Le motif doit contenir entre 10 et 2 000 caractères.",
  ACTOR_NOT_FOUND: "Le compte administrateur n’a pas pu être identifié.",
  REPORT_NOT_FOUND: "Le signalement associé n’existe plus.",
  REPORT_PROFILE_MISMATCH:
    "Le signalement associé ne correspond pas à ce membre.",
};

/**
 * Traduit un code d'erreur (message d'exception plpgsql) en message FR + code
 * stable éventuel. Le `code` n'est renvoyé QUE pour les erreurs métier connues
 * (jamais un SQLSTATE ni un détail interne).
 */
export function mapAccountModerationError(raw: string | null | undefined): {
  message: string;
  code?: string;
} {
  if (raw && raw in ACCOUNT_MODERATION_ERROR_MESSAGES) {
    return { message: ACCOUNT_MODERATION_ERROR_MESSAGES[raw], code: raw };
  }
  return { message: ACCOUNT_MODERATION_ERROR_FALLBACK };
}
