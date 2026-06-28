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
