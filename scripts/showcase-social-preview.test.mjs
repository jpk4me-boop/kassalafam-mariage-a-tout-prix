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

test("la photo de vitrine est récupérable par les robots sociaux", () => {
  assert.match(showcasePhotoRoute, /"Cache-Control": "public/);
  assert.match(
    showcasePhotoRoute,
    /"Cross-Origin-Resource-Policy": "cross-origin"/,
  );
  // Plus de noarchive sur la réponse 200 : c'est lui qui bloquait l'aperçu.
  assert.doesNotMatch(
    showcasePhotoRoute.split("NOT_FOUND_HEADERS")[0],
    /noarchive/,
  );
});

test("les 404 de vitrine restent non cachables et non archivables", () => {
  assert.match(showcasePhotoRoute, /const NOT_FOUND_HEADERS/);
  assert.match(showcasePhotoRoute, /"X-Robots-Tag": "noindex, noarchive"/);
  assert.match(showcasePhotoRoute, /headers: NOT_FOUND_HEADERS/);
});

test("les partages PRIVÉS gardent leur verrouillage intégral", () => {
  for (const [name, source] of [
    ["/p/[token]/photo", sharePhotoRoute],
    ["/promo/[token]/photo", promoPhotoRoute],
  ]) {
    assert.match(source, /no-store/, `${name} : cache privé perdu`);
    assert.match(source, /noarchive/, `${name} : noarchive perdu`);
    assert.doesNotMatch(
      source,
      /"Cross-Origin-Resource-Policy": "cross-origin"/,
      `${name} : ne doit jamais être cross-origin`,
    );
  }
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

test("le consentement annonce la contrepartie du cache externe", () => {
  assert.match(showcaseCard, /moteurs de recherche/);
  assert.match(showcaseCard, /leur propre cache/);
  assert.match(showcaseCard, /hors du contrôle de KASSALAFAM/);
});
