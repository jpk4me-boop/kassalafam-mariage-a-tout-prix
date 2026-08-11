/**
 * Contrôles structurels : refonte Farata de la page /premium (bandeau de
 * repères, badges Nouveau/Déjà actif, formule Recommandée, bandeau final
 * personnalisé). `node --test scripts/premium-page-uplift.test.mjs`
 *
 * Verrous : le bandeau ne contient QUE des faits vérifiables ; « Populaire »
 * est interdit (0 vente) ; exactement deux avantages « nouveau ».
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile("src/components/member/premium-experience.tsx", "utf8");
const code = page
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

test("bandeau de repères : trois faits VRAIS, aucun chiffre inventé", () => {
  assert.match(code, /1 par 1/);
  assert.match(code, /0 FCFA/);
  assert.match(code, /2 500 F\b/);
  assert.match(code, /profils vérifiés/);
  // Les mensonges du concurrent restent interdits.
  assert.doesNotMatch(code, /\b\dX\b/);
  assert.doesNotMatch(code, /\d{3}\s?000\s?\+/);
  assert.doesNotMatch(code, /100\s?%\s*(halal|garanti)/i);
});

test("exactement DEUX avantages « nouveau », rendus avec le badge vert", () => {
  const entries = [...code.matchAll(/badge: "nouveau"/g)];
  assert.equal(entries.length, 2);
  assert.match(code, /Vois qui est en ligne/);
  assert.match(code, /Messages vocaux/);
  assert.match(code, /bg-emerald-600[^"]*"[\s\S]{0,60}Nouveau/);
});

test("l'avantage-roi porte « Déjà actif » (seul avantage LIVRÉ en production)", () => {
  const idx = code.indexOf('title: "Échange de coordonnées WhatsApp"');
  const bloc = code.slice(idx, idx + 120);
  assert.match(bloc, /badge: "actif"/);
  assert.match(code, /Déjà actif/);
});

test("formule 1 mois « Recommandée » — jamais « Populaire » (0 vente)", () => {
  assert.match(code, /duration\.code === "premium_1_mois"[\s\S]{0,400}Recommandée/);
  assert.doesNotMatch(code, /Populaire/i);
});

test("bandeau final personnalisé par le prénom, avec repli neutre", () => {
  assert.match(code, /\$\{firstName\}, le bon moment pour préparer ton profil/);
  assert.match(code, /"Le bon moment pour préparer ton profil, c’est maintenant\."/);
});
