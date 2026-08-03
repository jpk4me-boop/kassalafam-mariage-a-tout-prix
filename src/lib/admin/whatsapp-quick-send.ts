/**
 * Envoi WhatsApp assisté (back-office) — helpers PURS, aucun accès DB, aucun
 * secret, AUCUN appel réseau.
 *
 * Principe : pas d'API Meta, pas d'automatisation. On construit un lien
 * `wa.me` avec le message DÉJÀ RÉDIGÉ ; l'administrateur clique, WhatsApp
 * s'ouvre, il relit et envoie lui-même. Un geste humain, pas un envoi
 * automatique — donc aucune inscription, aucune vérification, aucun coût.
 *
 * Confidentialité (mêmes règles que la fiche WhatsApp) : le message ne contient
 * JAMAIS le contenu d'un message privé ni le prénom d'un AUTRE membre. Seul le
 * prénom du destinataire est utilisé, et le lien pointe toujours vers /login.
 */

/** Types d'événements de `member_notifications` couverts par l'envoi assisté. */
export const QUICK_SEND_EVENT_LABELS: Record<string, string> = {
  new_message: "Nouveau message",
  new_interest: "Nouvel intérêt",
  interest_accepted: "Intérêt accepté",
  verification_approved: "Profil approuvé",
  verification_rejected: "Profil à corriger",
  verification_paused: "Vérification en pause",
  account_security: "Sécurité du compte",
};

const LOGIN_URL = "https://kassalafam.com/login";

/** Phrase propre à chaque événement (le « pourquoi » du message). */
const EVENT_SENTENCES: Record<string, string> = {
  new_message: "vous avez reçu un nouveau message sur KASSALAFAM.",
  new_interest: "un membre s’intéresse à votre profil sur KASSALAFAM.",
  interest_accepted: "votre intérêt a été accepté sur KASSALAFAM.",
  verification_approved: "votre profil KASSALAFAM vient d’être approuvé.",
  verification_rejected:
    "votre profil KASSALAFAM doit être corrigé avant validation.",
  verification_paused: "la vérification de votre profil KASSALAFAM est en pause.",
  account_security:
    "une activité concernant la sécurité de votre compte KASSALAFAM demande votre attention.",
};

/** Repli quand plusieurs événements distincts attendent le membre. */
const GENERIC_SENTENCE = "vous avez du nouveau sur KASSALAFAM.";

/** Libellé lisible d'un type, ou repli neutre. */
export function quickSendEventLabel(type: string): string {
  return QUICK_SEND_EVENT_LABELS[type] ?? "Notification";
}

/**
 * Message prérempli. Un seul type d'événement en attente → phrase dédiée ;
 * plusieurs types → phrase générique (on ne détaille pas, et on n'accumule
 * jamais les informations d'autrui).
 */
export function buildQuickSendMessage(
  firstName: string | null | undefined,
  eventTypes: readonly string[],
): string {
  const name = firstName?.trim() ?? "";
  const greeting = name === "" ? "Bonjour," : `Bonjour ${name},`;

  const distinct = Array.from(new Set(eventTypes));
  const sentence =
    distinct.length === 1
      ? (EVENT_SENTENCES[distinct[0]] ?? GENERIC_SENTENCE)
      : GENERIC_SENTENCE;

  return `${greeting} ${sentence} Connectez-vous pour en profiter : ${LOGIN_URL}`;
}

/**
 * Lien `wa.me` avec le message préencodé. Le numéro est normalisé (chiffres
 * uniquement, « + » retiré) comme l'exige WhatsApp. Renvoie `null` si le
 * numéro est absent ou inexploitable — l'appelant n'affiche alors aucun bouton.
 */
export function buildQuickSendUrl(
  phone: string | null | undefined,
  message: string,
): string | null {
  const digits = (phone ?? "").replace(/[^0-9]/g, "");
  if (digits.length < 8) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
