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
  promoPage,
  promoConsentCard,
] = await Promise.all([
  readFile("src/app/candidats/[slug]/photo/route.ts", "utf8"),
  readFile("src/app/candidats/[slug]/page.tsx", "utf8"),
  readFile("src/app/candidats/page.tsx", "utf8"),
  readFile("src/app/p/[token]/photo/route.ts", "utf8"),
  readFile("src/app/promo/[token]/photo/route.ts", "utf8"),
  readFile("src/components/member/candidate-showcase-card.tsx", "utf8"),
  readFile("src/app/promo/[token]/page.tsx", "utf8"),
  readFile("src/components/member/profile-promotion-consent-card.tsx", "utf8"),
]);

/** Extrait le corps d'un objet d'en-têtes. */
function headersBlock(source, constName) {
  const start = source.indexOf(`const ${constName}`);
  assert.notEqual(start, -1, `bloc introuvable : ${constName}`);
  const end = source.indexOf("};", start);
  assert.notEqual(end, -1, `bloc non terminé : ${constName}`);
  return source.slice(start, end);
}

/**
 * Valeur EXACTE d'un en-tête, commentaires ignorés.
 *
 * Vérifier la présence d'un mot dans tout le bloc est un piège : un
 * commentaire expliquant « `noarchive` retiré » ferait échouer l'assertion.
 * On lit donc la valeur déclarée, jamais le texte alentour.
 */
function headerValue(block, name) {
  return block.match(new RegExp(`"${name}": "([^"]*)"`))?.[1] ?? null;
}

test("la photo de vitrine est récupérable par les robots sociaux", () => {
  const base = headersBlock(showcasePhotoRoute, "BASE_HEADERS");

  assert.match(headerValue(base, "Cache-Control") ?? "", /^public/);
  assert.equal(headerValue(base, "Cross-Origin-Resource-Policy"), "cross-origin");
  // La vitrine est indexable : aucune directive robots ne restreint sa photo.
  assert.equal(headerValue(base, "X-Robots-Tag"), null);
});

test("les 404 de vitrine restent non cachables et non archivables", () => {
  assert.match(showcasePhotoRoute, /const NOT_FOUND_HEADERS/);
  assert.match(showcasePhotoRoute, /"X-Robots-Tag": "noindex, noarchive"/);
  assert.match(showcasePhotoRoute, /headers: NOT_FOUND_HEADERS/);
});

test("le partage DISCRET /p garde son verrouillage intégral", () => {
  // Ce lien n'est PAS destiné aux réseaux sociaux : il se transmet de la main
  // à la main. Ni cache, ni archive, ni chargement depuis une autre origine.
  const base = headersBlock(sharePhotoRoute, "BASE_HEADERS");

  assert.match(base, /no-store/);
  assert.match(base, /noarchive/);
  assert.match(base, /noindex/);
  assert.match(base, /"Cross-Origin-Resource-Policy": "same-origin"/);
});

test("la promotion est partageable sur les réseaux mais reste hors des moteurs", () => {
  const base = headersBlock(promoPhotoRoute, "BASE_HEADERS");

  // Partageable : cache public court et chargement cross-origin autorisé.
  assert.match(headerValue(base, "Cache-Control") ?? "", /^public/);
  assert.equal(headerValue(base, "Cross-Origin-Resource-Policy"), "cross-origin");
  // Jamais référencée, mais plus de `noarchive` : c'est lui qui empêchait
  // les plateformes sociales de constituer l'aperçu.
  assert.equal(headerValue(base, "X-Robots-Tag"), "noindex");
});

test("les 404 de promotion restent non cachables et non archivables", () => {
  const notFound = headersBlock(promoPhotoRoute, "NOT_FOUND_HEADERS");

  assert.match(notFound, /no-store/);
  assert.match(notFound, /noarchive/);
  assert.match(notFound, /"Cross-Origin-Resource-Policy": "same-origin"/);
  assert.match(promoPhotoRoute, /headers: NOT_FOUND_HEADERS/);
});

test("la page de promotion reste invisible des moteurs de recherche", () => {
  assert.match(
    promoPage,
    /robots: \{ index: false, follow: false, noarchive: true \}/,
  );
});

test("la promotion déclare les dimensions de son aperçu", () => {
  assert.match(promoPage, /width: 1200/);
  assert.match(promoPage, /height: 630/);
});

test("le consentement promotionnel annonce la persistance des caches sociaux", () => {
  assert.match(promoConsentCard, /cache de ce réseau/);
  assert.match(promoConsentCard, /cesse immédiatement de fonctionner/);
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
