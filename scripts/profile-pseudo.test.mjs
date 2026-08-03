/**
 * Contrôles structurels : pseudo affiché (§5.4) — le pseudo remplace le
 * prénom PARTOUT où un autre membre ou le public le voit, avec repli sur le
 * prénom ; l'administration continue de voir la véritable identité.
 * `node --test scripts/profile-pseudo.test.mjs`
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [migration, types, profilePage, shareLib, promoLib, adminDetail] =
  await Promise.all([
    readFile(
      "supabase/migrations/20260803210000_add_profile_pseudo_display.sql",
      "utf8",
    ),
    readFile("src/lib/types/database.ts", "utf8"),
    readFile("src/app/(member)/profile/page.tsx", "utf8"),
    readFile("src/lib/server/public-profile-share.ts", "utf8"),
    readFile("src/lib/server/public-profile-promotion.ts", "utf8"),
    readFile("src/app/admin/members/[profileId]/page.tsx", "utf8"),
  ]);

test("la migration ajoute la colonne avec son CHECK 2..30, sans toucher aux ACL", () => {
  assert.match(migration, /add column if not exists pseudo text/);
  assert.match(migration, /profiles_pseudo_len/);
  assert.match(migration, /char_length\(btrim\(pseudo\)\) between 2 and 30/);
  // CREATE OR REPLACE conserve les privilèges : aucun grant/revoke ici.
  assert.doesNotMatch(migration, /^\s*(grant|revoke)\s/im);
});

test("les QUATRE fonctions de projection sont remplacées avec le repli pseudo", () => {
  for (const fn of [
    "discover_candidates",
    "list_my_relationships",
    "get_public_candidate_showcase",
    "list_public_candidate_showcases",
  ]) {
    assert.match(
      migration,
      new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}`),
      `fonction non remplacée : ${fn}`,
    );
  }
  const replis = migration.match(/coalesce\(\s*\n?\s*nullif\(/g) ?? [];
  assert.ok(
    replis.length >= 4,
    "chaque fonction doit porter l'expression coalesce(nullif(btrim(pseudo)...)",
  );
});

test("les signatures de sortie sont conservées (zéro changement client)", () => {
  // Le champ de sortie garde son nom `first_name` dans les quatre fonctions.
  const returns = migration.match(/RETURNS TABLE\([^)]*first_name text/g) ?? [];
  assert.equal(returns.length, 4, "les 4 RETURNS TABLE gardent first_name");
});

test("les types déclarent le pseudo (Row + Insert)", () => {
  assert.match(types, /pseudo: string \| null;/);
  assert.match(types, /pseudo\?: string \| null;/);
});

test("/profile collecte le pseudo comme last_name : état, relecture, payload", () => {
  assert.match(profilePage, /pseudo: string;/);
  assert.match(profilePage, /pseudo: profile\.pseudo \?\? ""/);
  assert.match(profilePage, /pseudo: pseudo \|\| null/);
  assert.match(profilePage, /const PSEUDO_MIN = 2/);
  assert.match(profilePage, /const PSEUDO_MAX = 30/);
  assert.match(profilePage, /id="pseudo"/);
  // Le membre est informé de l'effet du pseudo.
  assert.match(profilePage, /remplace votre\s*\n?\s*prénom/);
});

test("les projections serveur /p et /promo replient pseudo → prénom", () => {
  for (const [name, src] of [
    ["public-profile-share", shareLib],
    ["public-profile-promotion", promoLib],
  ]) {
    assert.match(src, /"pseudo, first_name, /, `${name} : pseudo absent du select`);
    assert.match(
      src,
      /profile\.pseudo\?\.trim\(\) \|\| profile\.first_name\?\.trim\(\) \|\| null/,
      `${name} : repli pseudo → prénom absent`,
    );
  }
});

test("l'administration continue de voir la véritable identité", () => {
  // La fiche membre admin affiche prénom et nom réels, jamais le pseudo à
  // leur place.
  assert.match(adminDetail, /profile\.first_name/);
  assert.match(adminDetail, /profile\.last_name/);
  assert.doesNotMatch(adminDetail, /profile\.pseudo/);
});
