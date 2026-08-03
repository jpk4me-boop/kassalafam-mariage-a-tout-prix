/**
 * Contrôles structurels : numéro WhatsApp obligatoire à l'inscription +
 * consentement automatique (migration 20260803230000).
 * `node --test scripts/whatsapp-mandatory.test.mjs`
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [migration, completion, options, form, genderStep, wizard, card, profilePage, pkg] =
  await Promise.all([
    readFile(
      "supabase/migrations/20260803230000_whatsapp_mandatory_and_auto_consent.sql",
      "utf8",
    ),
    readFile("src/lib/onboarding/completion.ts", "utf8"),
    readFile("src/lib/onboarding/options.ts", "utf8"),
    readFile("src/lib/onboarding/form.ts", "utf8"),
    readFile("src/components/onboarding/steps/gender-step.tsx", "utf8"),
    readFile("src/components/onboarding/onboarding-wizard.tsx", "utf8"),
    readFile("src/components/member/whatsapp-notifications-card.tsx", "utf8"),
    readFile("src/app/(member)/profile/page.tsx", "utf8"),
    readFile("package.json", "utf8"),
  ]);

test("la migration n'écrit aucune donnée et n'ajoute aucune colonne", () => {
  assert.doesNotMatch(migration, /add column/i);
  // On teste le SQL exécuté PAR la migration, hors corps de fonction : les
  // `update` qui figurent dans le corps des RPC/triggers ne s'exécutent qu'à
  // l'appel, jamais à l'application de la migration.
  const applied = migration.replace(/\$\$[\s\S]*?\$\$/g, "");
  assert.doesNotMatch(applied, /\binsert\s+into\b/i);
  assert.doesNotMatch(applied, /\bupdate\s+public\./i);
  assert.doesNotMatch(applied, /\bdelete\s+from\b/i);
});

test("le numéro devient une exigence du parcours, des DEUX côtés", () => {
  // Serveur : prédicat + RPC de finalisation, erreur stable dédiée.
  assert.match(
    migration,
    /and coalesce\(pg_catalog\.btrim\(p_profile\.whatsapp_phone\), ''\) <> ''/,
  );
  assert.match(migration, /ONBOARDING_INCOMPLETE_WHATSAPP/);
  // Application : miroir dans la source de vérité de complétude.
  assert.match(completion, /isFilled\(profile\.whatsapp_phone\)/);
  assert.match(completion, /"whatsapp_phone"/);
  assert.match(completion, /whatsapp_phone";?$/m);
});

test("les profils déjà finalisés ne sont JAMAIS re-bloqués", () => {
  // L'idempotence de la RPC est conservée telle quelle.
  assert.match(
    migration,
    /if v_profile\.onboarding_completed_at is not null then\s*\n\s*return v_profile\.onboarding_completed_at;/,
  );
});

test("le consentement est posé AUTOMATIQUEMENT à l'enregistrement du numéro", () => {
  assert.match(migration, /create or replace function public\.auto_grant_whatsapp_consent/);
  assert.match(migration, /after insert or update of whatsapp_phone on public\.profiles/);
  assert.match(migration, /security definer/);
  // Un retrait explicite n'est jamais annulé.
  assert.match(migration, /on conflict \(profile_id, channel\) do nothing/);
});

test("le motif et la normalisation vivent dans options.ts, importés partout", () => {
  assert.match(options, /export const WHATSAPP_PATTERN/);
  assert.match(options, /export function normalizeWhatsApp/);
  // Ni le wizard ni /profile ne les redéfinissent.
  assert.doesNotMatch(wizard, /const WHATSAPP_PATTERN =/);
  assert.doesNotMatch(profilePage, /const WHATSAPP_PATTERN =/);
  assert.doesNotMatch(profilePage, /function normalizeWhatsApp/);
  assert.match(wizard, /WHATSAPP_PATTERN/);
  assert.match(profilePage, /WHATSAPP_PATTERN/);
});

test("le champ est collecté à l'étape 2, avec sa raison d'être", () => {
  assert.match(form, /whatsapp_phone: string;/);
  assert.match(form, /whatsapp_phone: p\.whatsapp_phone \?\? ""/);
  assert.match(genderStep, /id="onboarding_whatsapp"/);
  assert.match(genderStep, /nous vous préviendrons/);
  // Jamais public.
  assert.match(genderStep, /jamais affiché aux autres membres/);
  // Validation bloquante + enregistrement normalisé.
  assert.match(wizard, /WHATSAPP_PATTERN\.test\(whatsapp\)/);
  assert.match(wizard, /whatsapp_phone: normalizeWhatsApp/);
});

test("la carte /profile ne demande plus d'autorisation : elle informe", () => {
  // Plus de bouton d'activation initiale.
  assert.doesNotMatch(card, /J’autorise les notifications WhatsApp/);
  assert.match(card, /Vous êtes prévenu sur WhatsApp/);
  // Le moyen d'arrêter subsiste (protection du canal), discret.
  assert.match(card, /Ne plus recevoir ces messages/);
  assert.match(card, /Les réactiver/);
  assert.match(card, /withdraw_my_whatsapp_notifications/);
  // La base reste l'autorité.
  assert.match(card, /const fresh = await fetchWhatsappState\(\)/);
});

test("un profil finalisé ne peut plus vider son numéro", () => {
  assert.match(profilePage, /onboardingDone && whatsapp === ""/);
});

test("le script de test est déclaré dans package.json", () => {
  assert.match(
    pkg,
    /"test:whatsapp-mandatory": "node --test scripts\/whatsapp-mandatory\.test\.mjs"/,
  );
});
