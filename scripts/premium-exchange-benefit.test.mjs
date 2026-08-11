/**
 * Contrôles structurels : avantage « échange de coordonnées » sur /premium +
 * restyle Bloqué→Débloqué. `node --test scripts/premium-exchange-benefit.test.mjs`
 *
 * Verrous : honnêteté (jamais « accès aux numéros », aucune statistique
 * inventée, aucun prix barré, aucune validation express payante) et
 * cohérence avec le catalogue réel.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile("src/components/member/premium-experience.tsx", "utf8");
const code = page
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

test("l'avantage échange de coordonnées est PREMIER de la liste", () => {
  const debut = code.indexOf("const BENEFITS = [");
  const premier = code.indexOf("title:", debut);
  const titre = code.slice(premier, code.indexOf("\n", premier));
  assert.match(titre, /Échange de coordonnées WhatsApp/);
});

test("le principe est honnête : le droit de DEMANDER, jamais le numéro", () => {
  assert.match(code, /le droit de demander, jamais le numéro/i);
  // FAQ dédiée présente, avec la décision de la personne sollicitée.
  assert.match(code, /Premium donne-t-il accès aux numéros WhatsApp \?/);
  assert.match(code, /La personne sollicitée décide seule/);
  assert.match(code, /retirer son accord/);
  // Jamais de promesse d'accès direct.
  assert.doesNotMatch(code, /accède[sz]? aux numéros|numéros? (visibles?|débloqués?) avec Premium/i);
});

test("restyle Bloqué→Débloqué : standard barré + cadenas, premium en vert conservé", () => {
  assert.match(code, /<Lock size=\{13\} \/>/);
  assert.match(code, /<s className="decoration-red-700\/50">\{benefit\.standard\}<\/s>/);
  assert.match(code, /<Check size=\{13\} strokeWidth=\{3\} \/>/);
});

test("aucune statistique inventée, aucun prix barré, aucune validation express payante", () => {
  assert.doesNotMatch(code, /\b\dX\b|\d{3}\s?000\s?\+|100\s?%/);
  assert.doesNotMatch(code, /line-through[^"]*FCFA|-\d{2}\s?%/);
  assert.doesNotMatch(code, /[Vv]alidation (immédiate|express)/, "décision actée le 12/08 : ne pas monétiser la vérification");
  // Tarifs réels du catalogue seedé, et eux seuls.
  assert.match(code, /2 500 FCFA/);
  assert.match(code, /6 000 FCFA/);
  assert.match(code, /10 000 FCFA/);
  assert.doesNotMatch(code, /5 ?900|9 ?900|3 ?900|14 ?900/);
});
