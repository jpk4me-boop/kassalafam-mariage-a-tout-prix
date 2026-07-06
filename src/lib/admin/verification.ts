/**
 * Constantes & types partagés pour la modération admin (importables côté
 * client ET serveur). Séparés de actions.ts car un fichier "use server" ne
 * peut exporter que des fonctions async.
 */

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; code?: string };

/** Bornes du motif de rejet — cohérentes avec la contrainte DB
 *  profiles_rejection_reason_len (<= 500). */
export const REJECTION_REASON_MIN = 5;
export const REJECTION_REASON_MAX = 500;

/** Motifs de rejet prédéfinis (site de mariage sérieux). L'admin en coche un
 *  ou plusieurs ; le motif final est composé par jointure « ; ». */
export const REJECTION_REASONS = [
  "Photo principale absente ou non conforme",
  "Visage peu visible ou photo trop floue",
  "Informations personnelles incomplètes",
  "Objectif de mariage insuffisamment clair",
  "Présentation trop courte ou peu sérieuse",
  "Informations incohérentes dans le profil",
  "Identité difficile à vérifier",
  "Contenu inapproprié ou non respectueux",
  "Coordonnées personnelles visibles dans le profil",
  "Profil semblant promotionnel ou non matrimonial",
] as const;

/**
 * GARDE L3-B2B : active réellement l'action « Mettre en pause » dans l'UI.
 *
 * Doit rester `false` tant que la migration `20260629000000` (ajout de la valeur
 * enum `paused`) n'est PAS appliquée et testée en base. Sinon un clic Pause
 * tenterait d'écrire un statut inexistant → l'enum rejetterait l'écriture.
 *
 * Passer à `true` UNIQUEMENT après application + test de la migration, puis
 * redéployer. C'est la seule ligne à changer pour activer Pause.
 */
export const PAUSE_ACTION_ENABLED = true;

/** Motifs de mise en pause prédéfinis. Même mécanique que REJECTION_REASONS. */
export const PAUSE_REASONS = [
  "Profil à compléter avant validation",
  "Photo à vérifier manuellement",
  "Identité à confirmer",
  "Informations sensibles à retirer",
  "Profil nécessitant une revue complémentaire",
  "Signalement ou doute à examiner",
  "Cohérence du profil à vérifier",
  "Attente d’un complément fourni par le membre",
] as const;

/* -------------------------------------------------------------------------- */
/* L3G — Transition de vérification transactionnelle (RPC                      */
/* admin_set_verification_status). Helpers PURS (client + serveur) reflétant   */
/* EXACTEMENT les règles de la fonction backend. La base reste l'autorité.     */
/* -------------------------------------------------------------------------- */

/** Statuts cibles qu'un admin peut poser (jamais `pending` : état membre). */
export type VerificationTargetStatus = "approved" | "rejected" | "paused";

/** Garde de type sur une cible de vérification (searchParams / formulaire). */
export function isVerificationTargetStatus(
  value: string | null | undefined,
): value is VerificationTargetStatus {
  return value === "approved" || value === "rejected" || value === "paused";
}

/** Une décision de vérification exige-t-elle un motif (rejected / paused) ? */
export function verificationReasonRequired(
  target: VerificationTargetStatus,
): boolean {
  return target === "rejected" || target === "paused";
}

/** Message FR générique (aucune erreur PostgreSQL brute exposée). */
export const VERIFICATION_ERROR_FALLBACK =
  "Une erreur est survenue pendant la mise à jour de la vérification.";

/**
 * Mapping des erreurs MÉTIER STABLES de `admin_set_verification_status` vers des
 * messages FR. Toute autre erreur retombe sur VERIFICATION_ERROR_FALLBACK — la
 * chaîne PostgreSQL brute n'est jamais renvoyée au navigateur.
 */
export const VERIFICATION_ERROR_MESSAGES: Record<string, string> = {
  PROFILE_NOT_FOUND: "Ce profil n’existe plus.",
  VERIFICATION_STATUS_CONFLICT:
    "Ce profil a été modifié par un autre administrateur. La page va être actualisée.",
  INVALID_VERIFICATION_STATUS: "Ce statut de vérification n’est pas valide.",
  INVALID_VERIFICATION_TRANSITION:
    "Cette transition de statut n’est pas autorisée.",
  REASON_REQUIRED: "Un motif est obligatoire pour cette décision.",
  REASON_LENGTH_INVALID: "Le motif doit contenir entre 5 et 500 caractères.",
  ACTOR_NOT_FOUND: "Le compte administrateur n’a pas pu être identifié.",
};

/**
 * Traduit un message d'exception plpgsql en message FR + code stable éventuel.
 * Le `code` n'est renvoyé QUE pour les erreurs métier connues (jamais un SQLSTATE
 * ni un détail interne).
 */
export function mapVerificationError(raw: string | null | undefined): {
  message: string;
  code?: string;
} {
  if (raw && raw in VERIFICATION_ERROR_MESSAGES) {
    return { message: VERIFICATION_ERROR_MESSAGES[raw], code: raw };
  }
  return { message: VERIFICATION_ERROR_FALLBACK };
}
