/**
 * Contrôles structurels — Lot H : menu du profil dans l'en-tête.
 * `node --test scripts/member-profile-menu.test.mjs`
 *
 * Ce que la suite verrouille :
 *   1. le menu ne propose que des réglages RÉELS, écrits sur des colonnes
 *      existantes — aucun quota inventé, aucune fonction absente ;
 *   2. un réglage de confidentialité ne ment jamais : pas d'interrupteur tant
 *      que l'état n'a pas été lu, et retour en arrière si l'écriture échoue ;
 *   3. le volet se ferme (Échap, clic à l'extérieur, navigation) ;
 *   4. chaque lien mène à une route qui existe.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";

const lire = async (chemin) => readFile(chemin, "utf8");

const entete = await lire("src/components/member/member-header.tsx");

test("les deux bascules écrivent sur des colonnes réelles du profil", () => {
  assert.match(entete, /select\("blur_photos, discreet_visits, verification_status"\)/);
  assert.match(entete, /\{ blur_photos: apres \}/);
  assert.match(entete, /\{ discreet_visits: apres \}/);
  assert.match(entete, /Déflouter mes photos/);
  assert.match(entete, /Reflouter mes photos/);
  assert.match(entete, /Visites discrètes/);
});

test("aucun quota ni fonction inventés dans le menu", () => {
  for (const interdit of [
    "Demandes restantes",
    "Sons activés",
    "essais restants",
    "Match IA",
    "Boost illimité",
  ]) {
    assert.doesNotMatch(
      entete,
      new RegExp(interdit),
      `« ${interdit} » n'existe pas dans le produit : le menu ne doit pas l'annoncer`,
    );
  }
});

test("un réglage de confidentialité ne ment jamais", () => {
  // Pas d'interrupteur tant que l'état n'a pas pu être lu.
  assert.match(entete, /\{reglages \? \(/);
  // Retour en arrière explicite si l'écriture échoue.
  assert.match(entete, /if \(error\) \{[\s\S]{0,320}setReglages\(/);
  // Et les écrans serveur sont rafraîchis après un changement réussi.
  assert.match(entete, /} else \{[\s\S]{0,220}router\.refresh\(\);/);
});

test("une seule bascule à la fois", () => {
  assert.match(entete, /if \(!reglages \|\| reglageEnCours\) return;/);
  assert.match(entete, /disabled=\{reglageEnCours !== null\}/);
});

test("le volet se ferme : Échap, clic extérieur, navigation", () => {
  assert.match(entete, /e\.key === "Escape"\) fermerMenu\(\)/);
  assert.match(entete, /!menu\.contains\(e\.target as Node\)\) fermerMenu\(\)/);
  const liens = entete.match(/onClick=\{fermerMenu\}/g) ?? [];
  assert.ok(liens.length >= 3, "chaque lien du menu referme le volet");
});

test("l'état de vérification est lisible depuis n'importe quel écran", () => {
  assert.match(entete, /Profil vérifié/);
  assert.match(entete, /Vérification en cours/);
});

test("chaque lien du menu mène à une route qui existe", async () => {
  for (const [href, fichier] of [
    ["/profile", "src/app/(member)/profile/page.tsx"],
    ["/partager", "src/app/partager/page.tsx"],
    ["/aide", "src/app/aide/page.tsx"],
  ]) {
    assert.match(entete, new RegExp(`href="${href}"`));
    await access(fichier);
  }
});
