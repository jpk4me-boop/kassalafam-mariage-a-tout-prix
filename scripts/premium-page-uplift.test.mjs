/**
 * Contrôles structurels : refonte Farata de la page /premium (bandeau de
 * repères, badges Bientôt/Déjà actif, formule Recommandée, bandeau final
 * personnalisé). `node --test scripts/premium-page-uplift.test.mjs`
 *
 * Verrous : le bandeau ne contient QUE des faits vérifiables ; « Populaire »
 * est interdit (0 vente) ; le VERT est réservé au LIVRÉ — tout avantage
 * annoncé mais non livré porte « Bientôt » (ambre), jamais « Inclus ».
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

test("exactement DEUX avantages « bientôt » : en ligne et vocaux", () => {
  const entries = [...code.matchAll(/badge: "bientot"/g)];
  assert.equal(entries.length, 2);

  for (const title of ["Vois qui est en ligne", "Messages vocaux"]) {
    const idx = code.indexOf(`title: "${title}"`);
    assert.notEqual(idx, -1, `avantage absent : ${title}`);
    const bloc = code.slice(idx, idx + 420);
    assert.match(bloc, /badge: "bientot"/);
    // Le vert « Inclus » est interdit tant que ce n'est pas livré.
    assert.match(bloc, /premium: "Bientôt"/);
    assert.doesNotMatch(bloc, /premium: "Inclus"/);
  }
});

test("« Bientôt » est rendu en ambre, jamais en vert", () => {
  assert.match(code, /badge === "bientot"[\s\S]{0,320}Bientôt/);
  assert.match(code, /amber-50[\s\S]{0,200}Bientôt/);
  assert.doesNotMatch(code, /emerald-\d{3}[^"]*"[\s\S]{0,80}Bientôt/);
});

test("la branche badge « nouveau » a disparu du rendu (aucun avantage ne la porte)", () => {
  assert.doesNotMatch(code, /badge: "nouveau"/);
  assert.doesNotMatch(code, /badge === "nouveau"/);
  assert.doesNotMatch(code, /^\s*Nouveau\s*$/m);
});

test("l'avantage-roi porte « Déjà actif » (seul avantage LIVRÉ en production)", () => {
  const idx = code.indexOf('title: "Échange de coordonnées WhatsApp"');
  const bloc = code.slice(idx, idx + 120);
  assert.match(bloc, /badge: "actif"/);
  assert.match(code, /Déjà actif/);
});

test("FAQ : la question d'honnêteté sur les avantages est présente", () => {
  const idx = code.indexOf("Tous les avantages sont-ils déjà actifs ?");
  assert.notEqual(idx, -1, "entrée FAQ manquante");
  const bloc = code.slice(idx, idx + 700);
  assert.match(bloc, /Bientôt/);
  assert.match(bloc, /Vois qui est en ligne/);
  assert.match(bloc, /Messages vocaux/);
  assert.match(bloc, /Déjà actif/);
});

test("formule 1 mois « Recommandée » — jamais « Populaire » (0 vente)", () => {
  assert.match(code, /duration\.code === "premium_1_mois"[\s\S]{0,400}Recommandée/);
  assert.doesNotMatch(code, /Populaire/i);
});

test("bandeau final personnalisé par le prénom, avec repli neutre", () => {
  assert.match(code, /\$\{firstName\}, le bon moment pour préparer ton profil/);
  assert.match(code, /"Le bon moment pour préparer ton profil, c’est maintenant\."/);
});
