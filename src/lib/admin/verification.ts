/**
 * Constantes & types partagés pour la modération admin (importables côté
 * client ET serveur). Séparés de actions.ts car un fichier "use server" ne
 * peut exporter que des fonctions async.
 */

export type ActionResult = { ok: true } | { ok: false; error: string };

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
