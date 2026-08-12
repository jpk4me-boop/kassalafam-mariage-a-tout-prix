/**
 * Contrôles structurels — Lot B2 : état verrouillé des signaux entrants.
 * `node --test scripts/premium-locked-signals.test.mjs`
 *
 * Ce que la suite verrouille :
 *   1. un membre gratuit ne doit JAMAIS lire « aucune visite » alors que des
 *      visites existent — le verrou s'affiche dès que le compteur est > 0 ;
 *   2. le panneau verrouillé ne reçoit qu'un ENTIER, aucune donnée personnelle ;
 *   3. la liste SORTANTE des favoris reste appelée sans condition ;
 *   4. les favoris ENTRANTS n'offrent aucun bouton de retrait : ils
 *      appartiennent aux autres membres ;
 *   5. le réglage discreet_favorites a bien un interrupteur, câblé de bout
 *      en bout (état, chargement, enregistrement).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const lire = async (chemin) => readFile(chemin, "utf8");

const panneau = await lire("src/components/member/premium-locked-signal.tsx");
const pageVisiteurs = await lire("src/app/(member)/visitors/page.tsx");
const pageFavoris = await lire("src/app/(member)/favorites/page.tsx");
const vueEntrants = await lire("src/components/member/favorited-by-view.tsx");
const pageProfil = await lire("src/app/(member)/profile/page.tsx");
const types = await lire("src/lib/types/database.ts");

test("le panneau verrouillé ne reçoit qu'un entier et des libellés", () => {
  // Les seules props admises : le compte et trois textes.
  assert.match(panneau, /count:\s*number/);
  assert.match(panneau, /title:\s*string/);
  assert.match(panneau, /description:\s*string/);
  assert.match(panneau, /ctaLabel:\s*string/);
  // Aucune donnée de profil ne doit transiter par ce composant.
  for (const interdit of [
    "signedUrl",
    "first_name",
    "whatsapp",
    "birth_date",
    "pseudo",
  ]) {
    assert.doesNotMatch(
      panneau,
      new RegExp(interdit),
      `le panneau verrouillé ne doit pas connaître ${interdit}`,
    );
  }
});

test("le panneau verrouillé annonce le nombre réel et mène à /premium", () => {
  assert.match(panneau, /\{count\}/);
  assert.match(panneau, /href="\/premium"/);
});

test("les gabarits floutés sont vides : aucun profil réel n'est rendu flou", () => {
  assert.match(panneau, /Array\.from\(\{\s*length:\s*apercus\s*\}/);
  assert.match(panneau, /aria-hidden="true"/);
});

test("/visitors : le verrou n'apparaît QUE si la liste est vide ET le compteur > 0", () => {
  assert.match(pageVisiteurs, /count_profile_visitors/);
  assert.match(
    pageVisiteurs,
    /visitors\.length === 0 && visitorCount > 0[\s\S]{0,200}PremiumLockedSignal/,
  );
});

test("/visitors : un compteur en échec ne casse pas la page", () => {
  assert.match(pageVisiteurs, /countError[\s\S]{0,240}console\.error/);
  assert.doesNotMatch(pageVisiteurs, /countError[\s\S]{0,120}loadFailed = true/);
});

test("/favorites : la liste SORTANTE reste appelée sans condition", () => {
  assert.match(pageFavoris, /rpc\("list_favorites"\)/);
  // Le sens entrant est distinct et ne conditionne pas le sortant.
  assert.match(pageFavoris, /rpc\("list_favorited_by"\)/);
  assert.match(pageFavoris, /"count_favorited_by"/);
  assert.match(
    pageFavoris,
    /admirers\.length === 0 && admirerCount > 0[\s\S]{0,200}PremiumLockedSignal/,
  );
});

test("/favorites : un échec du sens entrant ne prive pas le membre de sa liste", () => {
  assert.match(pageFavoris, /admirersFailed/);
  assert.doesNotMatch(pageFavoris, /admirerError[\s\S]{0,120}loadFailed = true/);
});

test("les favoris ENTRANTS n'offrent aucun retrait", () => {
  assert.doesNotMatch(vueEntrants, /FavoriteButton/);
  assert.doesNotMatch(vueEntrants, /add_favorite/);
  assert.match(vueEntrants, /Vous a ajouté le/);
});

test("discreet_favorites est câblé de bout en bout dans /profile", () => {
  // État, valeur par défaut, chargement, enregistrement, interrupteur.
  assert.match(pageProfil, /discreet_favorites: boolean;/);
  assert.match(pageProfil, /discreet_favorites: false,/);
  assert.match(pageProfil, /profile\.discreet_favorites \?\? false/);
  assert.match(pageProfil, /discreet_favorites: form\.discreet_favorites/);
  assert.match(
    pageProfil,
    /checked=\{form\.discreet_favorites\}[\s\S]{0,500}Favoris discrets/,
  );
});

test("les types annoncent les nouvelles RPC et le nouveau réglage", () => {
  assert.match(types, /discreet_favorites: boolean;/);
  assert.match(types, /count_profile_visitors: \{/);
  assert.match(types, /list_favorited_by: \{/);
  assert.match(types, /count_favorited_by: \{/);
});
