/**
 * PR A géo — Tests du référentiel pays/villes et de la logique de
 * rapprochement (node:test, AUCUNE dépendance : `node --test scripts/`).
 *
 * Node ≥ 23.6 exécute nativement les modules TypeScript importés ci-dessous
 * (type stripping) : les tests portent sur les MODULES RÉELS du dépôt.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  COUNTRIES_FR,
  filterCountries,
  findCountryByName,
  matchCityInList,
  normalizeGeo,
} from "../src/lib/geo/countries-fr.ts";
import {
  CITIES_FR,
  UNINHABITED_TERRITORIES,
  getCitiesForCountry,
} from "../src/lib/geo/cities-fr.ts";

// ---------------------------------------------------------------------------
// Pays
// ---------------------------------------------------------------------------
test("la liste contient les 249 pays et territoires ISO 3166-1 alpha-2", () => {
  assert.equal(COUNTRIES_FR.length, 249);
});

test("les codes ISO sont uniques et au format alpha-2", () => {
  const codes = COUNTRIES_FR.map((c) => c.code);
  assert.equal(new Set(codes).size, codes.length);
  for (const code of codes) assert.match(code, /^[A-Z]{2}$/);
});

test("les noms normalisés sont uniques (aucun doublon de rapprochement)", () => {
  const names = COUNTRIES_FR.map((c) => normalizeGeo(c.name));
  assert.equal(new Set(names).size, names.length);
});

test("la liste est triée en ordre alphabétique français", () => {
  const collator = new Intl.Collator("fr", { sensitivity: "base" });
  for (let i = 1; i < COUNTRIES_FR.length; i++) {
    assert.ok(
      collator.compare(COUNTRIES_FR[i - 1].name, COUNTRIES_FR[i].name) <= 0,
      `ordre incorrect : ${COUNTRIES_FR[i - 1].name} > ${COUNTRIES_FR[i].name}`,
    );
  }
});

test("recherche sans accent : « cote » trouve « Côte d’Ivoire »", () => {
  const results = filterCountries("cote").map((c) => c.name);
  assert.ok(results.includes("Côte d’Ivoire"));
});

test("recherche insensible casse/apostrophes : « COTE D'IVOIRE »", () => {
  const results = filterCountries("COTE D'IVOIRE").map((c) => c.code);
  assert.deepEqual(results, ["CI"]);
});

test("requête vide → liste complète", () => {
  assert.equal(filterCountries("").length, 249);
});

test("les valeurs Production existantes correspondent toutes à un pays", () => {
  // Valeurs relevées lors de l'audit (dont l'apostrophe typographique).
  const existing = ["Cameroun", "Côte d’Ivoire", "Allemagne", "Gabon", "Belgique"];
  for (const value of existing) {
    const country = findCountryByName(value);
    assert.ok(country, `« ${value} » doit être reconnu`);
  }
  assert.equal(findCountryByName("Cameroun")?.code, "CM");
  assert.equal(findCountryByName(" CAMEROUN ")?.code, "CM");
  assert.equal(findCountryByName("cote d'ivoire")?.code, "CI");
});

test("une valeur inconnue n'est PAS rapprochée (elle sera conservée telle quelle)", () => {
  assert.equal(findCountryByName("Pays imaginaire"), null);
  assert.equal(findCountryByName(""), null);
  assert.equal(findCountryByName(null), null);
});

// ---------------------------------------------------------------------------
// Villes
// ---------------------------------------------------------------------------
const PRIORITY_CODES = [
  "CM", "CI", "SN", "GA", "CG", "CD", "NG", "GH", "ML", "BF", "GN", "BJ",
  "TG", "FR", "BE", "DE", "GB", "CA", "US", "MA", "DZ", "TN", "ZA",
];

test("les 23 pays prioritaires ont une liste ENRICHIE de villes (≥ 10)", () => {
  for (const code of PRIORITY_CODES) {
    const cities = CITIES_FR[code];
    assert.ok(Array.isArray(cities) && cities.length >= 10, `liste riche manquante : ${code}`);
  }
});

test("TOUT pays ou territoire HABITÉ possède une liste non vide de localités", () => {
  for (const { code, name } of COUNTRIES_FR) {
    if (UNINHABITED_TERRITORIES.has(code)) continue;
    const cities = CITIES_FR[code];
    assert.ok(
      Array.isArray(cities) && cities.length > 0,
      `localités manquantes pour ${code} (${name})`,
    );
  }
});

test("les territoires inhabités n'ont PAS de liste (saisie libre uniquement)", () => {
  for (const code of UNINHABITED_TERRITORIES) {
    assert.ok(!(code in CITIES_FR), `${code} inhabité ne doit pas avoir de liste`);
    assert.ok(
      COUNTRIES_FR.some((c) => c.code === code),
      `${code} doit exister dans la liste ISO`,
    );
  }
  // Couverture totale : pays ISO = couverts + inhabités.
  assert.equal(
    Object.keys(CITIES_FR).length + UNINHABITED_TERRITORIES.size,
    COUNTRIES_FR.length,
  );
});

test("aucune ville vide, aucun littéral technique dans les données stockables", () => {
  for (const [code, cities] of Object.entries(CITIES_FR)) {
    for (const city of cities) {
      assert.ok(city.trim().length > 0, `ville vide dans ${code}`);
      const n = normalizeGeo(city);
      assert.notEqual(n, "other", `littéral technique dans ${code}`);
      assert.notEqual(n, "autre ville", `littéral technique dans ${code}`);
      assert.notEqual(n, "autre_ville", `littéral technique dans ${code}`);
    }
  }
});

test("France, Canada, États-Unis, Royaume-Uni et Allemagne ont plusieurs villes", () => {
  for (const code of ["FR", "CA", "US", "GB", "DE"]) {
    assert.ok(CITIES_FR[code].length > 1, `${code} doit avoir plusieurs villes`);
  }
});

test("le Cameroun contient les 20 villes minimales exigées", () => {
  const required = [
    "Douala", "Yaoundé", "Bafoussam", "Bamenda", "Garoua", "Maroua",
    "Ngaoundéré", "Bertoua", "Ebolowa", "Buea", "Limbé", "Kumba", "Kribi",
    "Edéa", "Foumban", "Dschang", "Nkongsamba", "Mbouda", "Sangmélima",
    "Garoua-Boulaï",
  ];
  for (const city of required) {
    assert.ok(CITIES_FR.CM.includes(city), `ville CM manquante : ${city}`);
  }
});

test("chaque liste de villes est sans doublon (après normalisation)", () => {
  for (const [code, cities] of Object.entries(CITIES_FR)) {
    const normalized = cities.map((c) => normalizeGeo(c));
    assert.equal(new Set(normalized).size, cities.length, `doublon dans ${code}`);
  }
});

test("un code inconnu ou vide renvoie une liste vide (→ saisie manuelle)", () => {
  assert.deepEqual(getCitiesForCountry("XX"), []);
  assert.deepEqual(getCitiesForCountry(null), []);
});

// ---------------------------------------------------------------------------
// Rapprochement des valeurs héritées (comportement « Autre ville »)
// ---------------------------------------------------------------------------
test("une ville Production existante est rapprochée de son libellé canonique", () => {
  assert.equal(matchCityInList("Douala", CITIES_FR.CM), "Douala");
  assert.equal(matchCityInList("douala", CITIES_FR.CM), "Douala");
  assert.equal(matchCityInList("YAOUNDE", CITIES_FR.CM), "Yaoundé");
});

test("une ville hors liste n'est PAS rapprochée → mode « Autre ville », valeur conservée", () => {
  assert.equal(matchCityInList("Bafia", CITIES_FR.CM), null);
  assert.equal(matchCityInList("", CITIES_FR.CM), null);
  assert.equal(matchCityInList("Douala", []), null);
});

test("normalisation : accents, casse, apostrophes, tirets, espaces", () => {
  assert.equal(normalizeGeo("  Côte   d’Ivoire "), normalizeGeo("cote d'ivoire"));
  assert.equal(normalizeGeo("Garoua-Boulaï"), normalizeGeo("garoua boulai"));
  assert.equal(normalizeGeo("N’Gourma"), normalizeGeo("n gourma"));
});

// ---------------------------------------------------------------------------
// PR Origine/Résidence — deux couples Pays → Ville INDÉPENDANTS.
// Modèle minimal du contrat de CountryCityFields (le composant est réutilisé
// tel quel) : chaque couple possède son propre état ; la sélection d'un pays
// efface UNIQUEMENT la ville du MÊME couple ; le catalogue est UNIQUE.
// ---------------------------------------------------------------------------
function makePair(country = "", city = "") {
  return { country, city };
}
// Miroir de handleCountrySelect : changer de pays efface la ville du couple.
function selectCountry(pair, name) {
  if (name === pair.country) return;
  pair.country = name;
  pair.city = "";
}
// Miroir de la résolution des villes du composant : catalogue unique partagé.
function citiesOf(pair) {
  const known = findCountryByName(pair.country);
  return known ? getCitiesForCountry(known.code) : [];
}

test("deux couples indépendants : changer le pays d'ORIGINE ne touche pas la résidence", () => {
  const origin = makePair("Cameroun", "Yaoundé");
  const residence = makePair("Cameroun", "Douala");
  selectCountry(origin, "Sénégal");
  assert.equal(origin.country, "Sénégal");
  assert.equal(origin.city, ""); // seule la ville d'origine est réinitialisée
  assert.equal(residence.country, "Cameroun"); // résidence INTACTE
  assert.equal(residence.city, "Douala");
  // Le nouveau pays d'origine propose bien SES villes (catalogue unique).
  assert.ok(citiesOf(origin).includes("Dakar"));
});

test("deux couples indépendants : changer le pays de RÉSIDENCE ne touche pas l'origine", () => {
  const origin = makePair("Cameroun", "Yaoundé");
  const residence = makePair("Cameroun", "Douala");
  selectCountry(residence, "France");
  assert.equal(residence.country, "France");
  assert.equal(residence.city, ""); // seule la ville de résidence est réinitialisée
  assert.equal(origin.country, "Cameroun"); // origine INTACTE
  assert.equal(origin.city, "Yaoundé");
  assert.ok(citiesOf(residence).includes("Paris"));
});

test("valeurs identiques ou différentes acceptées : aucune règle d'égalité/différence", () => {
  const identical = [makePair("Cameroun", "Douala"), makePair("Cameroun", "Douala")];
  const different = [makePair("Sénégal", "Dakar"), makePair("France", "Paris")];
  for (const [origin, residence] of [identical, different]) {
    assert.ok(origin.country.length > 0 && residence.country.length > 0);
    // Chaque couple se résout sans dépendre de l'autre.
    assert.notEqual(citiesOf(origin), null);
    assert.notEqual(citiesOf(residence), null);
  }
});

test("« Autre ville » pour l'ORIGINE : valeur libre hors liste conservée (non rapprochée)", () => {
  const origin = makePair("Cameroun", "Bafia"); // hors liste CM → mode manuel
  assert.equal(matchCityInList(origin.city, citiesOf(origin)), null);
  assert.equal(origin.city, "Bafia"); // la saisie libre reste la valeur stockée
});

test("« Autre ville » pour la RÉSIDENCE : valeur libre hors liste conservée (non rapprochée)", () => {
  const residence = makePair("France", "Le Petit-Quevilly"); // hors liste FR
  assert.equal(matchCityInList(residence.city, citiesOf(residence)), null);
  assert.equal(residence.city, "Le Petit-Quevilly");
});

test("Cameroun → Douala fonctionne pour l'ORIGINE et la RÉSIDENCE (catalogue unique)", () => {
  const origin = makePair("Cameroun");
  const residence = makePair("Cameroun");
  assert.ok(citiesOf(origin).includes("Douala"));
  assert.ok(citiesOf(residence).includes("Douala"));
  // Aucune duplication : les deux couples résolvent la MÊME liste (référence).
  assert.equal(citiesOf(origin), citiesOf(residence));
});

test("pays sans localités référencées : liste vide → « Autre ville » (saisie libre) pour chaque couple", () => {
  const code = [...UNINHABITED_TERRITORIES][0];
  const name = COUNTRIES_FR.find((c) => c.code === code)?.name;
  assert.ok(name, "au moins un territoire inhabité doit exister");
  assert.deepEqual(citiesOf(makePair(name)), []); // → mode manuel dans le composant
});

test("aucune valeur vide ou composée d'espaces n'est une localisation valide", () => {
  for (const raw of ["", "   "]) {
    assert.equal(findCountryByName(raw), null);
    assert.equal(matchCityInList(raw, CITIES_FR.CM), null);
    // Normalisation d'enregistrement (formulaire) : trim → NULL, jamais "".
    assert.equal(raw.trim() || null, null);
  }
});

test("compatibilité null : un profil historique (origin_* = null) se charge sans erreur", () => {
  // Miroir de formFromProfile : p.origin_country ?? "" / p.origin_city ?? "".
  const legacy = { origin_country: null, origin_city: null };
  const origin = makePair(legacy.origin_country ?? "", legacy.origin_city ?? "");
  assert.equal(origin.country, "");
  assert.equal(origin.city, "");
  assert.deepEqual(citiesOf(origin), []); // ville désactivée tant que pays vide
});

test("valeurs historiques préservées : origin_country texte libre reconnu ou conservé", () => {
  // Valeur héritée reconnue (saisie libre historique) → rapprochée au chargement.
  assert.equal(findCountryByName("cameroun")?.code, "CM");
  // Valeur héritée inconnue → PAS de rapprochement : conservée telle quelle,
  // la ville associée bascule en « Autre ville » (liste vide).
  const legacy = makePair("Kamerun (ancienne saisie)", "Douala");
  assert.equal(findCountryByName(legacy.country), null);
  assert.deepEqual(citiesOf(legacy), []);
  assert.equal(legacy.city, "Douala"); // rien n'est effacé au chargement
});
