/**
 * Contrôles structurels : panneau de complétion du profil + sommaire à ancres.
 * `node --test scripts/profile-completion.test.mjs`
 *
 * Verrous : pourcentage CALCULÉ (jamais en dur), chaque ancre référencée
 * existe réellement dans la page, aucun bouton de gestion de compte factice
 * (suspendre/supprimer = backlog, pas d'UI sans backend).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [panel, page] = await Promise.all([
  readFile("src/components/member/profile-completion-panel.tsx", "utf8"),
  readFile("src/app/(member)/profile/page.tsx", "utf8"),
]);

const sansCommentaires = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("panneau : composant PUR, pourcentage calculé, jamais en dur", () => {
  const code = sansCommentaires(panel);
  assert.doesNotMatch(code, /supabase|createClient|fetch\(|useEffect/);
  assert.match(code, /Math\.round\(\(done \/ total\) \* 100\)/);
  // Aucun pourcentage littéral (le « 84 % » de la concurrence est un piège).
  assert.doesNotMatch(code, /\b\d{2,3}\s*%/);
});

test("page : chaque élément de complétion vient d'un champ RÉEL du formulaire", () => {
  const code = sansCommentaires(page);
  const bloc = code.slice(
    code.indexOf("const completionItems"),
    code.indexOf("const anchorComplete"),
  );
  // Chaque done: référence form.* ou photosState (jamais true/false en dur).
  const doneExprs = [...bloc.matchAll(/done:\s*([^,\n]+[^,]*)/g)].map(([, e]) => e);
  assert.ok(doneExprs.length >= 11, `attendu ≥ 11 éléments, trouvé ${doneExprs.length}`);
  for (const expr of doneExprs) {
    assert.match(
      expr,
      /form\.|photosState/,
      `élément de complétion sans source réelle : ${expr}`,
    );
  }
  assert.doesNotMatch(bloc, /done:\s*(true|false)\s*,/);
});

test("page : toutes les ancres utilisées existent dans le document", () => {
  const anchors = [...page.matchAll(/anchor:\s*"([a-z]+)"/g)].map(([, a]) => a);
  const uniques = [...new Set(anchors)];
  assert.ok(uniques.length >= 7);
  for (const a of uniques) {
    assert.match(
      page,
      new RegExp(`id="${a}"`),
      `ancre « ${a} » référencée mais absente du document`,
    );
  }
  // Les cibles d'ancre compensent l'en-tête collant.
  for (const a of uniques) {
    const re = new RegExp(`id="${a}"[^>]*className="[^"]*scroll-mt-28|className="[^"]*scroll-mt-28[^"]*"[^>]*id="${a}"`);
    assert.match(page, re, `ancre « ${a} » sans scroll-mt-28`);
  }
});

test("page : la photo principale n'est comptée qu'une fois l'état connu", () => {
  assert.match(page, /\.\.\.\(photosState/);
  assert.match(page, /ProfilePhotos onStateChange=\{setPhotosState\}/);
});

test("aucune gestion de compte factice (suspendre/supprimer = backlog)", () => {
  for (const [nom, code] of [["panel", panel], ["page", page]]) {
    assert.doesNotMatch(
      sansCommentaires(code),
      /[Ss]upprimer (mon|le) compte|[Ss]uspendre (mon|le) compte/,
      `UI de gestion de compte sans backend détectée dans ${nom}`,
    );
  }
});
