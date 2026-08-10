/**
 * Contrôles structurels : refonte de l'accueil (bandeau de preuves, fenêtre
 * produit, frise horizontale, bandeau CTA, badge tarifs).
 * `node --test scripts/landing-home-sections.test.mjs`
 *
 * Verrous principaux : HONNÊTETÉ (aucun compteur de membres inventé, profils
 * de démonstration explicitement fictifs) et ordre des sections de la page.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [page, proofBar, productWindow, howItWorks, ctaBanner, pricing] =
  await Promise.all([
    readFile("src/app/page.tsx", "utf8"),
    readFile("src/components/landing/proof-bar.tsx", "utf8"),
    readFile("src/components/landing/product-window.tsx", "utf8"),
    readFile("src/components/landing/how-it-works.tsx", "utf8"),
    readFile("src/components/landing/cta-banner.tsx", "utf8"),
    readFile("src/components/landing/pricing.tsx", "utf8"),
  ]);

/** Code sans commentaires, pour tester le RENDU et pas les notes d'intention. */
const sansCommentaires = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("l'accueil monte les nouvelles sections, dans le bon ordre", () => {
  for (const marker of [
    "<ProofBar />",
    "<ProductWindow />",
    "<CtaBanner />",
  ]) {
    assert.ok(page.includes(marker), `${marker} absent de page.tsx`);
  }
  const ordre = [
    "<Hero />",
    "<ProofBar />",
    "<ProductWindow />",
    "<TrustSection />",
    "<HowItWorks />",
    "<WhySection />",
    "<Features />",
    "<CtaBanner />",
    "<Pricing />",
  ].map((m) => page.indexOf(m));
  assert.ok(
    ordre.every((v, i) => v !== -1 && (i === 0 || v > ordre[i - 1])),
    `ordre des sections inattendu : ${ordre.join(", ")}`,
  );
});

test("bandeau de preuves : aucune statistique inventée", () => {
  const code = sansCommentaires(proofBar);
  // Aucun compteur de membres, aucun pourcentage, aucun « +XXXk ».
  assert.doesNotMatch(code, /\+?\d[\d\s.,]*\s*k\b/i);
  assert.doesNotMatch(code, /\d+\s*%/);
  assert.doesNotMatch(code, /membres?\s+(actifs|inscrits)/i);
  // Les trois preuves vraies sont bien là.
  assert.match(code, /Profils vérifiés/);
  assert.match(code, /Inscription gratuite/);
  assert.match(code, /Photos protégées/);
});

test("fenêtre produit : profils fictifs annoncés, aucune donnée réelle", () => {
  // Le caractère fictif est annoncé DANS le texte rendu, pas qu'en commentaire.
  assert.match(sansCommentaires(productWindow), /fictifs/);
  // Aucun appel de données : composant 100 % statique.
  assert.doesNotMatch(productWindow, /supabase|createClient|fetch\(|use client/);
  // La fausse barre d'adresse pointe bien le domaine canonique.
  assert.match(productWindow, /kassalafam\.com/);
});

test("frise des étapes : horizontale sur desktop, verticale conservée sous lg", () => {
  assert.match(howItWorks, /hidden lg:block/);
  assert.match(howItWorks, /lg:hidden/);
  assert.match(howItWorks, /grid-cols-5/);
  // Numérotation 01…05 générée, pas de numéro en dur.
  assert.match(howItWorks, /String\(i \+ 1\)\.padStart\(2, "0"\)/);
});

test("bandeau CTA : un seul lien, vers /register", () => {
  const liens = [...ctaBanner.matchAll(/href="([^"]+)"/g)].map(([, h]) => h);
  assert.deepEqual(liens, ["/register"]);
});

test("tarifs : badge Offre de lancement sans prix barré ni tarif inventé", () => {
  assert.match(pricing, /Offre de lancement/);
  // Pas de prix barré (aucune décision tarifaire prise) : pas de line-through.
  assert.doesNotMatch(pricing, /line-through/);
  // Les tarifs réels du catalogue seedé restent les seuls affichés.
  assert.match(pricing, /2 500/);
  assert.match(pricing, /6 000/);
  assert.match(pricing, /10 000/);
  assert.doesNotMatch(pricing, /5 ?900|9 ?900/);
});
