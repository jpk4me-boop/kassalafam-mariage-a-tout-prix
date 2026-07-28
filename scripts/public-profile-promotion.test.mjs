/**
 * Contrôles structurels de la route publique promotionnelle.
 * `node --test scripts/public-profile-promotion.test.mjs`
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const PAGE_PATH = "src/app/promo/[token]/page.tsx";
const PHOTO_ROUTE_PATH = "src/app/promo/[token]/photo/route.ts";
const HELPER_PATH = "src/lib/server/public-profile-promotion.ts";
const BACKEND_PATH = "src/lib/server/profile-promotion-share-links.ts";

const [page, photoRoute, helper, backend] = await Promise.all([
  readFile(PAGE_PATH, "utf8"),
  readFile(PHOTO_ROUTE_PATH, "utf8"),
  readFile(HELPER_PATH, "utf8"),
  readFile(BACKEND_PATH, "utf8"),
]);

test("la page reste dynamique et non indexable", () => {
  assert.match(page, /export const dynamic = "force-dynamic"/);
  assert.match(page, /robots: \{ index: false, follow: false, noarchive: true \}/);
  assert.match(page, /referrer: "no-referrer"/);
});

test("les métadonnées sociales utilisent la route photo contrôlée", () => {
  assert.match(page, /generateMetadata/);
  assert.match(page, /openGraph:/);
  assert.match(page, /twitter:/);
  assert.match(page, /const photoUrl = `\$\{pageUrl\}\/photo`/);
});

test("la page ne crée aucun client privilégié", () => {
  assert.doesNotMatch(page, /createAdminClient/);
  assert.doesNotMatch(page, /service_role/);
  assert.doesNotMatch(page, /"use client"/);
});

test("la page renvoie un 404 uniforme pour tout jeton invalide", () => {
  assert.match(page, /if \(!token\) notFound\(\)/);
  assert.match(page, /if \(!profile\) notFound\(\)/);
});

test("le helper passe uniquement par la RPC de résolution sécurisée", () => {
  assert.match(helper, /resolveProfilePromotionShareToken\(token\)/);
  assert.match(backend, /resolve_profile_promotion_share_link/);
});

test("la photo choisie dans le consentement est utilisée exactement", () => {
  assert.match(helper, /\.eq\("id", resolved\.photo_id\)/);
  assert.match(helper, /\.eq\("profile_id", resolved\.profile_id\)/);
  assert.doesNotMatch(helper, /\.eq\("is_primary", true\)/);
});

test("le helper valide le dossier, le type MIME et la taille", () => {
  assert.match(helper, /startsWith\(`\$\{profileId\}\/`\)/);
  assert.match(helper, /ALLOWED_PHOTO_MIME_TYPES\.has/);
  assert.match(helper, /photo\.size_bytes >= 1/);
  assert.match(helper, /photo\.size_bytes <= MAX_PHOTO_BYTES/);
});

test("aucune URL signée ou redirection Storage n'est créée", () => {
  assert.doesNotMatch(helper, /createSignedUrl/);
  assert.doesNotMatch(helper, /getPublicUrl/);
  assert.doesNotMatch(photoRoute, /redirect\(/);
  assert.match(helper, /\.download\(photo\.storage_path\)/);
});

test("la route photo est sans cache, non indexable et tolère les crawlers sociaux", () => {
  assert.match(photoRoute, /"Cache-Control": "no-store, max-age=0"/);
  assert.match(photoRoute, /"X-Robots-Tag": "noindex, nofollow, noarchive"/);
  assert.match(photoRoute, /"Cross-Origin-Resource-Policy": "cross-origin"/);
});

test("aucune interface administrateur n'est ajoutée par ce lot", () => {
  assert.doesNotMatch(page, /\/admin\/members/);
  assert.doesNotMatch(page, /createProfilePromotionShareLink/);
  assert.doesNotMatch(page, /revokeProfilePromotionShareLink/);
});