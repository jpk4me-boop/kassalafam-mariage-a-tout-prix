/**
 * Contrôles structurels : aperçus sociaux de la vitrine publique.
 * Les protections des partages PRIVÉS (/p et /promo) doivent rester intactes.
 * `node --test scripts/showcase-social-preview.test.mjs`
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [
  showcasePhotoRoute,
  showcaseProfilePage,
  showcaseListPage,
  sharePhotoRoute,
  promoPhotoRoute,
  showcaseCard,
] = await Promise.all([
  readFile("src/app/candidats/[slug]/photo/route.ts", "utf8"),
  readFile("src/app/candidats/[slug]/page.tsx", "utf8"),
  readFile("src/app/candidats/page.tsx", "utf8"),
  readFile("src/app/p/[token]/photo/route.ts", "utf8"),
  readFile("src/app/promo/[token]/photo/route.ts", "utf8"),
  readFile("src/components/member/candidate-showcase-card.tsx", "utf8"),
]);

/** Extrait le corps d'un objet d'en-têtes, hors commentaires alentour. */
function headersBlock(source, constName) {
  const start = source.indexOf(`const ${constName}`);
  assert.notEqual(start, -1, `bloc introuvable : ${constName}`);
  const end = source.indexOf("};", start);
  assert.notEqual(end, -1, `bloc non terminé : ${constName}`);
  return source.slice(start, end);
}

test("la photo de vitrine est récupérable par les robots sociaux", () => {
  const base = headersBlock(showcasePhotoRoute, "BASE_HEADERS");

  assert.match(base, /"Cache-Control": "public/);
  assert.match(base, /"Cross-Origin-Resource-Policy": "cross-origin"/);
  // Aucun X-Robots-Tag sur la réponse 200 : c'est `noarchive` qui empêchait
  // les plateformes sociales de constituer l'aperçu.
  assert.doesNotMatch(base, /X-Robots-Tag/);
  assert.doesNotMatch(base, /no-store/);
});

test("les 404 de vitrine restent non cachables et non archivables", () => {
  assert.match(showcasePhotoRoute, /const NOT_FOUND_HEADERS/);
  assert.match(showcasePhotoRoute, /"X-Robots-Tag": "noindex, noarchive"/);
  assert.match(showcasePhotoRoute, /headers: NOT_FOUND_HEADERS/);
});

test("les partages PRIVÉS gardent leur verrouillage : jamais de cache, jamais d'archive", () => {
  for (const [name, source] of [
    ["/p/[token]/photo", sharePhotoRoute],
    ["/promo/[token]/photo", promoPhotoRoute],
  ]) {
    const base = headersBlock(source, "BASE_HEADERS");

    assert.match(base, /no-store/, `${name} : cache privé perdu`);
    assert.match(base, /noarchive/, `${name} : noarchive perdu`);
    assert.match(base, /noindex/, `${name} : noindex perdu`);
  }
});

test("le lien privé /p reste inutilisable depuis une autre origine", () => {
  // Contrairement à /promo (destiné aux réseaux sociaux) et à la vitrine,
  // le lien de partage discret /p ne doit jamais être embarquable ailleurs.
  const base = headersBlock(sharePhotoRoute, "BASE_HEADERS");
  assert.match(base, /"Cross-Origin-Resource-Policy": "same-origin"/);
});

test("la page profil déclare les dimensions de l'aperçu", () => {
  assert.match(showcaseProfilePage, /width: 1200/);
  assert.match(showcaseProfilePage, /height: 630/);
  assert.match(showcaseProfilePage, /robots: \{ index: true, follow: true \}/);
});

test("la page liste a enfin une image d'aperçu, générique", () => {
  assert.match(showcaseListPage, /images: \[/);
  assert.match(showcaseListPage, /url: "\/opengraph-image"/);
  assert.match(showcaseListPage, /images: \["\/twitter-image"\]/);
  // Aucune photo de membre ne représente la page liste.
  assert.doesNotMatch(showcaseListPage, /\/photo"/);
});

test("le titre et la description reprennent la formulation validée sur Facebook", () => {
  // Même patron que les liens de promotion, dont l'aperçu a fait ses preuves.
  assert.match(showcaseProfilePage, /profil mariage sérieux — KASSALAFAM/);
  assert.match(showcaseProfilePage, /Découvrez \$\{candidate\.firstName\}/);
  assert.match(showcaseProfilePage, /présenté avec son autorisation/);
  assert.match(
    showcaseProfilePage,
    /plateforme de mariage sérieuse et confidentielle/,
  );
  // La ville citée est la RÉSIDENCE, seule donnée géographique publique.
  assert.match(showcaseProfilePage, /ans à \$\{candidate\.city\}/);
});

test("le consentement annonce la contrepartie du cache externe", () => {
  assert.match(showcaseCard, /moteurs de recherche/);
  assert.match(showcaseCard, /leur propre cache/);
  assert.match(showcaseCard, /hors du contrôle de KASSALAFAM/);
});
