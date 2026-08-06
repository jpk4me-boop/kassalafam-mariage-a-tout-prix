/**
 * Coordonnées personnelles dans les champs PUBLICS — miroir client.
 *
 * ⚠️ La BASE fait autorité : le trigger `profiles_reject_contact_details`
 * (migration 20260806073500) refuse l'écriture quoi qu'il arrive. Ce module ne
 * sert qu'à afficher un message aimable AVANT l'aller-retour réseau. Toute
 * évolution des motifs doit être portée AUX DEUX ENDROITS — une suite de tests
 * compare les deux listes.
 *
 * Module volontairement SANS import : testable sans build.
 */

/** Champs publics protégés, dans l'ordre où le trigger les examine. */
export type PublicProfileField =
  | "bio"
  | "partner_expectations"
  | "first_name"
  | "pseudo";

/** Valeurs en cours d'édition, telles que l'interface les tient. */
export type PublicProfileValues = Partial<
  Record<PublicProfileField, string | null | undefined>
>;

/** Message affiché sous le champ fautif. Un par champ : on nomme le tort. */
export const CONTACT_DETAILS_MESSAGES: Record<PublicProfileField, string> = {
  bio: "Votre présentation est visible publiquement : retirez-en votre numéro, votre email ou votre identifiant de messagerie.",
  partner_expectations:
    "Vos attentes sont visibles publiquement : retirez-en votre numéro, votre email ou votre identifiant de messagerie.",
  first_name:
    "Votre prénom est affiché publiquement : il ne peut pas contenir de coordonnées.",
  pseudo:
    "Votre pseudo est affiché publiquement : il ne peut pas contenir de coordonnées.",
};

/**
 * Mêmes motifs que `public.text_has_contact_details`, dans le même ordre.
 *
 * Conservateur par choix : un âge, une année ou un prix en FCFA passent. Le
 * « / » n'est pas un séparateur accepté, pour ne pas refuser une date.
 */
const CONTACT_PATTERNS: readonly RegExp[] = [
  /([0-9][ .()-]?){8,}/,
  /\+ ?[0-9]([ .()-]?[0-9]){5,}/,
  /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i,
  /@[a-z0-9._]{3,}/i,
  /(whats ?app|wa\.me|t\.me|telegram|snapchat|viber|imo\.im)/i,
];

/** Vrai si le texte contient un numéro, un email ou un identifiant. */
export function hasContactDetails(text: string | null | undefined): boolean {
  if (!text || text.trim() === "") return false;

  return CONTACT_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Premier champ fautif d'un profil en cours d'édition, ou `null` si tout va
 * bien. L'ordre reproduit celui du trigger, pour que client et base désignent
 * TOUJOURS le même champ.
 */
export function firstFieldWithContactDetails(
  values: PublicProfileValues,
): PublicProfileField | null {
  const order: PublicProfileField[] = [
    "bio",
    "partner_expectations",
    "first_name",
    "pseudo",
  ];

  for (const field of order) {
    if (hasContactDetails(values[field])) return field;
  }

  return null;
}

/**
 * Traduit l'erreur remontée par la base en message affichable.
 *
 * @param message le `message` de l'erreur Postgres
 * @param detail  le `details` de l'erreur Postgres — le nom du champ fautif
 */
export function contactDetailsErrorMessage(
  message: string | null | undefined,
  detail: string | null | undefined,
): string | null {
  if (message !== "PROFILE_CONTACT_DETAILS_NOT_ALLOWED") return null;

  const field = (detail ?? "").trim();

  // Parcours plutôt qu'indexation : pas de conversion de type, donc le module
  // reste évaluable tel quel par la suite de tests.
  for (const [key, text] of Object.entries(CONTACT_DETAILS_MESSAGES)) {
    if (key === field) return text;
  }

  return CONTACT_DETAILS_MESSAGES.bio;
}
