/**
 * Analytique first-party — normalisation PURE (client + serveur, zéro accès DB).
 *
 * Convertit un chemin de navigation en « groupe de route » anonyme : les
 * segments dynamiques (UUID, tokens de partage, identifiants) sont remplacés
 * par leur segment nominal ([matchId], [profileId], [token]…). AUCUNE query
 * string n'est conservée ; seuls les paramètres UTM de l'allowlist sont
 * extraits séparément ; le référent est réduit à son hostname.
 *
 * Le serveur RE-normalise systématiquement (jamais de confiance au client) et
 * la base re-valide (analytics_is_valid_path_group + CHECK anti-UUID).
 */

/** Événements analytiques autorisés (miroir du CHECK de analytics_events). */
export const ANALYTICS_EVENT_TYPES = [
  "page_view",
  "registration_started",
  "login_succeeded",
] as const;
export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number];

export function isAnalyticsEventType(v: string): v is AnalyticsEventType {
  return (ANALYTICS_EVENT_TYPES as readonly string[]).includes(v);
}

/** Cadence du heartbeat client (uniquement onglet visible). */
export const HEARTBEAT_INTERVAL_MS = 60_000;

/** Bornes miroir des CHECK SQL. */
export const PATH_GROUP_MAX_LENGTH = 120;
export const UTM_VALUE_MAX_LENGTH = 80;
export const REFERRER_DOMAIN_MAX_LENGTH = 190;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PATH_GROUP_RE = /^\/[A-Za-z0-9\[\]_/-]*$/;
const UTM_VALUE_RE = /^[a-z0-9][a-z0-9._-]{0,79}$/;
const REFERRER_RE = /^[a-z0-9.-]{1,190}$/;

/**
 * Routes dynamiques CONNUES : le segment réel est remplacé par le nom du
 * paramètre. Prioritaire sur la règle générique (un token de partage /p/… n'est
 * PAS un UUID mais doit quand même disparaître).
 */
const DYNAMIC_ROUTES: { prefix: string[]; param: string }[] = [
  { prefix: ["matches"], param: "[matchId]" },
  { prefix: ["admin", "members"], param: "[profileId]" },
  { prefix: ["p"], param: "[token]" },
];

/**
 * Normalise un pathname en groupe de route anonyme.
 * Retourne null si le résultat n'est pas exploitable (chemin invalide, trop
 * long, ou segment non anonymisable) : dans ce cas, NE RIEN envoyer.
 */
export function normalizePath(rawPath: string): string | null {
  if (typeof rawPath !== "string" || rawPath.length === 0) return null;
  // Défense : ne garder que le pathname (jamais de query string ni fragment).
  const path = rawPath.split(/[?#]/)[0];
  if (!path.startsWith("/")) return null;
  if (path === "/") return "/";

  const segments = path.split("/").filter((s) => s.length > 0);
  const out: string[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];

    // 1. Route dynamique connue : le segment suivant le préfixe devient [param].
    const route = DYNAMIC_ROUTES.find(
      (r) =>
        r.prefix.length === i &&
        r.prefix.every((p, j) => segments[j] === p),
    );
    if (route) {
      out.push(route.param);
      continue;
    }

    // 2. Générique : tout UUID devient [id] (jamais conservé).
    if (UUID_RE.test(seg)) {
      out.push("[id]");
      continue;
    }

    // 3. Segment statique : charset strict, sinon chemin inexploitable.
    if (!/^[A-Za-z0-9_-]+$/.test(seg) || seg.length > 60) return null;
    out.push(seg);
  }

  const normalized = `/${out.join("/")}`;
  if (normalized.length > PATH_GROUP_MAX_LENGTH) return null;
  if (!PATH_GROUP_RE.test(normalized)) return null;
  return normalized;
}

export type UtmParams = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
};

const UTM_ALLOWLIST = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

/**
 * Extrait UNIQUEMENT les paramètres UTM de l'allowlist depuis une query string.
 * Toute valeur hors bornes/charset est ignorée ; tout autre paramètre (dont
 * redirect, email, recherche…) est jeté sans être lu au-delà du parsing URL.
 */
export function extractUtmParams(search: string): UtmParams {
  const out: UtmParams = {};
  if (typeof search !== "string" || search.length === 0) return out;
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    return out;
  }
  for (const key of UTM_ALLOWLIST) {
    const raw = params.get(key);
    if (!raw) continue;
    const value = raw.trim().toLowerCase();
    // Hors bornes ou hors charset → IGNORÉ (jamais tronqué ni réécrit).
    if (value.length <= UTM_VALUE_MAX_LENGTH && UTM_VALUE_RE.test(value)) {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Réduit un référent à son HOSTNAME (jamais l'URL complète). Retourne null si
 * invalide ou si le référent est le site lui-même (auto-référence).
 */
export function referrerDomain(
  referrer: string,
  currentHost?: string,
): string | null {
  if (typeof referrer !== "string" || referrer.length === 0) return null;
  let host: string;
  try {
    host = new URL(referrer).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (!REFERRER_RE.test(host)) return null;
  if (currentHost && host === currentHost.toLowerCase()) return null;
  return host;
}
