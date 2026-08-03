/**
 * Contrôles structurels et fonctionnels : envoi WhatsApp assisté (back-office).
 * `node --test scripts/admin-whatsapp-quick-send.test.mjs`
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [helper, page, nav, pkg] = await Promise.all([
  readFile("src/lib/admin/whatsapp-quick-send.ts", "utf8"),
  readFile("src/app/admin/notifications/page.tsx", "utf8"),
  readFile("src/components/admin/admin-nav.tsx", "utf8"),
  readFile("package.json", "utf8"),
]);

test("aucune dépendance à Meta : ni API, ni jeton, ni variable", () => {
  for (const source of [helper, page]) {
    assert.doesNotMatch(source, /graph\.facebook\.com/);
    assert.doesNotMatch(source, /WHATSAPP_ACCESS_TOKEN|PHONE_NUMBER_ID/);
    assert.doesNotMatch(source, /\bfetch\s*\(/);
  }
  // Le seul lien sortant est le lien public wa.me.
  assert.match(helper, /https:\/\/wa\.me\//);
});

test("le message ne divulgue jamais le contenu ni l'identité d'un autre membre", () => {
  // Les phrases sont FIXES : aucune interpolation de contenu ou de tiers.
  assert.doesNotMatch(helper, /content|sender|related_profile/i);
  // Seul le prénom DU DESTINATAIRE est utilisé.
  assert.match(helper, /firstName/);
  // Le lien pointe toujours vers /login, jamais une ressource privée.
  assert.match(helper, /const LOGIN_URL = "https:\/\/kassalafam\.com\/login"/);
});

test("la page est un Server Component gardé par requireAdmin", () => {
  assert.doesNotMatch(page, /"use client"/);
  assert.match(page, /requireAdmin\("\/admin\/notifications"\)/);
  assert.match(page, /createAdminClient/);
  assert.match(page, /export const dynamic = "force-dynamic"/);
});

test("le ciblage : non lues, types couverts, comptes actifs seulement", () => {
  assert.match(page, /\.is\("read_at", null\)/);
  assert.match(page, /QUICK_SEND_EVENT_LABELS/);
  assert.match(page, /\.eq\("account_status", "active"\)/);
  // Lecture groupée : un seul SELECT profils pour tous les ids.
  assert.match(page, /\.in\("id", ids\)/);
});

test("la page n'envoie RIEN : elle prépare seulement un lien", () => {
  assert.match(page, /Aucun envoi automatique/);
  assert.match(page, /target="_blank"/);
  // Aucune Server Action, aucune écriture.
  assert.doesNotMatch(page, /"use server"/);
  assert.doesNotMatch(page, /\.insert\(|\.update\(|\.upsert\(/);
});

test("la navigation back-office expose « À prévenir » ET « Relance »", () => {
  assert.match(nav, /href: "\/admin\/notifications"/);
  assert.match(nav, /label: "À prévenir"/);
  assert.match(nav, /href: "\/admin\/relance"/);
  assert.match(nav, /label: "Relance"/);
});

test("le script de test est déclaré dans package.json", () => {
  assert.match(
    pkg,
    /"test:admin-whatsapp-quick-send": "node --test scripts\/admin-whatsapp-quick-send\.test\.mjs"/,
  );
});

// --- Contrôles fonctionnels du helper (logique pure, exécutée) -------------

/**
 * Charge le helper TypeScript en évaluant ses fonctions pures. Le module n'a
 * AUCUN import (contrainte assumée) : retirer les annotations de type suffit
 * à l'exécuter dans node:test, sans build TypeScript.
 */
const TYPE_ANNOTATION =
  /:\s*(Record<[^>]*>|readonly\s+string\[\]|string(\s*\|\s*(null|undefined))*)/g;

function loadHelper() {
  const js = helper
    .replace(/export (const|function)/g, "$1")
    .replace(TYPE_ANNOTATION, "");
  return new Function(
    `${js}; return { buildQuickSendMessage, buildQuickSendUrl, quickSendEventLabel };`,
  )();
}

test("un seul type d'événement → phrase dédiée avec le prénom", () => {
  const { buildQuickSendMessage } = loadHelper();
  const msg = buildQuickSendMessage("Estelle", ["new_message"]);
  assert.match(msg, /^Bonjour Estelle,/);
  assert.match(msg, /nouveau message/);
  assert.match(msg, /https:\/\/kassalafam\.com\/login$/);
});

test("plusieurs types → phrase générique, aucun détail accumulé", () => {
  const { buildQuickSendMessage } = loadHelper();
  const msg = buildQuickSendMessage("Carina", ["new_message", "new_interest"]);
  assert.match(msg, /du nouveau sur KASSALAFAM/);
  assert.doesNotMatch(msg, /nouveau message/);
});

test("prénom absent → salutation neutre, jamais de placeholder", () => {
  const { buildQuickSendMessage } = loadHelper();
  const msg = buildQuickSendMessage(null, ["new_interest"]);
  assert.match(msg, /^Bonjour, /);
  assert.doesNotMatch(msg, /null|undefined/);
});

test("le lien wa.me normalise le numéro et encode le message", () => {
  const { buildQuickSendUrl } = loadHelper();
  const url = buildQuickSendUrl("+237 670 00 00 01", "Bonjour, à bientôt !");
  assert.match(url, /^https:\/\/wa\.me\/237670000001\?text=/);
  // Espaces et accents encodés : le message arrive intact dans WhatsApp.
  // (`!` reste tel quel — encodeURIComponent le laisse, et c'est sans risque
  // dans une chaîne de requête.)
  const query = url.split("?text=")[1];
  assert.doesNotMatch(query, /[ àéô]/);
  assert.match(query, /%20/);
  assert.match(query, /%C3%A0/);
});

test("numéro absent ou trop court → aucun lien (aucun bouton affiché)", () => {
  const { buildQuickSendUrl } = loadHelper();
  assert.equal(buildQuickSendUrl(null, "test"), null);
  assert.equal(buildQuickSendUrl("", "test"), null);
  assert.equal(buildQuickSendUrl("12345", "test"), null);
});
