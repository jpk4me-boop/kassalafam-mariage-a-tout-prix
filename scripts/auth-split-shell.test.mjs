/**
 * Contrôles structurels : écran scindé d'authentification, consentement
 * explicite à l'inscription, intro d'onboarding enrichie.
 * `node --test scripts/auth-split-shell.test.mjs`
 *
 * Verrous : honnêteté (pas de compteur d'inscrits, pas de « tout modifier à
 * tout moment ») et consentement réellement BLOQUANT avec de vrais liens.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [shell, register, login, intro] = await Promise.all([
  readFile("src/components/auth/auth-shell.tsx", "utf8"),
  readFile("src/app/register/page.tsx", "utf8"),
  readFile("src/app/login/page.tsx", "utf8"),
  readFile("src/components/onboarding/onboarding-intro.tsx", "utf8"),
]);

const sansCommentaires = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("écran scindé : panneau identité desktop-only, carte préservée, logo mobile conservé", () => {
  const code = sansCommentaires(shell);
  // Panneau desktop uniquement (lg+) ; la carte reste seule sur mobile.
  assert.match(code, /hidden[^"]*lg:flex/);
  assert.match(code, /<Logo variant="light" \/>/);
  assert.match(code, /lg:hidden/);
  // Les trois preuves vraies.
  assert.match(code, /Profils vérifiés à la main/);
  assert.match(code, /vous décidez qui voit quoi/);
  assert.match(code, /orientées mariage/);
});

test("écran scindé : aucun compteur ni citation religieuse", () => {
  const code = sansCommentaires(shell);
  assert.doesNotMatch(code, /\+?\d[\d\s.,]*\s*k\b/i, "compteur interdit");
  assert.doesNotMatch(code, /inscrits ce mois/i);
  assert.doesNotMatch(code, /Sourate|Bismillah|verset/i, "plateforme multiconfessionnelle");
});

test("inscription : consentement requis, jamais pré-coché, bouton bloqué sans lui", () => {
  const code = sansCommentaires(register);
  assert.match(code, /const \[consent, setConsent\] = useState\(false\);/);
  assert.match(code, /name="consent"[\s\S]{0,80}required/);
  assert.match(code, /disabled=\{loading \|\| !consent\}/);
  // L'ancienne mention passive a disparu.
  assert.doesNotMatch(code, /charte de confidentialité et\s+de modération/);
});

test("inscription : les liens légaux pointent vers les VRAIES pages", () => {
  assert.match(register, /href="\/conditions-utilisation"/);
  assert.match(register, /href="\/confidentialite"/);
});

test("connexion : hérite du shell scindé sans consentement parasite", () => {
  assert.match(login, /AuthShell/);
  assert.doesNotMatch(sansCommentaires(login), /name="consent"/);
});

test("intro d'onboarding : 3 réassurances vraies, pas de « tout modifier à tout moment »", () => {
  const code = sansCommentaires(intro);
  assert.match(code, /vérifié à la main/);
  assert.match(code, /floutées par défaut/);
  assert.match(code, /reprendre à tout moment/);
  // La promesse de Farata, FAUSSE chez nous (genre et date définitifs) :
  assert.doesNotMatch(code, /tout modifier/i);
});
