/**
 * Référentiel STATIQUE des régions / subdivisions administratives, en français.
 *
 * Même contrat que `cities-fr.ts` : dataset versionné dans le dépôt, aucun
 * appel réseau, aucune dépendance npm. La clé est le code ISO 3166-1 alpha-2
 * du pays (jamais persisté) ; les libellés FRANÇAIS sont les valeurs
 * réellement stockées dans `profiles.region` (colonne texte inchangée).
 *
 * Couverture volontairement PARTIELLE : seuls les pays dont les subdivisions
 * sont utiles au recrutement actuel sont listés. Pour tout autre pays, le
 * champ reste en saisie libre — aucune régression pour les membres existants,
 * dont les valeurs héritées sont conservées telles quelles.
 */

/** Libellé UI de la saisie manuelle (jamais stocké en base). */
export const OTHER_REGION_LABEL = "Autre région";

/** Régions par code ISO 3166-1 alpha-2. */
export const REGIONS_FR: Record<string, readonly string[]> = {
  // Cameroun — les 10 régions officielles.
  CM: [
    "Adamaoua",
    "Centre",
    "Est",
    "Extrême-Nord",
    "Littoral",
    "Nord",
    "Nord-Ouest",
    "Ouest",
    "Sud",
    "Sud-Ouest",
  ],
};
