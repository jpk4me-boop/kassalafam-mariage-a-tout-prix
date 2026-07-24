import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "profile-photos";
const SLUG_PATTERN = /^[A-Za-z0-9_-]{22}$/;
const STORAGE_PATH_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[^/]+$/i;
const MAX_PHOTO_BYTES = 3_145_728;
const ALLOWED_PHOTO_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

type RpcError = { message?: string } | null;
type ServerRpcClient = {
  rpc: (
    functionName: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: RpcError }>;
};

export type PublicCandidateSummary = {
  slug: string;
  firstName: string;
  age: number;
  city: string;
  country: string;
  universe: string;
  maritalStatus: string;
  publishedAt: string;
  updatedAt: string;
};

export type PublicCandidateShowcase = PublicCandidateSummary & {
  intention: string;
  bio: string;
  expectations: string;
};

export type PublicCandidateSitemapItem = {
  slug: string;
  lastModified: string;
};

export type PublicCandidatePhoto = {
  body: ArrayBuffer;
  contentType: string;
};

type PublicCandidatePhotoMetadata = {
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function asInteger(value: unknown): number | null {
  const numberValue =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;

  return Number.isSafeInteger(numberValue) ? numberValue : null;
}

function asDateString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return Number.isNaN(Date.parse(value)) ? null : value;
}

function parseSummary(value: unknown): PublicCandidateSummary | null {
  const row = asRecord(value);
  if (!row) return null;

  const slug = asNonEmptyString(row.public_slug);
  const firstName = asNonEmptyString(row.first_name);
  const age = asInteger(row.age);
  const city = asNonEmptyString(row.city);
  const country = asNonEmptyString(row.country);
  const universe = asNonEmptyString(row.discovery_universe);
  const maritalStatus = asNonEmptyString(row.marital_status);
  const publishedAt = asDateString(row.published_at);
  const updatedAt = asDateString(row.updated_at);

  if (
    !slug ||
    !SLUG_PATTERN.test(slug) ||
    !firstName ||
    age == null ||
    age < 18 ||
    age > 120 ||
    !city ||
    !country ||
    !universe ||
    !maritalStatus ||
    !publishedAt ||
    !updatedAt
  ) {
    return null;
  }

  return {
    slug,
    firstName,
    age,
    city,
    country,
    universe,
    maritalStatus,
    publishedAt,
    updatedAt,
  };
}

function parseShowcase(value: unknown): PublicCandidateShowcase | null {
  const summary = parseSummary(value);
  const row = asRecord(value);
  if (!summary || !row) return null;

  const intention = asNonEmptyString(row.intention);
  const bio = asNonEmptyString(row.bio);
  const expectations = asNonEmptyString(row.partner_expectations);
  if (!intention || !bio || !expectations) return null;

  return { ...summary, intention, bio, expectations };
}

function parseSitemapItem(value: unknown): PublicCandidateSitemapItem | null {
  const row = asRecord(value);
  if (!row) return null;

  const slug = asNonEmptyString(row.public_slug);
  const lastModified = asDateString(row.last_modified);
  if (!slug || !SLUG_PATTERN.test(slug) || !lastModified) return null;

  return { slug, lastModified };
}

function parsePhotoMetadata(value: unknown): PublicCandidatePhotoMetadata | null {
  const row = asRecord(value);
  if (!row) return null;

  const storagePath = asNonEmptyString(row.storage_path);
  const mimeType = asNonEmptyString(row.mime_type);
  const sizeBytes = asInteger(row.size_bytes);

  if (
    !storagePath ||
    !STORAGE_PATH_PATTERN.test(storagePath) ||
    !mimeType ||
    !ALLOWED_PHOTO_MIME_TYPES.has(mimeType) ||
    sizeBytes == null ||
    sizeBytes < 1 ||
    sizeBytes > MAX_PHOTO_BYTES
  ) {
    return null;
  }

  return { storagePath, mimeType, sizeBytes };
}

async function callRows(
  client: ReturnType<typeof createAdminClient>,
  functionName: string,
  args?: Record<string, unknown>,
): Promise<unknown[] | null> {
  const rpcClient = client as unknown as ServerRpcClient;
  const { data, error } = await rpcClient.rpc(functionName, args);
  if (error || !Array.isArray(data)) return null;
  return data;
}

export function isPublicCandidateSlug(value: string): boolean {
  return SLUG_PATTERN.test(value);
}

/**
 * Liste fail-closed : tout incident RPC ou toute ligne inattendue est exclu de
 * la vitrine au lieu d'exposer une charge utile non validée.
 */
export async function listPublicCandidateShowcases(input?: {
  limit?: number;
  offset?: number;
}): Promise<PublicCandidateSummary[]> {
  const limit = Math.max(1, Math.min(input?.limit ?? 24, 48));
  const offset = Math.max(0, input?.offset ?? 0);
  const admin = createAdminClient();
  const rows = await callRows(admin, "list_public_candidate_showcases", {
    p_limit: limit,
    p_offset: offset,
  });

  if (!rows) return [];
  return rows
    .map(parseSummary)
    .filter((row): row is PublicCandidateSummary => row !== null);
}

/** Retourne null pour tout slug invalide, retiré, suspendu ou non publiable. */
export async function getPublicCandidateShowcase(
  slug: string,
): Promise<PublicCandidateShowcase | null> {
  if (!isPublicCandidateSlug(slug)) return null;

  const admin = createAdminClient();
  const rows = await callRows(admin, "get_public_candidate_showcase", {
    p_slug: slug,
  });

  return rows?.[0] ? parseShowcase(rows[0]) : null;
}

/**
 * Énumération minimale et fail-closed du sitemap. Aucun UUID ni autre donnée de
 * profil ne sort de cette fonction.
 */
export async function listPublicCandidateShowcaseSitemap(): Promise<
  PublicCandidateSitemapItem[]
> {
  const admin = createAdminClient();
  const rows = await callRows(admin, "list_public_candidate_showcase_sitemap");
  if (!rows) return [];

  return rows
    .map(parseSitemapItem)
    .filter((row): row is PublicCandidateSitemapItem => row !== null);
}

/**
 * Télécharge la photo sélectionnée côté serveur et ne retourne au Route Handler
 * que les octets et un Content-Type validé. Le storage_path ne quitte jamais ce
 * module server-only.
 */
export async function getPublicCandidateShowcasePhoto(
  slug: string,
): Promise<PublicCandidatePhoto | null> {
  if (!isPublicCandidateSlug(slug)) return null;

  const admin = createAdminClient();
  const rows = await callRows(admin, "get_public_candidate_showcase_photo", {
    p_slug: slug,
  });
  const metadata = rows?.[0] ? parsePhotoMetadata(rows[0]) : null;
  if (!metadata) return null;

  const { data: blob, error } = await admin.storage
    .from(BUCKET)
    .download(metadata.storagePath);

  if (error || !blob || blob.size < 1 || blob.size > MAX_PHOTO_BYTES) {
    return null;
  }

  return {
    body: await blob.arrayBuffer(),
    contentType: metadata.mimeType,
  };
}
