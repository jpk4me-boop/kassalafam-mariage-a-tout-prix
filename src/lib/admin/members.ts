/**
 * L3G — Modèle PUR (client + serveur) de la liste des membres du back-office :
 * lecture/validation des `searchParams` (NON fiables), construction d'URL
 * préservant les filtres, libellés et options d'UI. Aucun accès DB, aucun
 * secret. Les valeurs techniques reflètent les paramètres de la RPC
 * `admin_list_members`.
 */

import type {
  AccountStatus,
  ProfileVerificationStatus,
} from "@/lib/types/database";

/** Taille de page (pagination réelle côté base via limit/offset). */
export const MEMBERS_PAGE_SIZE = 20;

export type MemberSort = "recent" | "old" | "updated" | "alpha";
export type CompletenessFilter = "complete" | "incomplete";
export type PhotoFilter = "with" | "without";

/** Filtres normalisés issus des searchParams. `null` = filtre inactif. */
export type MembersFilters = {
  search: string;
  account: AccountStatus | null;
  verification: ProfileVerificationStatus | null;
  completeness: CompletenessFilter | null;
  photo: PhotoFilter | null;
  country: string | null;
  city: string | null;
  sort: MemberSort;
  page: number;
};

/** Options de tri (ordre d'affichage). */
export const MEMBER_SORTS: { key: MemberSort; label: string }[] = [
  { key: "recent", label: "Inscription récente" },
  { key: "old", label: "Inscription ancienne" },
  { key: "updated", label: "Dernière modification" },
  { key: "alpha", label: "Ordre alphabétique" },
];

/** Filtres de statut de compte. */
export const ACCOUNT_FILTERS: { key: AccountStatus; label: string }[] = [
  { key: "active", label: "Actif" },
  { key: "suspended", label: "Suspendu" },
];

/** Filtres de statut de vérification. */
export const VERIFICATION_FILTERS: {
  key: ProfileVerificationStatus;
  label: string;
}[] = [
  { key: "approved", label: "Vérifié" },
  { key: "pending", label: "En attente" },
  { key: "rejected", label: "Refusé" },
  { key: "paused", label: "En pause" },
];

/** Filtres de complétude. */
export const COMPLETENESS_FILTERS: { key: CompletenessFilter; label: string }[] =
  [
    { key: "complete", label: "Profil complet" },
    { key: "incomplete", label: "Profil incomplet" },
  ];

/** Filtres photo. */
export const PHOTO_FILTERS: { key: PhotoFilter; label: string }[] = [
  { key: "with", label: "Avec photo" },
  { key: "without", label: "Sans photo" },
];

function asAccount(value: string | undefined): AccountStatus | null {
  return value === "active" || value === "suspended" ? value : null;
}

function asVerification(
  value: string | undefined,
): ProfileVerificationStatus | null {
  return value === "pending" ||
    value === "approved" ||
    value === "rejected" ||
    value === "paused"
    ? value
    : null;
}

function asCompleteness(value: string | undefined): CompletenessFilter | null {
  return value === "complete" || value === "incomplete" ? value : null;
}

function asPhoto(value: string | undefined): PhotoFilter | null {
  return value === "with" || value === "without" ? value : null;
}

export function isMemberSort(value: string | undefined): value is MemberSort {
  return (
    value === "recent" ||
    value === "old" ||
    value === "updated" ||
    value === "alpha"
  );
}

/** Nettoie une valeur texte libre (recherche / pays / ville) : trim + borne. */
function cleanText(value: string | undefined, max = 120): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().slice(0, max);
  return v === "" ? null : v;
}

/**
 * Valide et normalise les searchParams (non fiables) en filtres exploitables.
 * Toute valeur invalide est ignorée (repli sûr), jamais propagée telle quelle.
 */
export function parseMembersFilters(
  sp: Record<string, string | undefined>,
): MembersFilters {
  const pageRaw = Number.parseInt(sp.page ?? "1", 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;

  return {
    search: cleanText(sp.q, 120) ?? "",
    account: asAccount(sp.account),
    verification: asVerification(sp.verification),
    completeness: asCompleteness(sp.completeness),
    photo: asPhoto(sp.photo),
    country: cleanText(sp.country, 80),
    city: cleanText(sp.city, 80),
    sort: isMemberSort(sp.sort) ? sp.sort : "recent",
    page,
  };
}

/** Vrai si au moins un filtre (hors tri/page) est actif. */
export function hasActiveMemberFilters(f: MembersFilters): boolean {
  return Boolean(
    f.search ||
      f.account ||
      f.verification ||
      f.completeness ||
      f.photo ||
      f.country ||
      f.city,
  );
}

/**
 * Construit une querystring `/admin/members?...` à partir des filtres courants,
 * en appliquant un `patch`. Tout changement de filtre RÉINITIALISE la page à 1,
 * sauf si `patch.page` est fourni explicitement (navigation de pagination).
 */
export function buildMembersQuery(
  current: MembersFilters,
  patch: Partial<MembersFilters> = {},
): string {
  const next: MembersFilters = { ...current, ...patch };
  const params = new URLSearchParams();

  if (next.search) params.set("q", next.search);
  if (next.account) params.set("account", next.account);
  if (next.verification) params.set("verification", next.verification);
  if (next.completeness) params.set("completeness", next.completeness);
  if (next.photo) params.set("photo", next.photo);
  if (next.country) params.set("country", next.country);
  if (next.city) params.set("city", next.city);
  if (next.sort && next.sort !== "recent") params.set("sort", next.sort);

  const page = patch.page ?? (Object.keys(patch).length > 0 ? 1 : next.page);
  if (page > 1) params.set("page", String(page));

  const qs = params.toString();
  return qs ? `/admin/members?${qs}` : "/admin/members";
}

/**
 * Bascule d'un filtre « chip » : cliquer la valeur active la retire (toggle).
 * Renvoie l'URL cible. Réinitialise toujours la page à 1.
 */
export function toggleMemberFilterQuery<K extends keyof MembersFilters>(
  current: MembersFilters,
  key: K,
  value: MembersFilters[K],
): string {
  const isActive = current[key] === value;
  const patch: Partial<MembersFilters> = { page: 1 };
  // Clé dynamique : on bascule la valeur (retire si déjà active).
  (patch as Record<string, unknown>)[key] = isActive ? null : value;
  return buildMembersQuery(current, patch);
}
