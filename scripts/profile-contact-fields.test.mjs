/**
 * Contrôles structurels : nom de famille et numéro WhatsApp — champs de
 * contact PRIVÉS, saisis par le membre, jamais exposés publiquement.
 * `node --test scripts/profile-contact-fields.test.mjs`
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [
  migration,
  types,
  profilePage,
  adminMemberPage,
  publicShare,
  publicPromotion,
  publicShowcase,
] = await Promise.all([
  readFile(
    "supabase/migrations/20260802090000_add_profile_last_name_and_whatsapp.sql",
    "utf8",
  ),
  readFile("src/lib/types/database.ts", "utf8"),
  readFile("src/app/(member)/profile/page.tsx", "utf8"),
  readFile("src/app/admin/members/[profileId]/page.tsx", "utf8"),
  readFile("src/lib/server/public-profile-share.ts", "utf8"),
  readFile("src/lib/server/public-profile-promotion.ts", "utf8"),
  readFile("src/lib/server/public-candidate-showcase.ts", "utf8"),
]);

test("la migration est additive et n'écrit aucune donnée", () => {
  assert.match(migration, /add column if not exists last_name text/);
  assert.match(migration, /add column if not exists whatsapp_phone text/);
  // Aucun backfill, aucune écriture.
  assert.doesNotMatch(migration, /\bupdate\s+public\.profiles\b/i);
  assert.doesNotMatch(migration, /\binsert\s+into\b/i);
  assert.doesNotMatch(migration, /\bdelete\s+from\b/i);
});

test("les contraintes de format autorisent toujours NULL", () => {
  assert.match(migration, /last_name is null\s*\n?\s*or char_length/);
  assert.match(migration, /whatsapp_phone is null/);
  assert.match(migration, /between 2 and 100/);
  assert.match(migration, /\^\\\+\?\[0-9\]\{8,15\}\$/);
});

test("les colonnes portent une note de confidentialité en base", () => {
  assert.match(migration, /comment on column public\.profiles\.last_name/);
  assert.match(migration, /comment on column public\.profiles\.whatsapp_phone/);
  assert.match(migration, /jamais/i);
});

test("les types exposent les deux champs en lecture et en écriture membre", () => {
  assert.match(types, /last_name: string \| null;/);
  assert.match(types, /whatsapp_phone: string \| null;/);
  assert.match(types, /last_name\?: string \| null;/);
  assert.match(types, /whatsapp_phone\?: string \| null;/);
});

test("le formulaire valide avant tout appel Supabase, sur les mêmes bornes", () => {
  assert.match(profilePage, /const LAST_NAME_MIN = 2/);
  assert.match(profilePage, /const LAST_NAME_MAX = 100/);
  assert.match(profilePage, /const WHATSAPP_PATTERN = \/\^\\\+\?\[0-9\]\{8,15\}\$\//);
  assert.match(profilePage, /function normalizeWhatsApp/);
  assert.match(profilePage, /!WHATSAPP_PATTERN\.test\(whatsapp\)/);
  // Facultatifs : une valeur vide reste acceptée et enregistrée en NULL.
  assert.match(profilePage, /last_name: lastName \|\| null/);
  assert.match(profilePage, /whatsapp_phone: whatsapp \|\| null/);
});

test("le membre voit clairement que ces champs restent privés", () => {
  assert.match(profilePage, /Jamais affiché publiquement/);
  assert.match(profilePage, /reste confidentiel/);
});

test("AUCUNE projection publique ne sélectionne ces colonnes", () => {
  for (const [name, source] of [
    ["partage /p", publicShare],
    ["promotion /promo", publicPromotion],
    ["vitrine /candidats", publicShowcase],
  ]) {
    assert.doesNotMatch(
      source,
      /last_name/,
      `fuite du nom dans ${name}`,
    );
    // La donnée sensible est la COLONNE whatsapp_phone (le numéro du membre).
    // Le mot « whatsapp » seul est légitime ailleurs : canal de diffusion des
    // liens de promotion (PR #101) — l'ancienne assertion /whatsapp/i était
    // rouge à tort depuis cette PR.
    assert.doesNotMatch(
      source,
      /whatsapp_phone/i,
      `fuite du numéro dans ${name}`,
    );
  }
});

test("le back-office affiche les deux champs pour le suivi des membres", () => {
  assert.match(adminMemberPage, /label="Nom" value=\{profile\.last_name/);
  assert.match(adminMemberPage, /label="WhatsApp"/);
});

test("l'email du compte est affiché en lecture seule, sans duplication en base", () => {
  // Valeur lue depuis la session Auth, jamais depuis `profiles`.
  assert.match(profilePage, /setAccountEmail\(user\.email \?\? null\)/);
  assert.match(profilePage, /value=\{accountEmail \?\? ""\}/);
  assert.match(profilePage, /id="account_email"/);
  assert.match(profilePage, /readOnly/);
  // Aucune colonne email ajoutée au PROFIL, aucun envoi dans l'upsert.
  // L'assertion est bornée aux types du profil : les types admin portent
  // légitimement l'email joint côté serveur (AdminMemberListItem — RPC
  // admin_list_members, service_role). L'ancienne version balayait tout le
  // fichier et était rouge à tort.
  assert.doesNotMatch(profilePage, /account_email:/);
  const profileTypes = types.slice(
    types.indexOf("export type ProfileRow"),
    types.indexOf("export type PhotoRow"),
  );
  assert.doesNotMatch(profileTypes, /^\s*email\??: string \| null;/m);
});
