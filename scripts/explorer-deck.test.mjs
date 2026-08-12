/**
 * Contrôles structurels — Lot F : Explorer (un profil à la fois).
 * `node --test scripts/explorer-deck.test.mjs`
 *
 * Ce que la suite verrouille :
 *   1. l'Explorer est gardé comme la découverte : pas d'ouverture d'un
 *      parcours de profils à un visiteur non connecté ;
 *   2. il ne crée AUCUN chemin d'écriture parallèle — mêmes RPC, via les mêmes
 *      composants que la grille ;
 *   3. la visite reste un geste volontaire : faire défiler n'enregistre rien ;
 *   4. le retour en arrière n'est pas donné gratuitement (candidat Premium) ;
 *   5. aucun écran de rétention, aucun compteur d'essais, aucune fonction non
 *      livrée n'est vendue (règle d'honnêteté) ;
 *   6. la grille reste accessible : l'Explorer s'ajoute, il ne remplace pas.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const lire = async (chemin) => readFile(chemin, "utf8");

const deck = await lire("src/components/member/explorer-deck.tsx");
const feed = await lire("src/components/member/explorer-feed.tsx");
const page = await lire("src/app/(member)/explorer/page.tsx");
const hub = await lire("src/app/(member)/discover/page.tsx");
const grille = await lire("src/components/member/discover-feed.tsx");
const carteEtat = await lire("src/components/member/discovery-state-card.tsx");
const garde = await lire("src/lib/supabase/middleware.ts");

test("la route /explorer est gardée comme /discover", () => {
  const protege = garde.slice(
    garde.indexOf("PROTECTED_PREFIXES"),
    garde.indexOf("AUTH_PREFIXES"),
  );
  assert.match(protege, /"\/explorer"/);

  const membre = garde.slice(
    garde.indexOf("MEMBER_APP_PREFIXES"),
    garde.indexOf("MEMBER_APP_PREFIXES") + 400,
  );
  assert.match(membre, /"\/explorer"/);
});

test("même source et mêmes gardes que la grille", () => {
  assert.match(feed, /loadDiscoveryCandidates\(\{/);
  // Aucun univers imposé : l'Explorer suit la préférence du membre.
  assert.doesNotMatch(feed, /universe:/);
  for (const etat of [
    "needs_verification",
    "needs_gender",
    "needs_universe",
    "unavailable",
  ]) {
    assert.match(feed, new RegExp(etat), `l'état ${etat} est traité`);
  }
  // La carte d'état est partagée, pas recopiée.
  assert.match(feed, /DiscoveryStateCard/);
  assert.match(grille, /DiscoveryStateCard/);
  assert.match(carteEtat, /export function DiscoveryStateCard/);
});

test("aucun chemin d'écriture parallèle : le deck réutilise les composants", () => {
  // L'invariant réel : le deck ne parle JAMAIS à la base directement. Toute
  // écriture passe par un composant déjà livré et déjà testé.
  assert.doesNotMatch(deck, /\.rpc\(/);
  assert.doesNotMatch(deck, /createClient/);
  assert.doesNotMatch(deck, /from\("(profiles|matches|member_favorites)"\)/);
  assert.match(deck, /CandidateDetailsToggle/);
  assert.match(deck, /InterestButton/);
  assert.match(deck, /FavoriteButton/);
});

test("la visite reste volontaire : le détail est remonté à neuf par profil", () => {
  // Sans `key`, le détail déjà ouvert resterait ouvert sur le profil suivant —
  // et afficherait la présentation de quelqu'un d'autre.
  assert.match(deck, /<CandidateDetailsToggle\s+key=\{courant\.id\}/);
  assert.match(page, /seule l’ouverture du détail compte comme\s*\n?\s*une visite/);
});

test("pas de retour en arrière gratuit, mais une reprise complète", () => {
  assert.doesNotMatch(deck, /setIndex\(\s*\(?i\)?\s*=>\s*[^)]*-\s*1/);
  assert.match(deck, /setIndex\(0\)/);
  assert.match(deck, /Reprendre depuis le début/);
});

test("aucun écran de rétention ni compteur d'essais", () => {
  for (const interdit of [
    "Passe Premium",
    "Passer Premium",
    "essais restants",
    "essais gratuits",
    "Attends une seconde",
    "Match IA",
  ]) {
    assert.doesNotMatch(
      deck,
      new RegExp(interdit),
      `l'Explorer ne doit pas afficher « ${interdit} » : non livré`,
    );
  }
});

test("la grille reste accessible depuis l'Explorer, et inversement", () => {
  assert.match(deck, /href="\/discover"/);
  assert.match(hub, /href="\/explorer"/);
  assert.match(hub, /Ouvrir l’Explorer/);
});

test("visite guidée de l'Explorer : cinq étapes, ancres présentes", () => {
  const bloc = deck.slice(
    deck.indexOf("const ETAPES_EXPLORER"),
    deck.indexOf("export function ExplorerDeck"),
  );
  const etapes = bloc.match(/^\s{4}title:/gm) ?? [];
  assert.equal(etapes.length, 5);

  for (const ancre of ["explorer-photo", "explorer-detail", "explorer-actions"]) {
    assert.match(bloc, new RegExp(`anchor: "${ancre}"`));
    assert.match(deck, new RegExp(`data-tour="${ancre}"`));
  }

  // Même témoin que la visite du flux en grille : une seule visite par membre.
  assert.match(feed, /select\("tour_completed_at"\)/);
  assert.match(feed, /let tourCompleted = true;/);
  assert.match(deck, /active=\{!tourCompleted\}/);
});

test("états limites : aucun profil, et fin de parcours", () => {
  assert.match(deck, /Aucun profil compatible pour le moment/);
  assert.match(deck, /Vous avez parcouru tous les profils proposés/);
  assert.match(deck, /Rien n’a été enregistré/);
});
