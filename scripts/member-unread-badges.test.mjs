/**
 * Contrôles structurels : pastilles de non-lus (Messages, Notifications) dans
 * l'en-tête membre. `node --test scripts/member-unread-badges.test.mjs`
 *
 * Verrous : sources EXISTANTES uniquement (aucune nouvelle RPC, aucune
 * migration), pas de polling continu, pastille rendue seulement si count > 0,
 * information portée par le texte (aria) et pas par la couleur seule.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const header = await readFile("src/components/member/member-header.tsx", "utf8");
const code = header
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

test("sources existantes uniquement : RPC relationships + comptage RLS notifications", () => {
  assert.match(code, /supabase\.rpc\("list_my_relationships"\)/);
  assert.match(
    code,
    /from\("member_notifications"\)[\s\S]{0,120}count: "exact", head: true[\s\S]{0,80}\.is\("read_at", null\)/,
  );
  // Aucune autre RPC ni table : pas de nouvelle surface serveur.
  const rpcs = [...code.matchAll(/supabase\.rpc\("([a-z_]+)"/g)].map(([, n]) => n);
  assert.deepEqual([...new Set(rpcs)], ["list_my_relationships"]);
});

test("le total messages est la somme des unread_count des relations", () => {
  assert.match(code, /reduce\(\s*\(sum, r\) => sum \+ \(r\.unread_count \?\? 0\),\s*0,?\s*\)/);
});

test("rafraîchissement sobre : navigation + focus/visibilité, JAMAIS de polling", () => {
  assert.match(code, /\}, \[pathname\]\);/);
  assert.match(code, /addEventListener\("focus", onVisible\)/);
  assert.match(code, /addEventListener\("visibilitychange", onVisible\)/);
  assert.doesNotMatch(code, /setInterval/);
  // Nettoyage symétrique des écouteurs.
  assert.match(code, /removeEventListener\("focus", onVisible\)/);
  assert.match(code, /removeEventListener\("visibilitychange", onVisible\)/);
});

test("pastille : seulement si count > 0, plafonnée à 99+, jamais un compteur en dur", () => {
  assert.match(code, /\{count > 0 \? \(/);
  assert.match(code, /count > 99 \? "99\+" : String\(count\)/);
  assert.match(code, /formatBadgeCount\(count\)/);
});

test("accessibilité : le nombre est porté par l'aria-label, la pastille est aria-hidden", () => {
  assert.match(code, /non lu\$\{count > 1 \? "s" : ""\}/);
  assert.match(code, /aria-label=\{ariaLabel\}/);
  // La pastille visuelle est décorative (le texte accessible est sur le lien).
  assert.match(code, /aria-hidden[\s\S]{0,400}formatBadgeCount\(count\)/);
});

test("échec silencieux : une erreur RPC/REST retombe à 0, jamais un crash d'en-tête", () => {
  assert.match(code, /relationships\.error \|\| !relationships\.data\s*\?\s*0/);
  assert.match(code, /notifications\.error \? 0 : \(notifications\.count \?\? 0\)/);
});
