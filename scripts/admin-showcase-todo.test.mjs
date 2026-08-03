/**
 * Contrôles structurels et fonctionnels : page admin « Vitrine ».
 * `node --test scripts/admin-showcase-todo.test.mjs`
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [migration, helper, page, nav, types, pkg] = await Promise.all([
  readFile(
    "supabase/migrations/20260803235000_admin_list_showcase_candidates.sql",
    "utf8",
  ),
  readFile("src/lib/admin/showcase-todo.ts", "utf8"),
  readFile("src/app/admin/vitrine/page.tsx", "utf8"),
  readFile("src/components/admin/admin-nav.tsx", "utf8"),
  readFile("src/lib/types/database.ts", "utf8"),
  readFile("package.json", "utf8"),
]);

test("la RPC est en LECTURE SEULE et n'écrit aucune donnée", () => {
  const applied = migration.replace(/\$\$[\s\S]*?\$\$/g, "");
  assert.doesNotMatch(applied, /\binsert\s+into\b/i);
  assert.doesNotMatch(applied, /\bupdate\s+public\./i);
  assert.doesNotMatch(applied, /\bdelete\s+from\b/i);
  assert.doesNotMatch(migration, /add column|create table/i);
  // Le corps lui-même est un simple SELECT.
  assert.match(migration, /language sql/);
  assert.match(migration, /stable/);
});

test("la RPC est réservée au service_role, jamais aux membres", () => {
  assert.match(migration, /revoke all on function public\.admin_list_showcase_candidates\(\) from anon/);
  assert.match(migration, /revoke all on function public\.admin_list_showcase_candidates\(\) from authenticated/);
  assert.match(migration, /grant execute on function public\.admin_list_showcase_candidates\(\) to service_role/);
  assert.doesNotMatch(migration, /grant execute[\s\S]*to authenticated/);
});

test("la règle d'éligibilité reste UNIQUE : la base décide", () => {
  // La RPC encapsule la fonction interne au lieu de recopier ses conditions.
  assert.match(migration, /public\.candidate_showcase_eligibility_reason\(/);
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = ''/);
  // Le helper d'affichage ne recalcule AUCUNE condition d'éligibilité.
  assert.doesNotMatch(helper, /blur_photos ===|has_primary_photo ===/);
  assert.doesNotMatch(helper, /verification_status|account_status/);
});

test("la page est un Server Component gardé, sans écriture", () => {
  assert.doesNotMatch(page, /"use client"/);
  assert.match(page, /requireAdmin\("\/admin\/vitrine"\)/);
  assert.match(page, /createAdminClient/);
  assert.match(page, /export const dynamic = "force-dynamic"/);
  assert.match(page, /admin\.rpc\("admin_list_showcase_candidates"\)/);
  assert.doesNotMatch(page, /"use server"/);
  assert.doesNotMatch(page, /\.insert\(|\.update\(|\.upsert\(/);
});

test("aucun envoi automatique : seulement un lien wa.me prérempli", () => {
  assert.doesNotMatch(page, /graph\.facebook\.com/);
  assert.doesNotMatch(helper, /graph\.facebook\.com/);
  assert.doesNotMatch(helper, /\bfetch\s*\(/);
  assert.match(helper, /https:\/\/wa\.me\//);
  assert.match(page, /target="_blank"/);
});

test("la navigation expose Vitrine, sans perdre les entrées existantes", () => {
  for (const href of [
    "/admin/vitrine",
    "/admin/notifications",
    "/admin/relance",
    "/admin/members",
    "/admin/verification",
    "/admin/reports",
    "/admin/audit",
  ]) {
    assert.match(nav, new RegExp(`href: "${href}"`), `entrée perdue : ${href}`);
  }
});

test("le type de la RPC est déclaré", () => {
  assert.match(types, /AdminShowcaseCandidateRow/);
  assert.match(types, /admin_list_showcase_candidates: \{/);
});

test("le script de test est déclaré dans package.json", () => {
  assert.match(
    pkg,
    /"test:admin-showcase-todo": "node --test scripts\/admin-showcase-todo\.test\.mjs"/,
  );
});

// --- Contrôles fonctionnels du helper (logique pure) ------------------------

const TYPE_ANNOTATION =
  /:\s*(Record<[^>]*>|ShowcaseGroupKey\[\]|ShowcaseGroupKey|boolean|string(\s*\|\s*(null|undefined))*)/g;

function loadHelper() {
  const js = helper
    .replace(/export type [\s\S]*?;\n/g, "")
    .replace(/export (const|function)/g, "$1")
    .replace(TYPE_ANNOTATION, "");
  return new Function(
    `${js}; return { showcaseGroupOf, buildShowcaseMessage, buildShowcaseWhatsappUrl };`,
  )();
}

test("le classement suit le motif renvoyé par la base", () => {
  const { showcaseGroupOf } = loadHelper();
  assert.equal(showcaseGroupOf("eligible", true), "published");
  assert.equal(showcaseGroupOf("eligible", false), "ready");
  assert.equal(showcaseGroupOf("consent_required", false), "consent_required");
  assert.equal(
    showcaseGroupOf("photo_privacy_enabled", false),
    "photo_privacy_enabled",
  );
  assert.equal(showcaseGroupOf("profile_incomplete", false), "profile_incomplete");
  // Motif inconnu : jamais d'erreur, groupe de repli.
  assert.equal(showcaseGroupOf("motif_futur", false), "other");
});

test("chaque message dit ce qu'il reste à faire, sans reproche", () => {
  const { buildShowcaseMessage } = loadHelper();
  const consent = buildShowcaseMessage("Carina", "consent_required");
  assert.match(consent, /^Bonjour Carina,/);
  assert.match(consent, /votre autorisation/);
  assert.match(consent, /https:\/\/kassalafam\.com\/login$/);

  const blur = buildShowcaseMessage("Pharell", "photo_privacy_enabled");
  assert.match(blur, /photos sont floutées/);

  // Prénom absent : salutation neutre, jamais de placeholder.
  const anon = buildShowcaseMessage(null, "ready");
  assert.match(anon, /^Bonjour, /);
  assert.doesNotMatch(anon, /null|undefined/);
});

test("le lien wa.me normalise le numéro, et disparaît s'il est inutilisable", () => {
  const { buildShowcaseWhatsappUrl } = loadHelper();
  const url = buildShowcaseWhatsappUrl("+237 670 00 00 01", "Bonjour à vous");
  assert.match(url, /^https:\/\/wa\.me\/237670000001\?text=/);
  assert.match(url.split("?text=")[1], /%20/);
  assert.equal(buildShowcaseWhatsappUrl(null, "test"), null);
  assert.equal(buildShowcaseWhatsappUrl("123", "test"), null);
});
