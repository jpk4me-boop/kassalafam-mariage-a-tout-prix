/**
 * Contact WhatsApp public — helpers PURS (aucun import, testables sans build).
 *
 * Point d'entrée visiteur : un bouton flottant sur les pages publiques ouvre
 * une conversation `wa.me` PRÉ-REMPLIE. C'est le VISITEUR qui initie l'échange,
 * donc le cas où le risque de blocage du numéro émetteur est nul — voir les
 * garde-fous du §5.4 de la mémoire projet (incident du 04/08).
 *
 * Le numéro n'est jamais écrit en dur : il vient de `NEXT_PUBLIC_WHATSAPP_CONTACT`.
 * Variable absente ou invalide ⇒ aucun bouton affiché (échec silencieux, jamais
 * un lien `wa.me` cassé en production).
 */

/** Contextes d'ouverture — un message d'amorce différent pour chacun. */
export type WhatsappContactContext =
  | "accueil"
  | "vitrine"
  | "profil-partage"
  | "aide";

/**
 * Messages d'amorce. Rédigés du point de vue du VISITEUR : c'est lui qui écrit.
 * Volontairement courts — un pavé pré-rempli n'est jamais envoyé.
 */
export const WHATSAPP_CONTACT_MESSAGES: Record<WhatsappContactContext, string> =
  {
    accueil: "Bonjour, j'ai une question sur KASSALAFAM.",
    vitrine:
      "Bonjour, je viens de voir les profils sur KASSALAFAM et j'aimerais en savoir plus.",
    "profil-partage":
      "Bonjour, on m'a partagé un profil KASSALAFAM et j'aimerais des informations.",
    aide: "Bonjour, j'ai besoin d'aide au sujet de mon compte KASSALAFAM.",
  };

/**
 * Normalise un numéro en chiffres pour `wa.me` : retire espaces, points,
 * tirets, parenthèses, le `+` et le `00` international.
 *
 * @returns les chiffres seuls, ou `null` si le résultat n'est pas un numéro
 *   international plausible (8 à 15 chiffres, recommandation E.164).
 */
export function normalizeWhatsappNumber(raw: string | undefined): string | null {
  if (!raw) return null;

  let digits = raw.replace(/[^0-9+]/g, "");

  if (digits.startsWith("+")) {
    digits = digits.slice(1);
  } else if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }

  digits = digits.replace(/[^0-9]/g, "");

  if (digits.length < 8 || digits.length > 15) return null;

  return digits;
}

/**
 * Construit l'URL `wa.me` avec le message pré-rempli encodé.
 *
 * @returns l'URL, ou `null` si le numéro est inexploitable — l'appelant doit
 *   alors ne RIEN afficher.
 */
export function buildWhatsappContactUrl(
  rawNumber: string | undefined,
  context: WhatsappContactContext,
): string | null {
  const number = normalizeWhatsappNumber(rawNumber);
  if (!number) return null;

  const message =
    WHATSAPP_CONTACT_MESSAGES[context] ?? WHATSAPP_CONTACT_MESSAGES.accueil;

  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
