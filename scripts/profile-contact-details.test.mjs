/**
 * Coordonnées personnelles dans les champs PUBLICS — miroir client / base.
 * `node --test scripts/profile-contact-details.test.mjs`
 *
 * La base fait autorité (trigger `profiles_reject_contact_details`), mais
 * l'interface doit dire la même chose AVANT l'aller-retour. Le risque réel
 * n'est pas qu'un motif manque : c'est que les deux implémentations DIVERGENT.
 * La première suite compare donc les motifs un à un.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const MIGRATION =
  "supabase/migrations/20260806073500_reject_contact_details_in_public_fields.sql";

const [sql, helper, profilePage, wizard, pkg] = await Promise.all([
  readFile(MIGRATION, "utf8"),
  readFile("src/lib/profile/contact-details.ts", "utf8"),
  readFile("src/app/(member)/profile/page.tsx", "utf8"),
  readFile("src/components/onboarding/onboarding-wizard.tsx", "utf8"),
  readFile("package.json", "utf8"),
]);

// --- Le miroir ne doit pas diverger ------------------------------------------

/** Motifs de la fonction SQL : les littéraux entre `~` / `~*` et la quote. */
function motifsSql(source) {
  const corps = source.slice(
    source.indexOf("create or replace function public.text_has_contact_details"),
    source.indexOf("comment on function"),
  );
  return [...corps.matchAll(/~\*? '((?:[^']|'')*)'/g)].map((m) =>
    m[1].replace(/''/g, "'"),
  );
}

/** Motifs du miroir TypeScript : le corps de chaque littéral RegExp. */
function motifsTs(source) {
  const bloc = source.slice(
    source.indexOf("const CONTACT_PATTERNS"),
    source.indexOf("export function hasContactDetails"),
  );
  return [...bloc.matchAll(/^\s{2}\/(.+)\/i?,$/gm)].map((m) => m[1]);
}

test("base et miroir déclarent EXACTEMENT les mêmes motifs, dans le même ordre", () => {
  const cote = motifsSql(sql);
  const client = motifsTs(helper);

  assert.equal(cote.length, 5, "5 motifs attendus côté base");
  assert.deepEqual(
    client,
    cote,
    "toute évolution doit être portée aux DEUX endroits",
  );
});

test("la base est désignée comme autorité, le miroir comme confort", () => {
  assert.match(sql, /FAIT AUTORITÉ/);
  assert.match(helper, /La BASE fait autorité/);
});

// --- Structure de la migration ------------------------------------------------

test("la migration n'écrit, ne lit et ne supprime aucune donnée", () => {
  const applique = sql.replace(/\$\$[\s\S]*?\$\$/g, "");
  assert.doesNotMatch(applique, /\binsert\s+into\b/i);
  assert.doesNotMatch(applique, /\bdelete\s+from\b/i);
  assert.doesNotMatch(applique, /\badd column\b/i);
  assert.doesNotMatch(applique, /\bdrop\s+(table|column)\b/i);
});

test("la fonction de détection reste interne et sans effet de bord", () => {
  assert.match(sql, /immutable/);
  assert.match(sql, /set search_path = ''/);
  assert.match(
    sql,
    /revoke all on function public\.text_has_contact_details\(text\) from authenticated/,
  );
  assert.doesNotMatch(sql, /grant execute on function public\.text_has_contact_details/);
});

test("le trigger ne valide QUE les champs modifiés", () => {
  // Un profil existant ne doit jamais être re-bloqué par une écriture qui ne
  // touche pas ces colonnes — même prudence qu'à la migration 55.
  for (const champ of ["bio", "partner_expectations", "first_name", "pseudo"]) {
    assert.match(
      sql,
      new RegExp(`new\\.${champ} is distinct from old\\.${champ}`),
      `${champ} : la comparaison à l'ancienne valeur manque`,
    );
  }
  // OLD n'existe pas en INSERT : la branche doit être séparée.
  assert.match(sql, /if tg_op = 'INSERT' then/);
});

test("la migration est idempotente et porte une version postérieure à la 59", () => {
  assert.match(sql, /create or replace function/);
  assert.match(sql, /drop trigger if exists/);
  assert.ok(
    "20260806073500" > "20260804110000",
    "la version doit être strictement postérieure à la dernière appliquée",
  );
});

test("l'ordre merge/migration est écrit dans l'en-tête", () => {
  // Règle du §8 : une migration qui AJOUTE UNE EXIGENCE se merge d'abord.
  assert.match(sql, /MERGER LA PR AVANT D'APPLIQUER/);
});

// --- Câblage des deux chemins d'écriture ---------------------------------------

test("les DEUX chemins d'écriture directe sont couverts", () => {
  // /profile et l'onboarding écrivent dans `profiles` depuis le navigateur.
  for (const [nom, source] of [
    ["/profile", profilePage],
    ["onboarding", wizard],
  ]) {
    assert.match(
      source,
      /firstFieldWithContactDetails\(/,
      `${nom} : contrôle avant envoi manquant`,
    );
    assert.match(
      source,
      /contactDetailsErrorMessage\(/,
      `${nom} : traduction de l'erreur base manquante`,
    );
  }
});

test("la suite est déclarée dans package.json", () => {
  assert.match(pkg, /"test:profile-contact-details"/);
});

// --- Logique pure du miroir -----------------------------------------------------

const TYPE_ANNOTATION =
  /:\s*(readonly RegExp\[\]|Record<[^>]*>|PublicProfileValues|PublicProfileField\[\]|PublicProfileField \| null|PublicProfileField|string \| null \| undefined|string \| null|boolean|string)/g;

function loadHelper() {
  const js = helper
    .replace(/export type [\s\S]*?;\n/g, "")
    .replace(/export (const|function)/g, "$1")
    .replace(TYPE_ANNOTATION, "");
  return new Function(
    `${js}; return { hasContactDetails, firstFieldWithContactDetails, contactDetailsErrorMessage, CONTACT_DETAILS_MESSAGES };`,
  )();
}

test("le miroir refuse ce que la base refuse", () => {
  const { hasContactDetails } = loadHelper();

  for (const texte of [
    "Appelez-moi au 691849494",
    "mon numero : 6 91 84 94 94",
    "237-691-84-94-94",
    "+237 691849",
    "ecrivez a moi@gmail.com",
    "mon insta @belle_ame",
    "contactez moi sur WhatsApp",
    "whats app direct",
    "https://wa.me/237691849494",
    "rejoins moi sur Telegram",
  ]) {
    assert.equal(hasContactDetails(texte), true, `devrait être refusé : ${texte}`);
  }
});

test("le miroir laisse passer ce que la base laisse passer", () => {
  const { hasContactDetails } = loadHelper();

  for (const texte of [
    null,
    undefined,
    "   ",
    "J'ai 34 ans, 2 enfants, et je vis à Douala depuis 2019.",
    "Née le 12/05/1990, je cherche un foyer stable.",
    "Mon budget mariage tourne autour de 2 500 000 FCFA.",
    "Je suis croyante, douce, et j'aime cuisiner le ndolé.",
    "Marie-Grâce",
  ]) {
    assert.equal(
      hasContactDetails(texte),
      false,
      `ne devrait PAS être refusé : ${texte}`,
    );
  }
});

test("le champ fautif est désigné dans le même ordre que le trigger", () => {
  const { firstFieldWithContactDetails } = loadHelper();

  assert.equal(firstFieldWithContactDetails({}), null);
  assert.equal(
    firstFieldWithContactDetails({ bio: "Bonjour", pseudo: "Belle" }),
    null,
  );
  assert.equal(
    firstFieldWithContactDetails({ pseudo: "belle@ame237" }),
    "pseudo",
  );
  // bio d'abord, comme le trigger : les deux doivent nommer le MÊME champ.
  assert.equal(
    firstFieldWithContactDetails({
      bio: "au 691849494",
      partner_expectations: "moi@gmail.com",
    }),
    "bio",
  );
});

test("l'erreur base est traduite en message lisible, et elle seule", () => {
  const { contactDetailsErrorMessage, CONTACT_DETAILS_MESSAGES } = loadHelper();

  assert.equal(
    contactDetailsErrorMessage("PROFILE_CONTACT_DETAILS_NOT_ALLOWED", "pseudo"),
    CONTACT_DETAILS_MESSAGES.pseudo,
  );
  // DETAIL inattendu : on affiche quand même quelque chose d'utile.
  assert.equal(
    contactDetailsErrorMessage("PROFILE_CONTACT_DETAILS_NOT_ALLOWED", "inconnu"),
    CONTACT_DETAILS_MESSAGES.bio,
  );
  // Toute autre erreur doit retomber sur le message générique de l'appelant.
  assert.equal(contactDetailsErrorMessage("23505", "bio"), null);
  assert.equal(contactDetailsErrorMessage(null, null), null);
});

test("chaque message nomme le tort sans culpabiliser", () => {
  const { CONTACT_DETAILS_MESSAGES } = loadHelper();

  const messages = Object.values(CONTACT_DETAILS_MESSAGES);
  assert.equal(messages.length, 4);
  assert.equal(new Set(messages).size, 4, "un message par champ");

  for (const m of messages) {
    assert.match(m, /publi/i, "le message doit expliquer POURQUOI c'est refusé");
    assert.doesNotMatch(m, /interdit|erreur|invalide/i);
  }
});
