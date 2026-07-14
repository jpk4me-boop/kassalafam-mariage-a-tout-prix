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
