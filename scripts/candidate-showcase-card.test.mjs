/**
 * Contrôles structurels : carte membre de la vitrine publique /candidats.
 * `node --test scripts/candidate-showcase-card.test.mjs`
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [card, profilePage, types] = await Promise.all([
  readFile("src/components/member/candidate-showcase-card.tsx", "utf8"),
  readFile("src/app/(member)/profile/page.tsx", "utf8"),
  readFile("src/lib/types/database.ts", "utf8"),
]);

test("la carte est montée sur /profile", () => {
  assert.match(profilePage, /CandidateShowcaseCard/);
  assert.match(
    profilePage,
    /import \{ CandidateShowcaseCard \} from "@\/components\/member\/candidate-showcase-card"/,
  );
});

test("les quatre RPC membre sont câblées, aucune autre", () => {
  for (const rpc of [
    "get_my_candidate_showcase_status",
    "grant_my_candidate_showcase_consent",
    "withdraw_my_candidate_showcase_consent",
    "publish_my_candidate_showcase",
    "unpublish_my_candidate_showcase",
  ]) {
    assert.match(card, new RegExp(rpc), `RPC non câblée : ${rpc}`);
  }

  // La fonction d'éligibilité est INTERNE : elle n'est pas exécutable par le
  // membre et ne doit jamais être appelée depuis le client.
  assert.doesNotMatch(card, /candidate_showcase_eligibility_reason\s*"/);
  assert.doesNotMatch(card, /rpc\(\s*"candidate_showcase_eligibility_reason"/);
});

test("publication et consentement sont DEUX gestes distincts", () => {
  assert.match(card, /J’autorise la présentation publique/);
  assert.match(card, /Publier mon profil/);
  // Le bouton de publication n'apparaît qu'une fois le consentement actif.
  assert.match(
    card,
    /status\.consentActive && !status\.effectivelyPublic/,
  );
});

test("le retrait reste accessible en permanence", () => {
  assert.match(card, /Retirer mon autorisation/);
  assert.match(card, /Me retirer de la vitrine/);
  assert.match(card, /runRpc\("withdraw"\)/);
  assert.match(card, /runRpc\("unpublish"\)/);
});

test("chaque motif d'inéligibilité est traduit en français", () => {
  for (const reason of [
    "account_suspended",
    "verification_required",
    "onboarding_incomplete",
    "profile_incomplete",
    "photo_privacy_enabled",
    "consent_required",
    "photo_required",
    "photo_invalid",
    "profile_not_found",
  ]) {
    assert.match(card, new RegExp(`${reason}:`), `motif non traduit : ${reason}`);
  }

  // Motif inconnu : message générique, jamais de blocage silencieux.
  assert.match(card, /ne remplit pas encore les conditions/);
});

test("le frein du floutage est expliqué avec l'action à faire", () => {
  assert.match(card, /floutées par défaut/);
  assert.match(card, /votre photo doit être visible/);
});

test("la base reste l'autorité : le statut est relu après chaque action", () => {
  // Aucun état deviné côté client après une RPC.
  assert.match(card, /\/\/ La base reste l'autorité/);
  const reloads = card.match(/await fetchShowcaseState\(\);/g) ?? [];
  assert.ok(reloads.length >= 2, "le statut doit être relu après chaque RPC");
});

test("aucun setState n'est appelé dans le corps d'un effet", () => {
  // La récupération est PURE et définie hors du composant ; l'effet applique
  // le résultat dans un callback de promesse (react-hooks/set-state-in-effect).
  assert.match(card, /async function fetchShowcaseState\(\): Promise<LoadedShowcase>/);
  assert.match(card, /\.then\(\(loaded\) => \{/);
  assert.match(card, /if \(mounted\) applyLoaded\(loaded\)/);
  // fetchShowcaseState ne doit toucher aucun état React.
  const fetcher = card.slice(
    card.indexOf("async function fetchShowcaseState"),
    card.indexOf("export function CandidateShowcaseCard"),
  );
  assert.doesNotMatch(fetcher, /setState|setPhotos|setError|setSelectedPhotoId/);
});

test("le publier est verrouillé tant que la base ne dit pas éligible", () => {
  assert.match(card, /disabled=\{pending \|\| !selectedPhotoId \|\| !isEligible\}/);
  assert.match(card, /const isEligible = reason === "eligible"/);
});

test("les types des RPC vitrine sont déclarés", () => {
  assert.match(types, /CandidateShowcaseStatusRow/);
  assert.match(types, /GrantCandidateShowcaseConsentResult/);
  assert.match(types, /WithdrawCandidateShowcaseConsentResult/);
  assert.match(types, /PublishCandidateShowcaseResult/);
  assert.match(types, /get_my_candidate_showcase_status: \{/);
  assert.match(types, /publish_my_candidate_showcase: \{/);
});
