/**
 * Contrôles structurels du bouton « Installer l'application » (PWA).
 * `node --test scripts/pwa-install.test.mjs`
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const CARD_PATH = "src/components/pwa/install-app-button.tsx";
const PARTAGER_PATH = "src/app/partager/page.tsx";

const [card, partager] = await Promise.all([
  readFile(CARD_PATH, "utf8"),
  readFile(PARTAGER_PATH, "utf8"),
]);

test("la carte est un composant client qui capture beforeinstallprompt", () => {
  assert.match(card, /^"use client";/);
  assert.match(card, /addEventListener\("beforeinstallprompt"/);
  // Jamais de mini-infobar : l'événement est intercepté.
  assert.match(card, /event\.preventDefault\(\)/);
});

test("la carte disparaît si l'app est installée ou déjà en standalone", () => {
  assert.match(card, /matchMedia\("\(display-mode: standalone\)"\)/);
  assert.match(card, /addEventListener\("appinstalled"/);
});

test("prompt() est consommé une seule fois, sans jamais bloquer", () => {
  // L'événement est retiré de l'état AVANT l'appel à prompt().
  assert.match(card, /setInstallEvent\(null\);\s*\n\s*try \{\s*\n\s*await installEvent\.prompt\(\)/);
  assert.match(card, /await installEvent\.userChoice/);
  assert.match(card, /catch \{/);
});

test("amélioration progressive : rien n'est rendu sans invite disponible", () => {
  assert.match(card, /if \(!installEvent\) return null;/);
  // Aucun stockage persistant : uniquement l'état React.
  assert.doesNotMatch(card, /localStorage|sessionStorage/);
});

test("les écouteurs sont retirés au démontage", () => {
  assert.match(card, /removeEventListener\("beforeinstallprompt"/);
  assert.match(card, /removeEventListener\("appinstalled"/);
});

test("la page /partager rend la carte d'installation", () => {
  assert.match(partager, /import \{ InstallAppCard \} from "@\/components\/pwa\/install-app-button"/);
  assert.match(partager, /<InstallAppCard/);
});
