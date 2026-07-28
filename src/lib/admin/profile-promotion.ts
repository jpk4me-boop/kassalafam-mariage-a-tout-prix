/**
 * Aides PURES de l'interface admin « Promotion du profil » (PR #82).
 *
 * Aucune dépendance serveur : ce module est importé par des composants client
 * (formulaire, partage) ET par les Server Actions, et testé directement par
 * `scripts/admin-profile-promotion-ui.test.mjs` (type stripping Node).
 * Le serveur (RPC SQL) reste l'autorité finale sur toutes les contraintes.
 */

export type PromotionChannel =
  | "facebook"
  | "instagram"
  | "snapchat"
  | "whatsapp";

export const PROMOTION_CHANNEL_LABELS: Record<PromotionChannel, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  snapchat: "Snapchat",
  whatsapp: "WhatsApp",
};

/** Abréviations pour les résumés compacts de la liste des membres. */
export const PROMOTION_CHANNEL_SHORT_LABELS: Record<PromotionChannel, string> = {
  facebook: "FB",
  instagram: "IG",
  snapchat: "SC",
  whatsapp: "WA",
};

export function isPromotionChannel(value: string): value is PromotionChannel {
  return value in PROMOTION_CHANNEL_LABELS;
}

/** Statuts de lien renvoyés par `admin_list_profile_promotion_share_links`. */
export const PROMOTION_LINK_STATUS_LABELS: Record<string, string> = {
  active: "Actif",
  expired: "Expiré",
  revoked: "Révoqué",
  invalidated: "Invalidé",
};

/** Résumé compact du consentement promotionnel pour la liste des membres. */
export type PromotionSummaryTone = "ok" | "muted" | "warn";

export function promotionSummary(input: {
  eligibility_reason: string;
}): { label: string; tone: PromotionSummaryTone } {
  switch (input.eligibility_reason) {
    case "eligible":
      return { label: "Autorisé", tone: "ok" };
    case "consent_required":
      return { label: "Non autorisé", tone: "muted" };
    case "consent_expired":
      return { label: "Expiré", tone: "warn" };
    default:
      return { label: "Inéligible", tone: "warn" };
  }
}

// ---------------------------------------------------------------------------
// Durées de lien.
//
// La RPC impose : expiration ≥ now()+1 h, ≤ now()+30 j et ≤ expiration du
// consentement. `EXPIRY_MARGIN_MS` absorbe l'écart d'horloge entre le calcul
// applicatif et le `now()` SQL : la durée minimale est légèrement majorée et
// la durée maximale légèrement minorée pour ne jamais frôler une borne.
// ---------------------------------------------------------------------------

export const PROMOTION_LINK_DURATIONS = [
  { minutes: 60, label: "1 heure" },
  { minutes: 1440, label: "24 heures" },
  { minutes: 10080, label: "7 jours" },
  { minutes: 43200, label: "30 jours" },
] as const;

export type PromotionDurationMinutes =
  (typeof PROMOTION_LINK_DURATIONS)[number]["minutes"];

export function isPromotionDuration(
  value: number,
): value is PromotionDurationMinutes {
  return PROMOTION_LINK_DURATIONS.some((d) => d.minutes === value);
}

const EXPIRY_MARGIN_MS = 2 * 60 * 1000;
const MAX_LINK_MS = 30 * 24 * 60 * 60 * 1000;

/** Expiration effective (ISO) demandée à la RPC pour une durée proposée. */
export function shareLinkExpiryIso(now: Date, minutes: number): string {
  const raw = now.getTime() + minutes * 60 * 1000 + EXPIRY_MARGIN_MS;
  const cap = now.getTime() + MAX_LINK_MS - EXPIRY_MARGIN_MS;
  return new Date(Math.min(raw, cap)).toISOString();
}

/**
 * Durées proposées dans le formulaire : une durée est désactivée lorsque son
 * expiration effective dépasserait celle du consentement promotionnel.
 */
export function availablePromotionDurations(
  now: Date,
  consentExpiresAt: string | null,
): { minutes: PromotionDurationMinutes; label: string; disabled: boolean }[] {
  const consentExpiry = consentExpiresAt ? new Date(consentExpiresAt) : null;
  const consentMs =
    consentExpiry && !Number.isNaN(consentExpiry.getTime())
      ? consentExpiry.getTime()
      : null;

  return PROMOTION_LINK_DURATIONS.map((d) => ({
    minutes: d.minutes,
    label: d.label,
    disabled:
      consentMs === null ||
      new Date(shareLinkExpiryIso(now, d.minutes)).getTime() > consentMs,
  }));
}

// ---------------------------------------------------------------------------
// URLs publiques et partage.
// ---------------------------------------------------------------------------

/** Domaine canonique : les liens promotionnels sont toujours en Production. */
export const PROMOTION_SITE_URL = "https://kassalafam.com";

export function promotionUrlFromToken(token: string): string {
  return `${PROMOTION_SITE_URL}/promo/${encodeURIComponent(token)}`;
}

/** Message accompagnant un partage WhatsApp (jamais de donnée personnelle). */
export const PROMOTION_SHARE_TEXT =
  "Découvrez ce profil présenté avec son autorisation sur KASSALAFAM, la plateforme de mariage sérieuse et confidentielle.";

export function buildWhatsAppShareUrl(url: string, text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`;
}

export function buildFacebookShareUrl(url: string): string {
  return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
}

// ---------------------------------------------------------------------------
// Formatage des dates (fr-FR), aligné sur les fiches admin existantes.
// ---------------------------------------------------------------------------

const DATE_TIME_FMT = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function formatPromotionDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : DATE_TIME_FMT.format(d);
}
