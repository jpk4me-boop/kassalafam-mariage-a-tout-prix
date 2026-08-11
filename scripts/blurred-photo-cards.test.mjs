/**
 * Contrôles structurels : photos floutées affichées en miniature dégradée.
 * `node --test scripts/blurred-photo-cards.test.mjs`
 *
 * Verrous : l'ORIGINALE d'un profil flouté n'est JAMAIS signée ; le dérivé est
 * réellement pauvre (≤ 32 px) et mis en cache ; chaque carte rend l'image
 * floutée + chip et CONSERVE le placeholder de repli ; sharp est déclaré.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const photos = await readFile("src/lib/discovery/candidate-photos.ts", "utf8");
const pkg = JSON.parse(await readFile("package.json", "utf8"));

const CARDS = [
  ["discover-feed-view", "c"],
  ["favorites-view", "c"],
  ["visitors-view", "c"],
  ["matches-view", "item"],
  ["dashboard-selection", "candidate"],
];

const sansCommentaires = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("serveur : l'originale d'un profil flouté n'est jamais signée", () => {
  const code = sansCommentaires(photos);
  // La liste à signer n'accueille l'originale QUE si is_blurred === false.
  assert.match(code, /blurredById\.get\(r\.profile_id\) === false/);
  // Les floutés passent EXCLUSIVEMENT par le dérivé.
  assert.match(code, /ensureBlurredDerivative\(admin, r\.storage_path\)/);
  assert.match(code, /blurredById\.get\(r\.profile_id\) === true/);
});

test("serveur : dérivé réellement pauvre, en cache, en échec silencieux", () => {
  const code = sansCommentaires(photos);
  const w = code.match(/BLURRED_WIDTH = (\d+)/);
  const h = code.match(/BLURRED_HEIGHT = (\d+)/);
  assert.ok(w && Number(w[1]) <= 32, "largeur du dérivé ≤ 32 px exigée");
  assert.ok(h && Number(h[1]) <= 40, "hauteur du dérivé ≤ 40 px exigée");
  assert.match(code, /\.resize\(BLURRED_WIDTH, BLURRED_HEIGHT/);
  assert.match(code, /\.blur\(BLURRED_SIGMA\)/);
  // Cache-first : signature d'essai avant toute génération.
  assert.match(code, /createSignedUrl\(derivativePath, 60\)/);
  assert.match(code, /upsert: true/);
  // Échec ⇒ null ⇒ placeholder (jamais un crash, jamais l'originale).
  assert.match(code, /return null;/);
  // Garde server-only conservée.
  assert.match(code, /typeof window !== "undefined"/);
  // storage_path jamais renvoyé.
  assert.doesNotMatch(code, /signedUrl: [^,]*storage_path/);
});

test("cartes : image dégradée + flou CSS + chip, placeholder de repli conservé", async () => {
  for (const [name, v] of CARDS) {
    const src = sansCommentaires(
      await readFile(`src/components/member/${name}.tsx`, "utf8"),
    );
    assert.match(
      src,
      new RegExp(`${v}\\.is_blurred\\s*\\?\\s*"h-full w-full scale-110 object-cover blur-md"`),
      `${name} : classe de flou CSS manquante`,
    );
    assert.match(src, /Photo protégée/, `${name} : chip/placeholder absent`);
    // Le repli « pas d'URL » existe toujours (échec de génération).
    assert.match(
      src,
      new RegExp(`\\)\\s*:\\s*${v}\\.is_blurred\\s*\\?\\s*\\(`),
      `${name} : placeholder de repli supprimé à tort`,
    );
  }
  // Avatar de conversation : flou léger, sans chip.
  const avatar = sansCommentaires(
    await readFile("src/components/member/conversation-view.tsx", "utf8"),
  );
  assert.match(avatar, /other\.is_blurred\s*\?\s*"h-full w-full scale-110 object-cover blur-\[3px\]"/);
});

test("sharp est déclaré, aligné sur la version embarquée par Next", () => {
  assert.equal(pkg.dependencies.sharp, "^0.34.5");
});
