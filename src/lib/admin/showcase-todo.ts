/**
 * Vitrine — état des membres côté back-office. Helpers PURS : libellés,
 * regroupement et message de relance. Aucune règle d'éligibilité ici : elle
 * vient EXCLUSIVEMENT de la base (RPC `admin_list_showcase_candidates`, qui
 * encapsule `candidate_showcase_eligibility_reason`).
 */

/** Ce qu'il reste à faire, exprimé du point de vue de l'administrateur. */
export type ShowcaseGroupKey =
  | "published"
  | "ready"
  | "consent_required"
  | "photo_privacy_enabled"
  | "profile_incomplete"
  | "other";

export const SHOWCASE_GROUP_LABELS: Record<ShowcaseGroupKey, string> = {
  published: "Déjà sur la vitrine",
  ready: "Prêts à publier",
  consent_required: "Il ne manque que leur autorisation",
  photo_privacy_enabled: "Bloqués par le floutage des photos",
  profile_incomplete: "Profil à compléter",
  other: "Autres blocages",
};

/** Explication courte, affichée sous le titre de chaque groupe. */
export const SHOWCASE_GROUP_HINTS: Record<ShowcaseGroupKey, string> = {
  published: "Leur profil est visible publiquement sur /candidats.",
  ready:
    "Tout est en règle : ils n’ont plus qu’à appuyer sur « Publier » depuis leur profil.",
  consent_required:
    "Leur profil remplit toutes les conditions ; il leur reste à autoriser la présentation publique depuis « Mon profil ».",
  photo_privacy_enabled:
    "Leurs photos sont floutées : la vitrine exige une photo visible. Ce réglage se change depuis « Mon profil ».",
  profile_incomplete:
    "Une information de leur profil manque ou a été effacée depuis leur inscription.",
  other: "Conditions non remplies pour une autre raison.",
};

/** Classe un membre dans le bon groupe à partir du motif renvoyé par la base. */
export function showcaseGroupOf(
  eligibilityReason: string,
  isPublished: boolean,
): ShowcaseGroupKey {
  if (isPublished) return "published";
  if (eligibilityReason === "eligible") return "ready";
  if (eligibilityReason === "consent_required") return "consent_required";
  if (eligibilityReason === "photo_privacy_enabled") {
    return "photo_privacy_enabled";
  }
  if (
    eligibilityReason === "profile_incomplete" ||
    eligibilityReason === "onboarding_incomplete"
  ) {
    return "profile_incomplete";
  }
  return "other";
}

/** Ordre d'affichage : d'abord ce sur quoi l'administrateur peut agir. */
export const SHOWCASE_GROUP_ORDER: ShowcaseGroupKey[] = [
  "ready",
  "consent_required",
  "photo_privacy_enabled",
  "profile_incomplete",
  "other",
  "published",
];

const LOGIN_URL = "https://kassalafam.com/login";

/** Phrase adaptée à ce qui bloque — jamais de reproche, toujours l'action. */
const GROUP_SENTENCES: Record<ShowcaseGroupKey, string> = {
  published: "votre profil est bien visible sur la vitrine KASSALAFAM.",
  ready:
    "votre profil remplit toutes les conditions pour figurer sur notre vitrine publique. Il ne vous reste qu’à appuyer sur « Publier » depuis « Mon profil ».",
  consent_required:
    "votre profil peut désormais figurer sur notre vitrine publique, où davantage de personnes le découvriront. Il ne manque que votre autorisation, depuis « Mon profil ».",
  photo_privacy_enabled:
    "votre profil pourrait figurer sur notre vitrine publique, mais vos photos sont floutées. En les rendant visibles depuis « Mon profil », vous pourrez y apparaître.",
  profile_incomplete:
    "il manque une information à votre profil pour qu’il puisse figurer sur notre vitrine publique. Quelques instants suffisent à le compléter.",
  other:
    "votre profil ne remplit pas encore les conditions pour figurer sur notre vitrine publique.",
};

/** Message prérempli pour le lien WhatsApp (même esprit qu'« À prévenir »). */
export function buildShowcaseMessage(
  firstName: string | null | undefined,
  group: ShowcaseGroupKey,
): string {
  const name = firstName?.trim() ?? "";
  const greeting = name === "" ? "Bonjour," : `Bonjour ${name},`;
  return `${greeting} ${GROUP_SENTENCES[group]} Connectez-vous : ${LOGIN_URL}`;
}

/**
 * Lien `wa.me` avec le message préencodé — aucun envoi automatique, aucune API :
 * l'administrateur relit et envoie lui-même. `null` si le numéro est absent ou
 * inexploitable (aucun bouton n'est alors affiché).
 */
export function buildShowcaseWhatsappUrl(
  phone: string | null | undefined,
  message: string,
): string | null {
  const digits = (phone ?? "").replace(/[^0-9]/g, "");
  if (digits.length < 8) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
