/**
 * Contrôles structurels de la navigation rapide : Accueil vs Tableau de bord,
 * flèche Retour et boutons de défilement.
 * `node --test scripts/navigation-quick-access.test.mjs`
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [
  layout,
  scrollButtons,
  dashboardLink,
  backButton,
  memberHeader,
  pageBackNav,
  legalShell,
  partager,
] = await Promise.all([
  readFile("src/app/layout.tsx", "utf8"),
  readFile("src/components/navigation/scroll-buttons.tsx", "utf8"),
  readFile("src/components/navigation/member-dashboard-link.tsx", "utf8"),
  readFile("src/components/navigation/back-button.tsx", "utf8"),
  readFile("src/components/member/member-header.tsx", "utf8"),
  readFile("src/components/member/page-back-nav.tsx", "utf8"),
  readFile("src/components/legal/legal-page-shell.tsx", "utf8"),
  readFile("src/app/partager/page.tsx", "utf8"),
]);

test("le header membre distingue Accueil (/) et Tableau de bord (/dashboard)", () => {
  assert.match(memberHeader, /label: "Accueil",\s*\n\s*href: "\/",/);
  assert.match(memberHeader, /label: "Tableau de bord",\s*\n\s*href: "\/dashboard",/);
  assert.doesNotMatch(memberHeader, /label: "Accueil",\s*\n\s*href: "\/dashboard"/);
});

test("PageBackNav offre Retour, Accueil et Tableau de bord", () => {
  assert.match(pageBackNav, /Retour/);
  assert.match(pageBackNav, /href="\/"/);
  assert.match(pageBackNav, /href="\/dashboard"/);
  assert.match(pageBackNav, /Tableau de bord/);
  assert.doesNotMatch(pageBackNav, />\s*Dashboard\s*</);
});

test("le gabarit des pages légales intègre Retour, Accueil et Tableau de bord", () => {
  assert.match(legalShell, /BackButton/);
  assert.match(legalShell, /MemberDashboardLink/);
  assert.match(legalShell, /Accueil/);
});

test("la page /partager offre l'accès au Tableau de bord aux membres", () => {
  assert.match(partager, /MemberDashboardLink/);
});

test("les boutons de défilement sont montés dans le layout racine", () => {
  assert.match(layout, /ScrollButtons/);
  assert.match(
    layout,
    /import \{ ScrollButtons \} from "@\/components\/navigation\/scroll-buttons"/,
  );
});

test("les boutons de défilement sont accessibles et sans logique d'auth", () => {
  assert.match(scrollButtons, /"use client"/);
  assert.match(scrollButtons, /aria-label="Vers le haut"/);
  assert.match(scrollButtons, /aria-label="Vers le bas"/);
  assert.doesNotMatch(scrollButtons, /supabase|createClient/);
});

test("le lien Tableau de bord public est réservé aux sessions membres", () => {
  assert.match(dashboardLink, /"use client"/);
  assert.match(dashboardLink, /auth\.getSession\(\)/);
  assert.match(dashboardLink, /if \(!isMember\) return null;/);
  assert.match(dashboardLink, /href="\/dashboard"/);
});

test("la flèche Retour replie proprement sans historique", () => {
  assert.match(backButton, /"use client"/);
  assert.match(backButton, /window\.history\.length > 1/);
  assert.match(backButton, /router\.back\(\)/);
  assert.match(backButton, /fallbackHref/);
});
