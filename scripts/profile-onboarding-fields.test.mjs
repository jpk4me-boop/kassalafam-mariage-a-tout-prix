/**
 * Contrôles structurels : /profile restitue TOUTES les informations
 * recueillies pendant les 8 étapes de l'inscription, modifiables, avec les
 * mêmes options et les mêmes bornes que le wizard.
 * `node --test scripts/profile-onboarding-fields.test.mjs`
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [profilePage, options, matrimonialStep, professionalStep] =
  await Promise.all([
    readFile("src/app/(member)/profile/page.tsx", "utf8"),
    readFile("src/lib/onboarding/options.ts", "utf8"),
    readFile("src/components/onboarding/steps/matrimonial-step.tsx", "utf8"),
    readFile("src/components/onboarding/steps/professional-step.tsx", "utf8"),
  ]);

test("les champs des étapes 5, 6 et 7 sont présents dans l'état du formulaire", () => {
  for (const field of [
    "region",
    "profession",
    "education_level",
    "height_cm",
    "marriage_goals",
    "desired_partner_traits",
    "polygamy_preference",
    "children_intent",
  ]) {
    assert.match(
      profilePage,
      new RegExp(`${field}:`),
      `champ absent de FormState / EMPTY_FORM : ${field}`,
    );
  }
});

test("chaque champ restitué est relu depuis le profil chargé", () => {
  assert.match(profilePage, /region: profile\.region \?\? ""/);
  assert.match(profilePage, /profession: profile\.profession \?\? ""/);
  assert.match(profilePage, /education_level: profile\.education_level \?\? ""/);
  assert.match(profilePage, /profile\.height_cm != null/);
  assert.match(profilePage, /marriage_goals: profile\.marriage_goals \?\? \[\]/);
  assert.match(
    profilePage,
    /desired_partner_traits: profile\.desired_partner_traits \?\? \[\]/,
  );
  assert.match(
    profilePage,
    /polygamy_preference: profile\.polygamy_preference \?\? ""/,
  );
  assert.match(profilePage, /children_intent: profile\.children_intent \?\? ""/);
});

test("chaque champ restitué est réécrit dans le payload d'enregistrement", () => {
  assert.match(profilePage, /region: form\.region\.trim\(\) \|\| null/);
  assert.match(profilePage, /profession: form\.profession\.trim\(\) \|\| null/);
  assert.match(profilePage, /education_level: form\.education_level \|\| null/);
  assert.match(profilePage, /height_cm: heightValue/);
  assert.match(profilePage, /marriage_goals:\s*\n?\s*form\.marriage_goals\.length > 0/);
  assert.match(profilePage, /desired_partner_traits:/);
  assert.match(
    profilePage,
    /polygamy_preference: form\.polygamy_preference \|\| null/,
  );
  assert.match(profilePage, /children_intent: form\.children_intent \|\| null/);
});

test("les options viennent du catalogue partagé de l'onboarding, jamais dupliquées", () => {
  for (const list of [
    "MARRIAGE_GOAL_OPTIONS",
    "PARTNER_TRAIT_OPTIONS",
    "POLYGAMY_PREFERENCE_OPTIONS",
    "CHILDREN_INTENT_OPTIONS",
    "EDUCATION_LEVEL_OPTIONS",
  ]) {
    assert.match(profilePage, new RegExp(list), `liste non réutilisée : ${list}`);
    assert.match(options, new RegExp(`export const ${list}`));
  }

  // Les libellés restent définis dans options.ts uniquement.
  assert.doesNotMatch(profilePage, /Fonder une famille/);
  assert.doesNotMatch(profilePage, /Bienveillance/);
});

test("les composants de choix sont ceux du wizard, pas des copies", () => {
  assert.match(profilePage, /MultiChoiceChips/);
  assert.match(profilePage, /ChoiceCard/);
  assert.match(matrimonialStep, /MultiChoiceChips/);
  assert.match(matrimonialStep, /ChoiceCard/);
});

test("les bornes de saisie sont celles de la base, importées et non recopiées", () => {
  assert.match(profilePage, /HEIGHT_MIN_CM/);
  assert.match(profilePage, /HEIGHT_MAX_CM/);
  assert.match(profilePage, /PROFESSION_MAX/);
  assert.match(profilePage, /REGION_MAX/);
  assert.match(profilePage, /CHOICE_SET_MIN/);
  assert.match(profilePage, /CHOICE_SET_MAX/);
  assert.match(professionalStep, /HEIGHT_MIN_CM/);

  // Aucune borne numérique en dur dans la page.
  assert.doesNotMatch(profilePage, /min=\{120\}/);
  assert.doesNotMatch(profilePage, /max=\{230\}/);
});

test("la validation reflète les CHECK base avant tout appel Supabase", () => {
  // Taille : entier dans les bornes, vide accepté.
  assert.match(profilePage, /Number\.isInteger\(parsed\)/);
  // Listes de choix : vide OU 2 à 3.
  assert.match(profilePage, /function isChoiceSetAcceptable/);
  assert.match(profilePage, /values\.length === 0\) return true/);
  // Un profil finalisé ne peut plus vider son projet matrimonial.
  assert.match(
    profilePage,
    /onboardingDone && form\.marriage_goals\.length === 0/,
  );
  assert.match(
    profilePage,
    /onboardingDone && form\.desired_partner_traits\.length === 0/,
  );
});

test("genre et date de naissance restent verrouillés après finalisation", () => {
  assert.match(profilePage, /disabled=\{saving \|\| onboardingDone\}/);
  assert.match(profilePage, /if \(!onboardingDone\) \{/);
  assert.match(profilePage, /profilePayload\.gender = form\.gender/);
  assert.match(profilePage, /verrouillés après la/);
});
