/**
 * Contrôles structurels — Lot J : diagnostiquer un échec de paiement.
 * `node --test scripts/sebpay-observability.test.mjs`
 *
 * Constat à l'origine du lot (12/08/2026, paiement pilote réel) : la route
 * `/api/premium/subscribe` a rendu 502 « provider_unavailable ». Aucun journal.
 * Deux pertes d'information s'étaient additionnées — le transport jetait le
 * statut HTTP du fournisseur dès la réponse, et le `catch` de la chaîne
 * d'encaissement avalait l'erreur sans un mot. Résultat : clés refusées,
 * allowlist IP, référence inconnue et panne du fournisseur — quatre causes,
 * quatre correctifs différents — étaient rigoureusement indiscernables.
 *
 * Ce que la suite verrouille :
 *   1. le statut HTTP du fournisseur survit à l'échec, porté par l'erreur ;
 *   2. le corps de la réponse n'est TOUJOURS pas lu — on gagne en diagnostic
 *      sans rien concéder sur la confidentialité ;
 *   3. les trois frontières d'appel journalisent, et ne journalisent QUE
 *      l'étape, le code et le statut ;
 *   4. aucun secret ni donnée de membre n'entre dans le journal ;
 *   5. la réconciliation a enfin un plafond d'âge ;
 *   6. la page Premium cesse de promettre qu'aucun numéro n'est demandé
 *      pendant qu'un formulaire en demande un.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const lire = async (chemin) => readFile(chemin, "utf8");

const fondation = await lire("src/lib/server/sebpay/foundation-core.ts");
const journal = await lire("src/lib/server/sebpay/observability.ts");
const index = await lire("src/lib/server/sebpay/index.ts");
const souscription = await lire("src/app/api/premium/subscribe/route.ts");
const cron = await lire("src/app/api/cron/reconcile-sebpay/route.ts");
const experience = await lire("src/components/member/premium-experience.tsx");
const pagePremium = await lire("src/app/(member)/premium/page.tsx");

test("l'erreur de fondation transporte le statut HTTP du fournisseur", () => {
  assert.match(fondation, /readonly httpStatus: number \| null;/);
  assert.match(fondation, /httpStatus: number \| null = null,/);
  assert.match(fondation, /this\.httpStatus = httpStatus;/);
});

test("un statut non-2xx est transmis, et le corps reste non lu", () => {
  const bloc = fondation.slice(
    fondation.indexOf("if (!response.ok) {"),
    fondation.indexOf("const contentType = response.headers.get"),
  );

  assert.ok(bloc.length > 0, "la branche non-2xx existe");
  assert.match(bloc, /cancelResponseBodySilently\(response\)/);
  assert.match(bloc, /response\.status,/);
  // Ce qui aurait été le raccourci facile, et une fuite : lire le corps.
  assert.doesNotMatch(bloc, /await response\.(text|json)\(\)/);
});

test("le journal n'écrit que l'étape, le code et le statut", () => {
  assert.match(journal, /export function logSebPayFailure\(/);
  assert.match(journal, /stage: string, error: unknown/);
  assert.match(
    journal,
    /\[sebpay\] \$\{stage\} failed code=\$\{code\} providerHttpStatus=\$\{status\}/,
  );
  // Une seule écriture de journal dans tout le module.
  assert.equal((journal.match(/console\./g) ?? []).length, 1);
});

test("rien de sensible ne peut entrer dans le journal", () => {
  for (const interdit of [
    "secretKey",
    "publicKey",
    "payerPhone",
    "headers",
    "body",
    "authHeaders",
    "idempotencyKey",
    "amountXaf",
  ]) {
    assert.doesNotMatch(
      journal,
      new RegExp(interdit),
      `le journal ne doit jamais toucher à « ${interdit} »`,
    );
  }
});

test("le journal est exporté par le module", () => {
  assert.match(index, /export \* from "\.\/observability\.ts";/);
});

test("les trois frontières d'appel journalisent leur échec", () => {
  assert.match(souscription, /logSebPayFailure\("collection", error\)/);
  assert.match(cron, /logSebPayFailure\("reconciliation", error\)/);
  assert.match(cron, /logSebPayFailure\("expiry-sweep", error\)/);
});

test("la souscription journalise SANS changer ce que voit le membre", () => {
  // L'erreur est relancée : `handleSebPayCheckout` rend toujours 502 sans
  // détail. Le diagnostic est pour l'exploitation, pas pour la page.
  const bloc = souscription.slice(
    souscription.indexOf("try {\n        return await provider.initiateCollection"),
    souscription.indexOf("applyUpdate:"),
  );

  assert.match(bloc, /throw error;/);
  assert.doesNotMatch(bloc, /NextResponse/);
});

test("la réconciliation a enfin un plafond d'âge", () => {
  // Sans borne haute, une transaction que SebPay n'a jamais connue est
  // reprise à chaque passage : `failures` ne redescend jamais à zéro et le
  // cron cesse d'être un signal.
  assert.match(cron, /const RECONCILE_MAX_AGE_MS = 7 \* 24 \* 60 \* 60 \* 1000;/);
  assert.match(cron, /\.lt\("requested_at", cutoff\)/);
  assert.match(cron, /\.gt\("requested_at", floor\)/);
});

test("la page Premium ne promet plus le contraire de ce qu'elle fait", () => {
  // La phrase reste — elle est vraie tant que les paiements sont fermés. Ce
  // qui doit disparaître, c'est qu'elle s'affiche INCONDITIONNELLEMENT : elle
  // n'existe plus qu'une fois, dans la branche « fermé » du ternaire.
  const occurrences =
    experience.match(/Aucun numéro de téléphone, aucun opérateur/g) ?? [];
  assert.equal(occurrences.length, 1);

  assert.match(experience, /const paymentPrivacyNote = paymentsOpen/);
  assert.match(
    experience,
    /: "Aucun numéro de téléphone, aucun opérateur et aucun montant ne sont demandés sur cette version de la page\.";/,
  );
  assert.match(experience, /\{paymentPrivacyNote\}/);

  // Et l'état ouvert dit la vérité opposée, sans la contredire.
  assert.match(
    experience,
    /Ton numéro est transmis une seule fois à SebPay[^"]*jamais conservé par KASSALAFAM\./,
  );
});

test("les badges des passerelles suivent l'état réel des paiements", () => {
  assert.match(experience, /const mobileMoneyBadge = !paymentsOpen/);
  assert.match(experience, /"Bientôt disponible"/);
  assert.match(experience, /"Phase pilote"/);
  assert.match(experience, /"Disponible"/);
  // Les deux lignes Mobile Money sont pilotées, plus écrites en dur.
  assert.equal((experience.match(/\{mobileMoneyBadge\}/g) ?? []).length, 2);
  assert.equal((experience.match(/\{mobileMoneyNote\}/g) ?? []).length, 2);
});

test("le mode pilote descend du serveur, jamais du client", () => {
  assert.match(pagePremium, /config\.pilotMode/);
  assert.match(pagePremium, /pilotMode=\{pilotMode\}/);
  // Repli prudent : une configuration illisible ferme tout.
  assert.match(
    pagePremium,
    /return \{ paymentsOpen: false, pilotMode: false \};/,
  );
  assert.match(experience, /pilotMode = false,/);
});
