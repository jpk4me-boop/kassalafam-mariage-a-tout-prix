/**
 * Contrôles structurels : améliorations de l'onboarding (âge en direct,
 * confirmation du genre, note pudeur, écran final enrichi).
 * `node --test scripts/onboarding-uplift.test.mjs`
 *
 * Verrous principaux : HONNÊTETÉ (aucun délai de vérification chiffré n'a été
 * validé — il ne doit exister nulle part) et propagation du genre UNIQUEMENT
 * après confirmation explicite.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [birth, gender, photos, confirmation] = await Promise.all([
  readFile("src/components/onboarding/steps/birth-date-step.tsx", "utf8"),
  readFile("src/components/onboarding/steps/gender-step.tsx", "utf8"),
  readFile("src/components/onboarding/steps/photos-step.tsx", "utf8"),
  readFile("src/components/onboarding/onboarding-confirmation.tsx", "utf8"),
]);

const sansCommentaires = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("date de naissance : l'âge vivant ne s'affiche que pour une date VALIDE et majeure", () => {
  const code = sansCommentaires(birth);
  // L'âge est calculé seulement hors état « trop jeune ».
  assert.match(code, /const age = !tooYoung \? computeAge\(value\) : null;/);
  // Et le bloc de confirmation est conditionné à un âge non nul.
  assert.match(code, /\{age !== null \? \(/);
  // Bornes de vraisemblance : ni négatif, ni fantaisiste.
  assert.match(code, /age >= 0 && age <= 120/);
  // L'avertissement < 18 ans est CONSERVÉ (exigence historique).
  assert.match(code, /ONBOARDING_MIN_AGE/);
});

test("genre : la valeur ne remonte au wizard QU'APRÈS confirmation explicite", () => {
  const code = sansCommentaires(gender);
  // La sélection d'une carte ne fait que poser un état en attente…
  assert.match(code, /setPendingGender\(option\.value\);/);
  assert.doesNotMatch(
    code,
    /onSelect=\{\(\) => onChange\(option\.value\)\}/,
    "la carte ne doit plus propager le genre directement",
  );
  // …et le SEUL appel à onChange vit dans le bouton de confirmation.
  const appels = [...code.matchAll(/onChange\(pendingGender\)/g)];
  assert.equal(appels.length, 1, "un seul chemin de confirmation attendu");
  // Re-choisir la valeur déjà enregistrée ne rouvre pas la confirmation.
  assert.match(code, /if \(option\.value === value\) return;/);
  // Le caractère définitif est annoncé (bandeau + dialogue).
  assert.match(code, /définitif/);
});

test("photos : la note pudeur/floutage est rendue, sans promesse inventée", () => {
  const code = sansCommentaires(photos);
  assert.match(code, /Pudeur respectée/);
  assert.match(code, /floutées/);
  assert.match(code, /vous décidez qui voit quoi/);
});

test("écran final : le parcours d'après est décrit, AUCUN délai chiffré promis", () => {
  const code = sansCommentaires(confirmation);
  assert.match(code, /Profil envoyé/);
  assert.match(code, /Examen à la main/);
  assert.match(code, /WhatsApp ou un email/);
  assert.match(code, /Explorez en attendant/);
  // Verrou d'honnêteté : aucune durée chiffrée (« 12-24h », « sous 24 h »…).
  assert.doesNotMatch(code, /\d+\s*[-–]\s*\d+\s*h/i);
  assert.doesNotMatch(code, /sous\s+\d+\s*h/i);
  assert.doesNotMatch(code, /\d+\s*(heures|jours)/i);
});

test("aucun délai chiffré nulle part dans le lot (verrou global)", () => {
  for (const [nom, code] of [
    ["birth-date-step", birth],
    ["gender-step", gender],
    ["photos-step", photos],
    ["onboarding-confirmation", confirmation],
  ]) {
    assert.doesNotMatch(
      sansCommentaires(code),
      /12\s*[-–]\s*24|24\s*[-–]\s*48/,
      `délai chiffré interdit trouvé dans ${nom}`,
    );
  }
});
