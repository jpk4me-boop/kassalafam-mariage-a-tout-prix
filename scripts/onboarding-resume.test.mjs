/**
 * Contrôles structurels : écran de reprise du wizard (volet B) — un membre qui
 * revient sur un parcours entamé est accueilli avec sa progression avant de
 * reprendre à sa première étape incomplète.
 * `node --test scripts/onboarding-resume.test.mjs`
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [wizard, resume, completion, relance, pkg] = await Promise.all([
  readFile("src/components/onboarding/onboarding-wizard.tsx", "utf8"),
  readFile("src/components/onboarding/onboarding-resume.tsx", "utf8"),
  readFile("src/lib/onboarding/completion.ts", "utf8"),
  readFile("src/lib/admin/relance.ts", "utf8"),
  readFile("package.json", "utf8"),
]);

test("la phase resume est câblée pour un parcours entamé uniquement", () => {
  assert.match(wizard, /"intro" \| "resume" \| "steps" \| "confirm"/);
  assert.match(
    wizard,
    /showIntro \? "intro" : initialStep > 1 \? "resume" : "steps"/,
  );
  assert.match(
    wizard,
    /import \{ OnboardingResume \} from "@\/components\/onboarding\/onboarding-resume"/,
  );
  assert.match(wizard, /onResume=\{\(\) => setPhase\("steps"\)\}/);
});

test("l'introduction reste réservée aux profils neufs", () => {
  assert.match(wizard, /showIntro: first === 1/);
  assert.match(wizard, /OnboardingIntro/);
});

test("la progression vient de la source de vérité, jamais recalculée ailleurs", () => {
  // Le wizard dérive complétés/restants du MÊME computeStepCompletion.
  assert.match(wizard, /completedSteps: completed/);
  assert.match(wizard, /ONBOARDING_STEP_LABELS\[step as OnboardingStep\]/);
  // L'écran de reprise est PASSIF : il reçoit tout en props, aucune règle.
  assert.doesNotMatch(resume, /computeStepCompletion|firstIncompleteStep/);
  assert.doesNotMatch(resume, /profile\./);
});

test("les libellés des 8 étapes vivent dans completion.ts, sans duplication", () => {
  assert.match(completion, /export const ONBOARDING_STEP_LABELS/);
  for (const label of [
    "Source d’inscription",
    "Identité",
    "Date de naissance",
    "Situation & religion",
    "Profession & études",
    "Localisation",
    "Projet matrimonial",
    "Photos",
  ]) {
    assert.match(completion, new RegExp(label), `libellé manquant : ${label}`);
  }
  // Ni l'écran de reprise ni le helper admin ne les redéfinissent.
  assert.doesNotMatch(resume, /Projet matrimonial/);
  assert.doesNotMatch(relance, /Projet matrimonial/);
  assert.match(relance, /ONBOARDING_STEP_LABELS/);
});

test("l'écran de reprise accueille, chiffre et rassure", () => {
  assert.match(resume, /"use client"/);
  assert.match(resume, /Bon retour/);
  assert.match(resume, /missingLabels\.join\(", "\)/);
  assert.match(resume, /finalSendOnly/);
  assert.match(resume, /l’envoi de votre profil/);
  assert.match(resume, /Reprendre où j’en étais/);
  assert.match(resume, /a été conservé/);
});

test("le script de test est déclaré dans package.json", () => {
  assert.match(
    pkg,
    /"test:onboarding-resume": "node --test scripts\/onboarding-resume\.test\.mjs"/,
  );
});
