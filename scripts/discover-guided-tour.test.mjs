/**
 * Contrôles structurels — Lot E : visite guidée du premier passage.
 * `node --test scripts/discover-guided-tour.test.mjs`
 *
 * Ce que la suite verrouille :
 *   1. la visite est mémorisée par PERSONNE (colonne en base) et non par
 *      navigateur — le localStorage n'est qu'un filet anti-clignotement ;
 *   2. chaque étape ancrée pointe une ancre qui EXISTE vraiment dans le flux ;
 *   3. on peut toujours sortir : « Passer la visite » à chaque étape et Échap ;
 *   4. une lecture de témoin en échec ne rejoue JAMAIS la visite ;
 *   5. règle d'honnêteté : la visite dit que « Voir plus » enregistre une
 *      visite visible par l'autre membre, et ne promet aucune fonction absente ;
 *   6. un enregistrement de profil ne touche pas au témoin.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const lire = async (chemin) => readFile(chemin, "utf8");

const visite = await lire("src/components/member/guided-tour.tsx");
const flux = await lire("src/components/member/discover-feed-view.tsx");
const fluxServeur = await lire("src/components/member/discover-feed.tsx");
const relance = await lire("src/components/member/replay-tour-button.tsx");
const pageProfil = await lire("src/app/(member)/profile/page.tsx");
const types = await lire("src/lib/types/database.ts");
const migration = await lire(
  "supabase/migrations/20260812060000_add_profile_tour_completed_at.sql",
);

test("le témoin de fin vit en base, pas seulement dans le navigateur", () => {
  assert.match(visite, /from\("profiles"\)/);
  assert.match(visite, /tour_completed_at: new Date\(\)\.toISOString\(\)/);
  // Le repli local existe, mais il n'est qu'un filet.
  assert.match(visite, /localStorage\.setItem/);
  assert.match(migration, /add column if not exists tour_completed_at timestamptz/);
});

test("l'ancien bandeau mémorisé par navigateur a bien été retiré", () => {
  assert.doesNotMatch(flux, /kassalafam_discover_tuto_dismissed/);
  assert.doesNotMatch(flux, /TUTO_KEY/);
});

/** Le bloc littéral des étapes, isolé du reste du fichier. */
const blocEtapes = flux.slice(
  flux.indexOf("const ETAPES_VISITE"),
  flux.indexOf("const MARITAL_LABEL"),
);

test("six étapes, et chaque ancre citée existe dans le flux", () => {
  const etapes = blocEtapes.match(/^\s{4}title:/gm) ?? [];
  assert.equal(etapes.length, 6, "la visite compte six bulles");

  for (const ancre of ["photo", "voir-plus", "interet", "favori"]) {
    assert.match(
      flux,
      new RegExp(`anchor: "${ancre}"`),
      `l'étape ${ancre} est déclarée`,
    );
    assert.match(
      flux,
      new RegExp(`data-tour=\\{i === 0 \\? "${ancre}"`),
      `l'ancre ${ancre} existe dans le JSX, sur la première carte seulement`,
    );
  }
});

test("les enveloppes d'ancre ne cassent pas l'étirement des boutons", () => {
  // Un bouton `inline-flex` sorti de la colonne parente se rétrécit : chaque
  // enveloppe doit reformer une colonne.
  const enveloppes =
    flux.match(
      /<div\s+data-tour=\{i === 0 \? "(?:voir-plus|interet|favori)"[\s\S]*?>/g,
    ) ?? [];
  assert.equal(enveloppes.length, 3);
  for (const e of enveloppes) {
    assert.match(e, /className="flex flex-col"/);
  }
});

test("on peut toujours sortir : « Passer la visite » et la touche Échap", () => {
  assert.match(visite, /Passer la visite/);
  assert.match(visite, /derniere \? null : \(/);
  assert.match(visite, /e\.key === "Escape"[\s\S]{0,120}terminer\(\)/);
});

test("une ancre absente ne fige pas la visite", () => {
  assert.match(visite, /if \(!cible\) \{\s*\n\s*setSpot\(null\);/);
});

test("le halo reste dans l'écran, quelle que soit la taille de l'ancre", () => {
  // Constaté en production : une photo de carte mesure 596 × 1059 px dans une
  // fenêtre de 855 px. Sans borne, le trou déborde et le voile disparaît.
  assert.match(visite, /const hauteurMax = Math\.round\(vh \* 0\.5\)/);
  assert.match(visite, /Math\.min\(hauteurVoulue, hauteurMax\)/);
  assert.match(visite, /Math\.min\(largeurVoulue, vw - MARGE \* 2\)/);
  // Et un élément plus haut que l'écran est amené par le haut, pas centré.
  assert.match(visite, /block: grand \? "start" : "center"/);
});

test("la bulle ne recouvre jamais ce qu'elle désigne", () => {
  assert.match(visite, /const placeDessous =/);
  assert.match(visite, /const placeDessus =/);
  // Dernier recours sur écran court : la bulle se pose en bas, pas sur le halo.
  assert.match(visite, /bottom: 16,/);
});

test("les gabarits du voile ne laissent filtrer aucune donnée", () => {
  // Le composant ne reçoit que des textes et un booléen.
  assert.match(visite, /steps: TourStep\[\]/);
  assert.match(visite, /active: boolean/);
  for (const interdit of ["signedUrl", "first_name", "birth_date"]) {
    assert.doesNotMatch(visite, new RegExp(interdit));
  }
});

test("un témoin illisible côté serveur ne rejoue pas la visite", () => {
  assert.match(fluxServeur, /let tourCompleted = true;/);
  assert.match(fluxServeur, /select\("tour_completed_at"\)/);
  assert.match(fluxServeur, /tourCompleted=\{tourCompleted\}/);
  // Défaut prudent aussi côté vue.
  assert.match(flux, /tourCompleted = true,/);
});

test("règle d'honnêteté : la visite annonce que « Voir plus » est une visite", () => {
  assert.match(flux, /compte comme une visite/);
  // Aucune fonction non livrée n'est promise dans les bulles.
  for (const interdit of ["en ligne", "vocal", "Message Flash", "message flash"]) {
    assert.doesNotMatch(
      flux.slice(0, flux.indexOf("const MARITAL_LABEL")),
      new RegExp(interdit),
      `la visite ne doit pas évoquer « ${interdit} » : ce n'est pas livré`,
    );
  }
});

test("« Revoir la visite guidée » remet à NULL et efface le repli local", () => {
  assert.match(relance, /tour_completed_at: null/);
  assert.match(relance, /localStorage\.removeItem/);
  assert.match(pageProfil, /<ReplayTourButton \/>/);
  // Hors du formulaire : il ne déclenche pas l'enregistrement du profil.
  assert.match(pageProfil, /<\/form>[\s\S]{0,400}<ReplayTourButton \/>/);
});

test("un enregistrement de profil ne touche jamais au témoin", () => {
  assert.doesNotMatch(pageProfil, /tour_completed_at: form\./);
  assert.doesNotMatch(
    pageProfil,
    /profilePayload[\s\S]{0,4000}tour_completed_at/,
  );
});

test("les types annoncent la colonne, en lecture et en écriture", () => {
  assert.match(types, /tour_completed_at: string \| null;/);
  assert.match(types, /tour_completed_at\?: string \| null;/);
});
