/**
 * KASSALAFAM — Statistiques & Analyses (back-office).
 *
 * Module PUR : ne fait AUCUN accès réseau/DB. Il reçoit des lignes brutes déjà
 * lues côté serveur (client service_role) et renvoie des AGRÉGATS. Aucune donnée
 * personnelle de ligne ne doit être transmise au client : la page n'affiche que
 * les nombres produits ici.
 *
 * Règle de fiabilité : chaque métrique est calculée exactement à partir du
 * schéma réel. Aucune valeur inventée. Les métriques non calculables ne sont pas
 * simulées — elles sont documentées comme indisponibles (voir UNAVAILABLE_METRICS).
 */

import { hasEssentialProfileInfo } from "@/lib/profile";
import type {
  ProfileRow,
  MatchStatus,
  ProfileVerificationStatus,
  AccountStatus,
} from "@/lib/types/database";

// ---------------------------------------------------------------------------
// Périodes
// ---------------------------------------------------------------------------

export type AnalyticsPeriod = "7d" | "30d" | "90d" | "all";

export const ANALYTICS_PERIODS: { key: AnalyticsPeriod; label: string }[] = [
  { key: "7d", label: "7 jours" },
  { key: "30d", label: "30 jours" },
  { key: "90d", label: "90 jours" },
  { key: "all", label: "Tout" },
];

export function isAnalyticsPeriod(value: string | undefined): value is AnalyticsPeriod {
  return value === "7d" || value === "30d" || value === "90d" || value === "all";
}

const PERIOD_DAYS: Record<Exclude<AnalyticsPeriod, "all">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

/** Borne basse (incluse) de la période, ou `null` pour « toute la période ». */
export function periodSince(period: AnalyticsPeriod, now: Date): Date | null {
  if (period === "all") return null;
  const since = new Date(now);
  since.setUTCDate(since.getUTCDate() - PERIOD_DAYS[period]);
  return since;
}

function inWindow(iso: string | null, since: Date | null, now: Date): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  if (t > now.getTime()) return false;
  if (since && t < since.getTime()) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Formes minimales des lignes brutes (lues via service_role)
// ---------------------------------------------------------------------------

/** Sous-ensemble de `profiles` requis pour les analyses. */
export type ProfileAnalyticsRow = Pick<
  ProfileRow,
  | "id"
  | "first_name"
  | "gender"
  | "birth_date"
  | "country"
  | "city"
  | "marital_status"
  | "bio"
  | "partner_expectations"
  | "intention"
  | "blur_photos"
  | "is_premium"
  | "discovery_universe"
  | "verification_status"
  | "account_status"
  | "created_at"
>;

export type PhotoAnalyticsRow = { profile_id: string; is_primary: boolean };
export type MatchAnalyticsRow = {
  user_a: string;
  user_b: string;
  status: MatchStatus;
  created_at: string;
};
export type MessageAnalyticsRow = {
  sender_id: string;
  match_id: string;
  created_at: string;
};
export type SafetyReportAnalyticsRow = {
  status: "open" | "reviewing" | "resolved" | "dismissed";
  created_at: string;
};
export type ModerationActionRow = {
  new_status: AccountStatus;
  previous_status: AccountStatus;
  reason: string;
  created_at: string;
};

export type AnalyticsInput = {
  profiles: ProfileAnalyticsRow[];
  photos: PhotoAnalyticsRow[];
  matches: MatchAnalyticsRow[];
  messages: MessageAnalyticsRow[];
  safetyReports: SafetyReportAnalyticsRow[];
  moderationActions: ModerationActionRow[];
};

// ---------------------------------------------------------------------------
// Résultat
// ---------------------------------------------------------------------------

export type MembersStats = {
  total: number;
  new7d: number;
  new30d: number;
  complete: number;
  incomplete: number;
  withPrimaryPhoto: number;
  verified: number;
  pending: number;
  rejected: number;
  paused: number;
  active: number;
  suspended: number;
};

export type EngagementStats = {
  interestsSent: number;
  interestsAccepted: number;
  interestsRejected: number;
  interestsPending: number;
  matchesCreated: number;
  activeConversations: number;
  messagesSent: number;
  usersWithMatch: number;
};

export type SecurityStats = {
  reportsOpen: number;
  reportsReviewing: number;
  reportsResolved: number;
  reportsDismissed: number;
  suspendedAccounts: number;
  recentModeration: {
    newStatus: AccountStatus;
    previousStatus: AccountStatus;
    reason: string;
    createdAt: string;
  }[];
};

export type FunnelStep = { key: string; label: string; count: number };

export type Distribution = { label: string; count: number }[];

export type TrendPoint = { label: string; iso: string; count: number };

export type AnalyticsResult = {
  period: AnalyticsPeriod;
  cohortSize: number;
  members: MembersStats;
  engagement: EngagementStats;
  security: SecurityStats;
  funnel: FunnelStep[];
  byCountry: Distribution;
  byCity: Distribution;
  byAgeBucket: Distribution;
  registrationTrend: TrendPoint[];
  trendGranularity: "day" | "week";
};

// ---------------------------------------------------------------------------
// Helpers de calcul
// ---------------------------------------------------------------------------

/** Âge en années révolues à la date `now`, ou `null` si date invalide. */
export function ageFromBirthDate(birthDate: string | null, now: Date): number | null {
  if (!birthDate) return null;
  const d = new Date(birthDate);
  if (Number.isNaN(d.getTime())) return null;
  let age = now.getUTCFullYear() - d.getUTCFullYear();
  const m = now.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

const AGE_BUCKETS: { label: string; min: number; max: number }[] = [
  { label: "18–24", min: 18, max: 24 },
  { label: "25–34", min: 25, max: 34 },
  { label: "35–44", min: 35, max: 44 },
  { label: "45–54", min: 45, max: 54 },
  { label: "55+", min: 55, max: 200 },
];

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Numéro de bucket ISO-8601 approximé par la date de début de semaine (lundi). */
function startOfWeek(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = (d.getUTCDay() + 6) % 7; // 0 = lundi
  d.setUTCDate(d.getUTCDate() - day);
  return d;
}

function topDistribution(
  values: (string | null)[],
  limit: number,
): Distribution {
  const counts = new Map<string, number>();
  for (const raw of values) {
    const key = (raw ?? "").trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// Calcul principal
// ---------------------------------------------------------------------------

/**
 * Calcule tous les agrégats. `now` est injecté (jamais `new Date()` implicite au
 * milieu du calcul) pour un résultat déterministe et testable.
 *
 * Portée de la période :
 *  - « Membres » (A) et « Sécurité » (C) sont des INSTANTANÉS d'état actuel
 *    (non filtrés) — sauf `new7d`/`new30d` qui sont des fenêtres fixes.
 *  - « Engagement » (B), « Conversion » (D) et « Répartition » (E) sont
 *    calculés sur la période sélectionnée (created_at dans la fenêtre).
 */
export function computeAnalytics(
  input: AnalyticsInput,
  period: AnalyticsPeriod,
  now: Date,
): AnalyticsResult {
  const since = periodSince(period, now);
  const since7d = periodSince("7d", now);
  const since30d = periodSince("30d", now);

  const { profiles, photos, matches, messages, safetyReports, moderationActions } =
    input;

  // --- Index photos : profils ayant une photo principale ---------------------
  const profilesWithPrimaryPhoto = new Set<string>();
  for (const p of photos) {
    if (p.is_primary) profilesWithPrimaryPhoto.add(p.profile_id);
  }

  // === A. Membres (instantané, sauf fenêtres fixes 7j/30j) ====================
  let complete = 0;
  for (const p of profiles) {
    if (hasEssentialProfileInfo(p as unknown as ProfileRow)) complete += 1;
  }
  const countVerif = (s: ProfileVerificationStatus) =>
    profiles.filter((p) => p.verification_status === s).length;
  const countAccount = (s: AccountStatus) =>
    profiles.filter((p) => p.account_status === s).length;

  const members: MembersStats = {
    total: profiles.length,
    new7d: profiles.filter((p) => inWindow(p.created_at, since7d, now)).length,
    new30d: profiles.filter((p) => inWindow(p.created_at, since30d, now)).length,
    complete,
    incomplete: profiles.length - complete,
    withPrimaryPhoto: profiles.filter((p) => profilesWithPrimaryPhoto.has(p.id))
      .length,
    verified: countVerif("approved"),
    pending: countVerif("pending"),
    rejected: countVerif("rejected"),
    paused: countVerif("paused"),
    active: countAccount("active"),
    suspended: countAccount("suspended"),
  };

  // === B. Engagement (filtré par période via created_at) ======================
  const matchesInPeriod = matches.filter((m) => inWindow(m.created_at, since, now));
  const messagesInPeriod = messages.filter((m) =>
    inWindow(m.created_at, since, now),
  );

  const countStatus = (s: MatchStatus) =>
    matchesInPeriod.filter((m) => m.status === s).length;

  const usersWithMatch = new Set<string>();
  for (const m of matchesInPeriod) {
    if (m.status === "accepted") {
      usersWithMatch.add(m.user_a);
      usersWithMatch.add(m.user_b);
    }
  }
  const activeConversationIds = new Set<string>();
  for (const m of messagesInPeriod) activeConversationIds.add(m.match_id);

  const engagement: EngagementStats = {
    interestsSent: matchesInPeriod.length,
    interestsAccepted: countStatus("accepted"),
    interestsRejected: countStatus("rejected"),
    interestsPending: countStatus("pending"),
    matchesCreated: countStatus("accepted"),
    activeConversations: activeConversationIds.size,
    messagesSent: messagesInPeriod.length,
    usersWithMatch: usersWithMatch.size,
  };

  // === C. Sécurité (instantané) ==============================================
  const countReport = (s: SafetyReportAnalyticsRow["status"]) =>
    safetyReports.filter((r) => r.status === s).length;

  const recentModeration = [...moderationActions]
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
    .slice(0, 8)
    .map((a) => ({
      newStatus: a.new_status,
      previousStatus: a.previous_status,
      reason: a.reason,
      createdAt: a.created_at,
    }));

  const security: SecurityStats = {
    reportsOpen: countReport("open"),
    reportsReviewing: countReport("reviewing"),
    reportsResolved: countReport("resolved"),
    reportsDismissed: countReport("dismissed"),
    suspendedAccounts: members.suspended,
    recentModeration,
  };

  // === D. Conversion (cohorte = profils inscrits dans la période) =============
  const cohort = profiles.filter((p) => inWindow(p.created_at, since, now));
  const cohortIds = new Set(cohort.map((p) => p.id));

  const initiators = new Set<string>(); // ont exprimé ≥1 intérêt (user_a)
  const matchedUsers = new Set<string>(); // ≥1 match accepté
  for (const m of matches) {
    if (cohortIds.has(m.user_a)) initiators.add(m.user_a);
    if (m.status === "accepted") {
      if (cohortIds.has(m.user_a)) matchedUsers.add(m.user_a);
      if (cohortIds.has(m.user_b)) matchedUsers.add(m.user_b);
    }
  }
  const senders = new Set<string>();
  for (const m of messages) {
    if (cohortIds.has(m.sender_id)) senders.add(m.sender_id);
  }

  const funnel: FunnelStep[] = [
    { key: "signup", label: "Inscription", count: cohort.length },
    {
      key: "complete",
      label: "Profil complété",
      count: cohort.filter((p) => hasEssentialProfileInfo(p as unknown as ProfileRow))
        .length,
    },
    {
      key: "photo",
      label: "Photo ajoutée",
      count: cohort.filter((p) => profilesWithPrimaryPhoto.has(p.id)).length,
    },
    {
      key: "verified",
      label: "Profil vérifié",
      count: cohort.filter((p) => p.verification_status === "approved").length,
    },
    { key: "interest", label: "Premier intérêt", count: initiators.size },
    { key: "match", label: "Premier match", count: matchedUsers.size },
    { key: "message", label: "Premier message", count: senders.size },
  ];

  // === E. Répartition (cohorte de la période) =================================
  const byCountry = topDistribution(
    cohort.map((p) => p.country),
    8,
  );
  const byCity = topDistribution(
    cohort.map((p) => p.city),
    8,
  );

  const ageCounts = AGE_BUCKETS.map((b) => ({ label: b.label, count: 0 }));
  for (const p of cohort) {
    const age = ageFromBirthDate(p.birth_date, now);
    if (age === null) continue;
    const idx = AGE_BUCKETS.findIndex((b) => age >= b.min && age <= b.max);
    if (idx >= 0) ageCounts[idx].count += 1;
  }
  const byAgeBucket = ageCounts.filter((b) => b.count > 0);

  // Tendance d'inscription : par jour si période bornée, sinon par semaine.
  const trendGranularity: "day" | "week" = period === "all" ? "week" : "day";
  const registrationTrend = buildTrend(
    cohort.map((p) => p.created_at),
    trendGranularity,
    since,
    now,
  );

  return {
    period,
    cohortSize: cohort.length,
    members,
    engagement,
    security,
    funnel,
    byCountry,
    byCity,
    byAgeBucket,
    registrationTrend,
    trendGranularity,
  };
}

/**
 * Construit une série temporelle continue (jours ou semaines) entre `since`
 * (ou la 1re inscription pour « all ») et `now`, chaque point comptant les
 * inscriptions. Les intervalles vides valent 0 pour ne pas fausser la lecture.
 * Bornée à ~26 points pour rester lisible sans dépendance graphique.
 */
function buildTrend(
  createdAts: string[],
  granularity: "day" | "week",
  since: Date | null,
  now: Date,
): TrendPoint[] {
  const times = createdAts
    .map((iso) => new Date(iso).getTime())
    .filter((t) => !Number.isNaN(t) && t <= now.getTime());
  if (times.length === 0) return [];

  const start = since ?? new Date(Math.min(...times));
  const bucketMs = granularity === "day" ? 86_400_000 : 7 * 86_400_000;
  const MAX_POINTS = 26;

  const normalize = (d: Date) =>
    granularity === "day"
      ? new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
      : startOfWeek(d);

  let cursor = normalize(start);
  const end = normalize(now);
  const buckets = new Map<string, number>();
  const order: string[] = [];
  while (cursor.getTime() <= end.getTime()) {
    const key = ymd(cursor);
    buckets.set(key, 0);
    order.push(key);
    cursor = new Date(cursor.getTime() + bucketMs);
  }

  for (const t of times) {
    const key = ymd(normalize(new Date(t)));
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  const points = order.map((iso) => ({
    iso,
    label: iso.slice(5), // MM-DD
    count: buckets.get(iso) ?? 0,
  }));

  // Garde les MAX_POINTS derniers intervalles (les plus récents).
  return points.slice(-MAX_POINTS);
}

/**
 * Métriques explicitement NON calculables avec le schéma actuel. Utilisé pour la
 * transparence (affichage « Donnée non disponible » et section de bilan). Ne
 * jamais simuler ces valeurs.
 */
export const UNAVAILABLE_METRICS: { label: string; reason: string }[] = [
  {
    label: "Membres / visiteurs en ligne",
    reason: "Aucune source de session temps réel (pas de suivi de présence).",
  },
  {
    label: "Dernière connexion / activité réelle",
    reason:
      "Aucun horodatage de connexion. `profiles.updated_at` reflète l'édition du profil, pas une session.",
  },
  {
    label: "Sources d'acquisition / trafic",
    reason: "Aucun suivi analytique tiers installé (choix volontaire).",
  },
];
