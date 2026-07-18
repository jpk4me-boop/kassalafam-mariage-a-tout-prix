/**
 * Analytique first-party — Tests des helpers PURS (node:test, AUCUNE
 * dépendance : `node --test scripts/analytics.test.mjs`).
 *
 * Node ≥ 23.6 exécute nativement les modules TypeScript importés ci-dessous
 * (type stripping) : les tests portent sur les MODULES RÉELS du dépôt.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  normalizePath,
  extractUtmParams,
  referrerDomain,
  isAnalyticsEventType,
  ANALYTICS_EVENT_TYPES,
  PATH_GROUP_MAX_LENGTH,
} from "../src/lib/analytics/path-normalization.ts";
import {
  presenceInfo,
  ONLINE_THRESHOLD_SECONDS,
} from "../src/lib/admin/presence.ts";

const UUID = "4d874d79-1c2e-4a5b-9f0e-123456789abc";

// ---------------------------------------------------------------------------
// Normalisation des routes
// ---------------------------------------------------------------------------
test("les routes statiques sont conservées telles quelles", () => {
  assert.equal(normalizePath("/"), "/");
  assert.equal(normalizePath("/register"), "/register");
  assert.equal(normalizePath("/login"), "/login");
  assert.equal(normalizePath("/discover/chretien"), "/discover/chretien");
  assert.equal(normalizePath("/admin/members"), "/admin/members");
});

test("les UUID de match et de membre sont remplacés par leur paramètre", () => {
  assert.equal(normalizePath(`/matches/${UUID}`), "/matches/[matchId]");
  assert.equal(
    normalizePath(`/admin/members/${UUID}`),
    "/admin/members/[profileId]",
  );
});

test("les tokens de partage public disparaissent, photo incluse", () => {
  assert.equal(normalizePath("/p/un-token-secret"), "/p/[token]");
  assert.equal(normalizePath("/p/Tok3n_aleatoire/photo"), "/p/[token]/photo");
});

test("un UUID sur une route inconnue est anonymisé génériquement", () => {
  assert.equal(normalizePath(`/quelconque/${UUID}`), "/quelconque/[id]");
});

test("la query string et le fragment ne sont JAMAIS conservés", () => {
  assert.equal(
    normalizePath("/register?redirect=/admin&email=a@b.c#section"),
    "/register",
  );
});

test("les chemins non exploitables sont rejetés (null → rien n'est envoyé)", () => {
  assert.equal(normalizePath(""), null);
  assert.equal(normalizePath("pas-un-chemin"), null);
  assert.equal(normalizePath("/segment%20encodé"), null);
  assert.equal(normalizePath(`/${"a".repeat(PATH_GROUP_MAX_LENGTH + 1)}`), null);
});

test("le résultat ne contient jamais d'UUID brut", () => {
  const cases = [`/matches/${UUID}`, `/x/${UUID}`, `/admin/members/${UUID}`];
  for (const c of cases) {
    const normalized = normalizePath(c);
    assert.ok(normalized !== null);
    assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}/i.test(normalized), normalized);
  }
});

// ---------------------------------------------------------------------------
// Extraction UTM (allowlist stricte)
// ---------------------------------------------------------------------------
test("seuls les paramètres UTM de l'allowlist sont extraits", () => {
  const utm = extractUtmParams(
    "?utm_source=Facebook&utm_medium=social&utm_campaign=test&redirect=/admin&email=a@b.c&q=recherche+privee",
  );
  assert.deepEqual(utm, {
    utm_source: "facebook",
    utm_medium: "social",
    utm_campaign: "test",
  });
});

test("une valeur UTM hors bornes ou charset est ignorée", () => {
  assert.deepEqual(extractUtmParams(`?utm_source=${"x".repeat(200)}`), {});
  assert.deepEqual(extractUtmParams("?utm_source=<script>"), {});
  assert.deepEqual(extractUtmParams(""), {});
});

// ---------------------------------------------------------------------------
// Référent : hostname uniquement
// ---------------------------------------------------------------------------
test("le référent est réduit au hostname", () => {
  assert.equal(
    referrerDomain("https://www.facebook.com/groups/1234/post/5678?x=1"),
    "www.facebook.com",
  );
});

test("auto-référence et référents invalides → null", () => {
  assert.equal(referrerDomain("https://kassalafam.com/page", "kassalafam.com"), null);
  assert.equal(referrerDomain("pas-une-url"), null);
  assert.equal(referrerDomain(""), null);
});

// ---------------------------------------------------------------------------
// Événements autorisés
// ---------------------------------------------------------------------------
test("l'allowlist d'événements est exactement celle du MVP", () => {
  assert.deepEqual(
    [...ANALYTICS_EVENT_TYPES],
    ["page_view", "registration_started", "login_succeeded"],
  );
  assert.ok(isAnalyticsEventType("page_view"));
  assert.ok(!isAnalyticsEventType("profile_viewed"));
  assert.ok(!isAnalyticsEventType("heartbeat"));
});

// ---------------------------------------------------------------------------
// Présence & dates relatives
// ---------------------------------------------------------------------------
test("le seuil « en ligne » est de 2 minutes", () => {
  assert.equal(ONLINE_THRESHOLD_SECONDS, 120);
  const now = new Date("2026-07-18T12:00:00Z");
  const online = presenceInfo("2026-07-18T11:58:30Z", now);
  assert.equal(online.online, true);
  assert.equal(online.label, "En ligne");
  const offline = presenceInfo("2026-07-18T11:57:59Z", now);
  assert.equal(offline.online, false);
});

test("les libellés relatifs sont corrects (min, h, hier, jours, jamais)", () => {
  const now = new Date("2026-07-18T12:00:00Z");
  assert.equal(presenceInfo("2026-07-18T11:55:00Z", now).label, "Actif il y a 5 min");
  assert.equal(presenceInfo("2026-07-18T09:00:00Z", now).label, "Actif il y a 3 h");
  assert.equal(presenceInfo("2026-07-17T08:00:00Z", now).label, "Actif hier");
  assert.equal(presenceInfo("2026-07-10T08:00:00Z", now).label, "Actif il y a 8 j");
  assert.equal(presenceInfo(null, now).label, "Jamais vu");
  assert.equal(presenceInfo(null, now).absolute, null);
});

test("l'horodatage absolu est fourni pour le title", () => {
  const now = new Date("2026-07-18T12:00:00Z");
  const info = presenceInfo("2026-07-18T11:55:00Z", now);
  assert.ok(info.absolute && info.absolute.length > 0);
});
