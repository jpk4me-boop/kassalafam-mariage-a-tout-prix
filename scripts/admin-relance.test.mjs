/**
 * Contrôles structurels : vue admin « Profils à relancer » (/admin/relance).
 * `node --test scripts/admin-relance.test.mjs`
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [page, helper, nav, pkg] = await Promise.all([
  readFile("src/app/admin/relance/page.tsx", "utf8"),
  readFile("src/lib/admin/relance.ts", "utf8"),
  readFile("src/components/admin/admin-nav.tsx", "utf8"),
  readFile("package.json", "utf8"),
]);

test("la page est un Server Component gardé par requireAdmin", () => {
  assert.doesNotMatch(page, /"use client"/);
  assert.match(page, /requireAdmin\("\/admin\/relance"\)/);
  assert.match(page, /createAdminClient/);
  assert.match(page, /export const dynamic = "force-dynamic"/);
});

test("le ciblage est le marqueur d'onboarding, jamais une règle recopiée", () => {
  assert.match(page, /\.is\("onboarding_completed_at", null\)/);
  // On ne relance jamais un compte suspendu.
  assert.match(page, /\.eq\("account_status", "active"\)/);
  // La sélection réutilise la liste de colonnes partagée du wizard.
  assert.match(page, /ONBOARDING_PROFILE_COLUMNS/);
});

test("le helper réutilise la source de vérité de complétude, sans duplication", () => {
  assert.match(helper, /computeStepCompletion/);
  assert.match(helper, /firstIncompleteStep/);
  assert.match(
    helper,
    /from "@\/lib\/onboarding\/completion"/,
    "les règles doivent venir de completion.ts",
  );
  // AUCUN test de champ profil en direct : la complétude n'est pas recopiée.
  assert.doesNotMatch(helper, /profile\.(first_name|birth_date|marital_status|bio)/);
});

test("les 8 étapes du parcours ont un libellé back-office", () => {
  for (const label of [
    "Source d’inscription",
    "Identité",
    "Date de naissance",
    "Situation & religion",
    "Profession & études",
    "Localisation",
    "Projet matrimonial",
    "Photos",
  ]) {
    assert.match(helper, new RegExp(label), `libellé manquant : ${label}`);
  }
});

test("le canal de contact privilégie WhatsApp puis replie sur l'email", () => {
  const waIndex = helper.indexOf('channel: "whatsapp"');
  const mailIndex = helper.indexOf('channel: "email"');
  assert.ok(waIndex >= 0 && mailIndex >= 0);
  assert.ok(waIndex < mailIndex, "WhatsApp doit être testé avant l'email");
  assert.match(helper, /wa\.me/);
  assert.match(helper, /mailto:/);
});

test("données complètes sans marqueur : reprise à l'étape 8 (miroir du wizard)", () => {
  assert.match(helper, /first \?\? ONBOARDING_TOTAL_STEPS/);
  assert.match(helper, /awaitingFinalSend: first === null/);
  assert.match(page, /Envoi final restant/);
});

test("les lectures groupées suivent le pattern de la liste des membres", () => {
  // Photo principale et activité : UN appel pour tous les ids de la liste.
  assert.match(page, /\.in\("profile_id", ids\)/);
  assert.match(page, /admin_get_member_activity/);
  // L'échec de la RPC d'activité reste non bloquant.
  assert.match(page, /catch \{\s*\n\s*\/\/ Colonne/);
});

test("la navigation back-office expose l'entrée Relance", () => {
  assert.match(nav, /href: "\/admin\/relance"/);
  assert.match(nav, /label: "Relance"/);
});

test("le script de test est déclaré dans package.json", () => {
  assert.match(
    pkg,
    /"test:admin-relance": "node --test scripts\/admin-relance\.test\.mjs"/,
  );
});
