/**
 * Contrôles structurels et fonctionnels : contact WhatsApp des VISITEURS.
 * `node --test scripts/public-whatsapp-contact.test.mjs`
 *
 * Point d'entrée public ajouté le 06/08/2026. Deux exigences non négociables :
 *   1. aucun numéro écrit en dur (le dépôt est PUBLIC) ;
 *   2. le bouton ne s'affiche JAMAIS avec une URL cassée : variable absente ou
 *      invalide ⇒ rien du tout.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

/**
 * Retire commentaires de bloc et de ligne : sans cela, une classe citée dans un
 * commentaire ferait échouer une assertion sur le code réel (piège vécu en
 * #104–#105, et de nouveau ici).
 */
function sansCommentaires(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const [helper, button, accueil, vitrine, fiche, promo, partage, aide, envExample] =
  await Promise.all([
    readFile("src/lib/contact/whatsapp-contact.ts", "utf8"),
    readFile("src/components/public/whatsapp-contact-button.tsx", "utf8"),
    readFile("src/app/page.tsx", "utf8"),
    readFile("src/app/candidats/page.tsx", "utf8"),
    readFile("src/app/candidats/[slug]/page.tsx", "utf8"),
    readFile("src/app/promo/[token]/page.tsx", "utf8"),
    readFile("src/app/p/[token]/page.tsx", "utf8"),
    readFile("src/app/aide/page.tsx", "utf8"),
    readFile(".env.example", "utf8"),
  ]);

// --- Structure ---------------------------------------------------------------

test("aucun numéro de téléphone n'est écrit en dur", () => {
  // Le dépôt est public : un numéro dans le code y resterait pour toujours.
  for (const [nom, source] of [
    ["helper", helper],
    ["bouton", button],
  ]) {
    assert.doesNotMatch(
      source,
      /\b\d{8,15}\b/,
      `${nom} : suite de chiffres suspecte, le numéro doit venir de l'environnement`,
    );
    assert.doesNotMatch(source, /wa\.me\/\d/, `${nom} : URL wa.me figée`);
  }
  assert.match(
    button,
    /process\.env\.NEXT_PUBLIC_WHATSAPP_CONTACT/,
    "le numéro doit être lu dans l'environnement",
  );
});

test("la variable d'environnement est documentée", () => {
  assert.match(envExample, /NEXT_PUBLIC_WHATSAPP_CONTACT=/);
  assert.match(
    envExample,
    /SIM DÉDIÉE/,
    "le fichier d'exemple doit rappeler de ne pas utiliser le numéro personnel",
  );
});

test("le bouton disparaît proprement si le numéro manque", () => {
  assert.match(
    button,
    /if \(!href\) return null;/,
    "aucun rendu sans URL exploitable",
  );
});

test("le bouton n'entre pas en collision avec les boutons de défilement", () => {
  // ScrollButtons occupe le bas à droite du layout racine, en z-40.
  const code = sansCommentaires(button);
  assert.match(code, /\bfixed\b/);
  assert.match(code, /\bleft-4\b/, "le contact WhatsApp va à GAUCHE");
  assert.doesNotMatch(code, /\bright-4\b/, "la droite est déjà prise");
  assert.match(code, /\bz-30\b/, "sous les boutons de défilement");
});

test("le lien externe est sécurisé et annoncé aux lecteurs d'écran", () => {
  assert.match(button, /target="_blank"/);
  assert.match(button, /rel="noopener noreferrer"/);
  assert.match(button, /aria-label="Nous écrire sur WhatsApp"/);
});

test("le bouton est monté sur les pages publiques, avec le bon contexte", () => {
  const attendu = [
    ["accueil", accueil, "accueil"],
    ["/candidats", vitrine, "vitrine"],
    ["/candidats/[slug]", fiche, "vitrine"],
    ["/promo/[token]", promo, "profil-partage"],
    ["/p/[token]", partage, "profil-partage"],
    ["/aide", aide, "aide"],
  ];

  for (const [nom, source, contexte] of attendu) {
    assert.match(
      source,
      /import \{ WhatsappContactButton \}/,
      `${nom} : import manquant`,
    );
    assert.match(
      source,
      new RegExp(`<WhatsappContactButton context="${contexte}" />`),
      `${nom} : contexte attendu « ${contexte} »`,
    );
  }
});

test("l'espace membre et l'admin ne reçoivent PAS ce bouton", async () => {
  // Les membres ont déjà leurs propres points de contact ; ce bouton est un
  // levier d'acquisition, il n'a rien à faire derrière l'authentification.
  async function fichiersDe(racine) {
    const entrees = await readdir(racine, {
      recursive: true,
      withFileTypes: true,
    });
    return entrees
      .filter((e) => e.isFile() && e.name.endsWith(".tsx"))
      .map((e) => `${e.parentPath ?? e.path}/${e.name}`);
  }

  const chemins = [
    ...(await fichiersDe("src/app/(member)")),
    ...(await fichiersDe("src/app/admin")),
  ];
  assert.ok(chemins.length > 10, "le balayage doit trouver les pages protégées");

  for (const chemin of chemins) {
    const source = await readFile(chemin, "utf8");
    assert.doesNotMatch(
      source,
      /WhatsappContactButton/,
      `${chemin} ne doit pas monter le bouton visiteur`,
    );
  }
});

test("la page d'aide mentionne WhatsApp dans « Nous contacter »", () => {
  assert.match(aide, /nous écrire sur WhatsApp/i);
});

// --- Logique pure du helper --------------------------------------------------

const TYPE_ANNOTATION =
  /:\s*(Record<[^>]*>|WhatsappContactContext|string \| null|string \| undefined|string|null)/g;

function loadHelper() {
  const js = helper
    .replace(/export type [\s\S]*?;\n/g, "")
    .replace(/export (const|function)/g, "$1")
    .replace(TYPE_ANNOTATION, "");
  return new Function(
    `${js}; return { normalizeWhatsappNumber, buildWhatsappContactUrl, WHATSAPP_CONTACT_MESSAGES };`,
  )();
}

test("le numéro est normalisé quel que soit le format saisi", () => {
  const { normalizeWhatsappNumber } = loadHelper();

  assert.equal(normalizeWhatsappNumber("237691849494"), "237691849494");
  assert.equal(normalizeWhatsappNumber("+237 691 84 94 94"), "237691849494");
  assert.equal(normalizeWhatsappNumber("00237691849494"), "237691849494");
  assert.equal(normalizeWhatsappNumber("(237) 691-84-94-94"), "237691849494");
});

test("un numéro inexploitable ne produit JAMAIS d'URL", () => {
  const { normalizeWhatsappNumber, buildWhatsappContactUrl } = loadHelper();

  for (const invalide of [undefined, "", "   ", "12345", "abc", "+", "00"]) {
    assert.equal(
      normalizeWhatsappNumber(invalide),
      null,
      `« ${invalide} » devrait être rejeté`,
    );
    assert.equal(buildWhatsappContactUrl(invalide, "accueil"), null);
  }

  // Trop long : au-delà de 15 chiffres on n'est plus dans E.164.
  assert.equal(normalizeWhatsappNumber("1".repeat(16)), null);
});

test("l'URL porte le message d'amorce encodé", () => {
  const { buildWhatsappContactUrl } = loadHelper();

  const url = buildWhatsappContactUrl("+237691849494", "vitrine");
  assert.ok(url.startsWith("https://wa.me/237691849494?text="));
  assert.ok(!url.includes(" "), "le message doit être encodé");
  assert.match(decodeURIComponent(url), /profils sur KASSALAFAM/);
});

test("chaque contexte a son propre message, écrit du côté du visiteur", () => {
  const { WHATSAPP_CONTACT_MESSAGES } = loadHelper();

  const messages = Object.values(WHATSAPP_CONTACT_MESSAGES);
  assert.equal(messages.length, 4);
  assert.equal(
    new Set(messages).size,
    4,
    "des messages identiques feraient un envoi en rafale, cf. garde-fou 3 du §5.4",
  );

  for (const m of messages) {
    assert.match(m, /^Bonjour/, "un message d'amorce reste poli et court");
    assert.ok(m.length <= 120, `message trop long : ${m}`);
  }
});

test("un contexte inconnu retombe sur le message d'accueil", () => {
  const { buildWhatsappContactUrl, WHATSAPP_CONTACT_MESSAGES } = loadHelper();

  const url = buildWhatsappContactUrl("237691849494", "contexte_futur");
  assert.equal(
    decodeURIComponent(url.split("?text=")[1]),
    WHATSAPP_CONTACT_MESSAGES.accueil,
  );
});
