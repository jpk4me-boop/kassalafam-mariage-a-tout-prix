/**
 * Contrôles structurels — Lot I : balayage des abonnements Premium échus.
 * `node --test scripts/premium-expiry-sweep.test.mjs`
 *
 * Constat à l'origine du lot : `expire_due_premium_subscriptions` existait en
 * base sans AUCUN appelant — ni cron Vercel, ni pg_cron (extension absente).
 *
 * Ce que la suite verrouille :
 *   1. le balayage est bien déclenché par le cron quotidien ;
 *   2. il tourne AVANT toute considération SebPay — un abonnement accordé à la
 *      main doit expirer même quand les paiements sont fermés ;
 *   3. un échec du balayage n'empêche pas la réconciliation, et inversement ;
 *   4. le cron reste protégé par CRON_SECRET ;
 *   5. le nombre traité est rendu dans la réponse, sur TOUS les chemins de
 *      sortie — sans quoi on ne saurait pas si le balayage a tourné.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const lire = async (chemin) => readFile(chemin, "utf8");

const route = await lire("src/app/api/cron/reconcile-sebpay/route.ts");
const vercel = JSON.parse(await lire("vercel.json"));

test("le cron quotidien existe et pointe la bonne route", () => {
  const taches = vercel.crons ?? [];
  const reconcile = taches.find((t) => t.path === "/api/cron/reconcile-sebpay");
  assert.ok(reconcile, "la tâche de réconciliation est déclarée");
  assert.match(reconcile.schedule, /^\d+ \d+ \* \* \*$/, "une fois par jour");
});

test("le balayage des abonnements échus est appelé", () => {
  assert.match(route, /rpc\(\s*\n?\s*"expire_due_premium_subscriptions"/);
  assert.match(route, /p_limit: EXPIRY_BATCH_SIZE/);
});

test("il tourne AVANT SebPay : un octroi manuel expire aussi", () => {
  const appelBalayage = route.indexOf("await expirerAbonnementsEchus()");
  const creationProvider = route.indexOf("provider = createSebPayProvider()");

  assert.ok(appelBalayage > 0 && creationProvider > 0);
  assert.ok(
    appelBalayage < creationProvider,
    "le balayage doit précéder la création du fournisseur de paiement",
  );
});

test("un échec du balayage n'interrompt pas la réconciliation", () => {
  assert.match(route, /Promise<number \| null>/);
  assert.match(route, /catch \{\s*\n\s*return null;/);
});

test("le cron reste protégé", () => {
  assert.match(route, /process\.env\.CRON_SECRET/);
  assert.match(route, /`Bearer \$\{secret\}`/);
  assert.match(route, /status: 401/);
});

test("le nombre d'abonnements expirés est rendu sur tous les chemins", () => {
  const sorties = route.match(/NextResponse\.json\(\{[\s\S]{0,200}?\}/g) ?? [];
  // Les deux premières sorties précèdent le balayage (secret absent, 401).
  const apresBalayage = sorties.slice(2);
  assert.ok(apresBalayage.length >= 3);
  for (const sortie of apresBalayage) {
    assert.match(sortie, /expired/);
  }
});
