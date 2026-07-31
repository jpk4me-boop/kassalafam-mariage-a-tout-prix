/**
 * Contrôles structurels du service worker et de la page hors-ligne.
 * `node --test scripts/pwa-offline.test.mjs`
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const SW_PATH = "public/sw.js";
const OFFLINE_PAGE_PATH = "src/app/offline/page.tsx";
const REGISTRATION_PATH = "src/components/pwa/service-worker-registration.tsx";
const LAYOUT_PATH = "src/app/layout.tsx";
const NEXT_CONFIG_PATH = "next.config.ts";

const [sw, offlinePage, registration, layout, nextConfig] = await Promise.all([
  readFile(SW_PATH, "utf8"),
  readFile(OFFLINE_PAGE_PATH, "utf8"),
  readFile(REGISTRATION_PATH, "utf8"),
  readFile(LAYOUT_PATH, "utf8"),
  readFile(NEXT_CONFIG_PATH, "utf8"),
]);

test("le SW ne met jamais les navigations en cache (vie privée)", () => {
  assert.match(sw, /request\.mode === "navigate"/);
  const navigateBlock = sw.slice(
    sw.indexOf('request.mode === "navigate"'),
    sw.indexOf("Assets immuables"),
  );
  assert.doesNotMatch(navigateBlock, /cache\.put|caches\.open/);
});

test("le SW n'intercepte ni /api/, ni non-GET, ni cross-origin", () => {
  assert.match(sw, /request\.method !== "GET"\) return/);
  assert.match(sw, /url\.origin !== self\.location\.origin\) return/);
  assert.match(sw, /url\.pathname\.startsWith\("\/api\/"\)\) return/);
});

test("le SW précache la page hors-ligne et gère son cycle de vie", () => {
  assert.match(sw, /const OFFLINE_URL = "\/offline"/);
  assert.match(sw, /cache\.addAll\(PRECACHE_URLS\)/);
  assert.match(sw, /self\.skipWaiting\(\)/);
  assert.match(sw, /self\.clients\.claim\(\)/);
  assert.match(sw, /caches\.delete\(key\)/);
});

test("le cache-first est limité aux assets immuables et au précache", () => {
  assert.match(sw, /url\.pathname\.startsWith\("\/_next\/static\/"\)/);
  assert.match(sw, /isImmutableAsset\(url\) \|\| isPrecachedUrl\(url\)/);
});

test("la page hors-ligne est statique, non indexée et autonome", () => {
  assert.doesNotMatch(offlinePage, /"use client"/);
  assert.doesNotMatch(offlinePage, /force-dynamic|cookies\(|headers\(/);
  assert.match(offlinePage, /robots: \{ index: false, follow: false \}/);
  // Styles critiques inline : la page doit rester lisible sans CSS externe.
  assert.match(offlinePage, /style=\{\{/);
  assert.match(offlinePage, /Réessayer/);
});

test("l'enregistrement du SW est client, production uniquement, silencieux", () => {
  assert.match(registration, /"use client"/);
  assert.match(registration, /NODE_ENV !== "production"\) return/);
  assert.match(registration, /"serviceWorker" in navigator/);
  assert.match(registration, /\.register\("\/sw\.js"\)\.catch/);
});

test("le layout racine monte l'enregistrement du SW", () => {
  assert.match(layout, /ServiceWorkerRegistration/);
  assert.match(
    layout,
    /import \{ ServiceWorkerRegistration \} from "@\/components\/pwa\/service-worker-registration"/,
  );
});

test("sw.js est servi avec revalidation systématique", () => {
  assert.match(nextConfig, /source: "\/sw\.js"/);
  assert.match(nextConfig, /max-age=0, must-revalidate/);
});
