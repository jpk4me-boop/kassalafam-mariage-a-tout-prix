/**
 * Contrôles structurels — Lot G : atterrissage du nouveau membre.
 * `node --test scripts/dashboard-landing.test.mjs`
 *
 * Ce que la suite verrouille :
 *   1. aucun chiffre inventé : chaque tuile lit une source déjà livrée, et une
 *      lecture en échec n'affiche JAMAIS un zéro rassurant ;
 *   2. le sens ENTRANT des favoris reste au Premium — la tuile compte la liste
 *      du membre, pas ceux qui l'ont ajouté ;
 *   3. le conseil du jour ne contient AUCUN contenu religieux : trois univers
 *      cohabitent sur l'écran le plus fréquenté de l'application ;
 *   4. le bandeau d'atterrissage n'apparaît qu'après la visite guidée, dans une
 *      fenêtre courte, et se referme définitivement ;
 *   5. l'Explorer mène au tableau de bord au bout du parcours.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const lire = async (chemin) => readFile(chemin, "utf8");

const tuiles = await lire("src/components/member/dashboard-quick-access.tsx");
const conseil = await lire("src/components/member/dashboard-daily-tip.tsx");
const bandeau = await lire("src/components/member/dashboard-tour-welcome.tsx");
const tableau = await lire("src/app/(member)/dashboard/page.tsx");
const deck = await lire("src/components/member/explorer-deck.tsx");

test("les quatre tuiles lisent des sources réelles, déjà livrées", () => {
  assert.match(tuiles, /rpc\("list_my_relationships"\)/);
  assert.match(tuiles, /rpc\("count_profile_visitors"\)/);
  assert.match(tuiles, /from\("member_favorites"\)/);
  // Demandes reçues : le filtre exact, pas une approximation.
  assert.match(tuiles, /kind === "received" && r\.status === "pending"/);
});

test("une lecture en échec n'affiche pas un faux zéro", () => {
  assert.match(tuiles, /t\.valeur == null \? "—" : t\.valeur/);
  // L'état initial est « inconnu », pas « zéro ».
  assert.match(tuiles, /useState<Compteurs \| null>\(null\)/);
});

test("le sens ENTRANT des favoris n'est pas donné gratuitement", () => {
  assert.doesNotMatch(tuiles, /list_favorited_by/);
  assert.doesNotMatch(tuiles, /count_favorited_by/);
  // La tuile compte bien la liste du membre lui-même.
  assert.match(tuiles, /\.eq\("user_id", user\.id\)/);
});

test("le conseil du jour ne contient aucun contenu religieux", () => {
  for (const mot of [
    "hadith",
    "coran",
    "bible",
    "sourate",
    "verset",
    "Allah",
    "prière",
    "insha",
    "Dieu",
  ]) {
    assert.doesNotMatch(
      conseil,
      new RegExp(mot, "i"),
      `trois univers cohabitent : « ${mot} » n'a pas sa place sur cet écran`,
    );
  }
});

test("le conseil est stable sur la journée, sans requête ni stockage", () => {
  assert.match(conseil, /Date\.UTC\(/);
  assert.match(conseil, /86_400_000/);
  assert.doesNotMatch(conseil, /createClient|localStorage/);
});

test("le bandeau n'apparaît qu'après la visite, et pas indéfiniment", () => {
  assert.match(bandeau, /if \(!tourCompletedAt\) return;/);
  assert.match(bandeau, /FENETRE_MS = 24 \* 60 \* 60 \* 1000/);
  assert.match(bandeau, /Date\.now\(\) - fin > FENETRE_MS/);
  // Refermable, et la fermeture tient.
  assert.match(bandeau, /localStorage\.setItem\(CLE_REPLI/);
});

test("le tableau de bord monte les trois blocs et alimente le bandeau", () => {
  assert.match(tableau, /<DashboardTourWelcome[\s\S]{0,120}tourCompletedAt=\{tourCompletedAt\}/);
  assert.match(tableau, /<DashboardQuickAccess \/>/);
  assert.match(tableau, /<DashboardDailyTip \/>/);
  assert.match(tableau, /setTourCompletedAt\(\s*\n?\s*profile\?\.tour_completed_at \?\? null,/);
});

test("l'Explorer atterrit sur le tableau de bord", () => {
  const fin = deck.slice(
    deck.indexOf("Vous avez parcouru tous les profils proposés"),
    deck.indexOf("Vue en grille", deck.indexOf("Reprendre depuis le début")),
  );
  assert.match(fin, /href="\/dashboard"/);
  assert.match(fin, /Aller à mon tableau de bord/);
  // Et la dernière bulle de la visite l'annonce.
  assert.match(deck, /votre tableau de bord rassemble visiteurs, demandes/);
});
