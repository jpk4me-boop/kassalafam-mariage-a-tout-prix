import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/**
 * En-tête membre — non-débordement horizontal sur mobile.
 *
 * Incident du 06/08/2026 : sur un écran de 360 px, la rangée du haut mesurait
 * ~450 px. Le logo (`shrink-0`) et sa baseline `tracking-[0.28em]` poussaient
 * les actions hors de l'écran, ce qui rendait TOUTE la page scrollable
 * horizontalement — la barre d'onglets comprise.
 *
 * Ces tests verrouillent les invariants de mise en page qui empêchent le
 * débordement de revenir. Ils sont structurels (lecture + regex) : aucun rendu.
 */

const HEADER = "src/components/member/member-header.tsx";
const LOGO = "src/components/landing/logo.tsx";

async function readSource(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

function mobileNavBlock(source) {
  const start = source.indexOf('aria-label="Navigation membre mobile"');
  assert.notEqual(start, -1, "la nav mobile doit exister");

  const end = source.indexOf("</nav>", start);
  assert.notEqual(end, -1, "la nav mobile doit être fermée");

  return source.slice(start, end);
}

test("le logo de l'en-tête peut rétrécir au lieu de pousser les actions", async () => {
  const source = await readSource(HEADER);

  // Le lien du logo est contraint (min-w-0 + overflow-hidden) et n'est figé
  // qu'à partir de lg, où la place ne manque plus.
  const logoLink = source.match(
    /aria-label="Tableau de bord KASSALAFAM"\s*\n\s*className="([^"]+)"/,
  );
  assert.ok(logoLink, "le lien du logo doit porter une className");

  const classes = logoLink[1];
  assert.match(classes, /\bmin-w-0\b/, "min-w-0 requis pour autoriser le rétrécissement");
  assert.match(classes, /\boverflow-hidden\b/, "overflow-hidden requis comme filet de sécurité");
  assert.doesNotMatch(
    classes,
    /(^|\s)shrink-0(\s|$)/,
    "shrink-0 sans préfixe est précisément ce qui provoquait le débordement",
  );
});

test("la baseline du logo reste visible sur mobile, à format réduit", async () => {
  const source = await readSource(HEADER);

  const baseline = source.match(/baselineClassName="([^"]+)"/);
  assert.ok(baseline, "l'en-tête doit piloter la baseline du logo");

  const classes = baseline[1];

  // À sa taille d'origine (0.62rem / 0.28em) la baseline mesure 165 px, contre
  // ~126 px disponibles à 360 px. Réduite à 0.55rem / 0.12em elle tombe à
  // 119 px — soit exactement la largeur du mot-marque, les deux lignes
  // s'alignent. Mesures relevées au rendu, pas estimées.
  assert.match(classes, /text-\[0\.55rem\]/, "taille réduite requise sur mobile");
  assert.match(classes, /tracking-\[0\.12em\]/, "tracking réduit requis sur mobile");
  assert.match(
    classes,
    /sm:text-\[0\.62rem\]/,
    "la taille d'origine doit revenir à partir de 640 px",
  );
  assert.match(
    classes,
    /sm:tracking-\[0\.28em\]/,
    "le tracking d'origine doit revenir à partir de 640 px",
  );
  assert.match(classes, /\btruncate\b/, "filet de sécurité si la place manque");
  assert.doesNotMatch(
    classes,
    /(^|\s)hidden(\s|$)/,
    "la baseline ne doit plus disparaître à 360 px : demande du 06/08",
  );
});

test("sous 360 px, le logo se replie sur le seul mot-marque", async () => {
  const source = await readSource(HEADER);

  const baseline = source.match(/baselineClassName="([^"]+)"/);
  assert.match(
    baseline[1],
    /max-\[359px\]:hidden/,
    "à 320 px la colonne ne fait que 86 px : deux lignes tronquées valent moins qu'une nette",
  );

  const wordmark = source.match(/wordmarkClassName="([^"]+)"/);
  assert.match(
    wordmark[1],
    /max-\[359px\]:text-\[0\.72rem\]/,
    "le mot-marque doit rétrécir pour tenir entier à 320 px",
  );
});

test("le bloc texte du logo accepte de rétrécir", async () => {
  const source = await readSource(LOGO);

  assert.match(
    source,
    /flex min-w-0 flex-col leading-none/,
    "sans min-w-0, une colonne flex refuse de passer sous sa largeur de contenu",
  );
});

test("les actions de l'en-tête sont de largeur fixe et ne s'étirent pas", async () => {
  const source = await readSource(HEADER);

  const actionRow = source.match(
    /className="ml-auto flex ([^"]*)"\s*>\s*\n\s*\{ACTION_LINKS/,
  );
  assert.ok(actionRow, "la rangée d'actions doit être identifiable");
  assert.match(actionRow[1], /\bshrink-0\b/, "les actions ne doivent jamais être comprimées");

  // Les boutons ronds : largeur fixe sur mobile, libellé seulement à partir de
  // xl. (`relative` ajouté pour ancrer la pastille de non-lus — sans effet sur
  // la largeur.)
  assert.match(
    source,
    /className="(?:relative )?flex h-9 w-9 shrink-0 items-center justify-center[^"]*sm:h-10 sm:w-10 xl:w-auto/,
    "les boutons d'action doivent être de largeur fixe, élargis seulement en xl",
  );
  assert.doesNotMatch(
    source,
    /\bmin-w-10\b/,
    "min-w-10 + px-2.5 gonflait chaque bouton sans plafond",
  );
});

test("la nav mobile est une grille, sans défilement horizontal", async () => {
  const block = mobileNavBlock(await readSource(HEADER));

  assert.match(block, /\bgrid grid-cols-4\b/, "4 colonnes sous 640 px");
  assert.match(block, /\bsm:grid-cols-7\b/, "7 colonnes au-delà");
  assert.doesNotMatch(
    block,
    /\boverflow-x-auto\b/,
    "le défilement horizontal est ce que l'utilisateur a signalé",
  );
  assert.doesNotMatch(
    block,
    /\bmin-w-\[\d+px\]/,
    "une largeur minimale en pixels rouvre le débordement",
  );
});

test("les libellés de la nav mobile ne peuvent pas déborder de leur colonne", async () => {
  const block = mobileNavBlock(await readSource(HEADER));

  assert.match(block, /\bmin-w-0\b/, "chaque cellule doit pouvoir rétrécir");
  assert.match(
    block,
    /<span className="w-full truncate text-center">/,
    "le libellé est tronqué plutôt que d'élargir la colonne",
  );
  assert.match(
    block,
    /"short" in link \? link\.short : link\.label/,
    "un libellé court est utilisé quand il existe",
  );
});

test("« Tableau de bord » garde un libellé court sur mobile", async () => {
  const source = await readSource(HEADER);

  assert.match(
    source,
    /href: "\/dashboard",\s*\n\s*icon: LayoutDashboard,\s*\n(\s*\/\/[^\n]*\n)?\s*short: "Tableau",/,
    "le libellé long ne tient pas dans une colonne de ~80 px",
  );
});

test("« Premium » occupe la place restante de la seconde rangée", async () => {
  const block = mobileNavBlock(await readSource(HEADER));

  assert.match(
    block,
    /col-span-2 sm:col-span-1/,
    "7 éléments sur 4 colonnes laissent un trou : Premium le comble",
  );
});

test("la nav desktop conserve les libellés complets", async () => {
  const source = await readSource(HEADER);

  const start = source.indexOf('aria-label="Navigation principale"');
  const end = source.indexOf("</nav>", start);
  const block = source.slice(start, end);

  assert.match(block, /\{link\.label\}/, "le bureau affiche « Tableau de bord » en entier");
  assert.doesNotMatch(block, /link\.short/, "le libellé court est réservé au mobile");
});
