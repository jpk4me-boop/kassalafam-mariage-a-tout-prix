/**
 * Tests du hero Premium personnalisé (node:test, zéro dépendance).
 * `node --test scripts/premium-hero-copy.test.mjs`
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { getPremiumHeroCopy } from "../src/lib/premium/hero-copy.ts";

// 1. Pierre — homme — christianisme
test("Pierre, homme, christianisme", () => {
  const c = getPremiumHeroCopy({
    firstName: "Pierre",
    gender: "homme",
    religion: "christianisme",
  });
  assert.equal(c.headline, "Pierre, ta future femme t’attend.");
  assert.equal(c.opportunity, "Ne rate pas cette occasion divine.");
  assert.equal(c.reassurance, "Dieu est au contrôle.");
});

// 2. Maryvonne — femme — christianisme
test("Maryvonne, femme, christianisme", () => {
  const c = getPremiumHeroCopy({
    firstName: "Maryvonne",
    gender: "femme",
    religion: "christianisme",
  });
  assert.equal(c.headline, "Maryvonne, ton futur époux t’attend.");
  assert.equal(c.opportunity, "Ne rate pas cette occasion divine.");
  assert.equal(c.reassurance, "Dieu est au contrôle.");
});

// 3. Ibrahim — homme — islam
test("Ibrahim, homme, islam", () => {
  const c = getPremiumHeroCopy({
    firstName: "Ibrahim",
    gender: "homme",
    religion: "islam",
  });
  assert.equal(c.headline, "Ibrahim, ta future femme t’attend.");
  assert.equal(c.opportunity, "Ne rate pas cette occasion divine.");
  assert.equal(c.reassurance, "Allah est au contrôle.");
});

// 4. Yasmina — femme — islam
test("Yasmina, femme, islam", () => {
  const c = getPremiumHeroCopy({
    firstName: "Yasmina",
    gender: "femme",
    religion: "islam",
  });
  assert.equal(c.headline, "Yasmina, ton futur époux t’attend.");
  assert.equal(c.opportunity, "Ne rate pas cette occasion divine.");
  assert.equal(c.reassurance, "Allah est au contrôle.");
});

// 5. Antoine — homme — sans religion
test("Antoine, homme, sans_religion", () => {
  const c = getPremiumHeroCopy({
    firstName: "Antoine",
    gender: "homme",
    religion: "sans_religion",
  });
  assert.equal(c.headline, "Antoine, ta future femme t’attend.");
  assert.equal(c.opportunity, "Ne rate pas cette occasion unique.");
  assert.equal(c.reassurance, "Tes ancêtres veillent sur toi.");
});

// 6. Anna — femme — sans religion
test("Anna, femme, sans_religion", () => {
  const c = getPremiumHeroCopy({
    firstName: "Anna",
    gender: "femme",
    religion: "sans_religion",
  });
  assert.equal(c.headline, "Anna, ton futur époux t’attend.");
  assert.equal(c.opportunity, "Ne rate pas cette occasion unique.");
  assert.equal(c.reassurance, "Tes ancêtres veillent sur toi.");
});

// 7. Religion "autre"
test("homme, religion autre", () => {
  const c = getPremiumHeroCopy({
    firstName: "Pierre",
    gender: "homme",
    religion: "autre",
  });
  assert.equal(c.headline, "Pierre, ta future femme t’attend.");
  assert.equal(c.opportunity, "Ne rate pas cette belle occasion.");
  assert.equal(c.reassurance, "Ton avenir est entre tes mains.");
});

// 8. Religion null
test("femme, religion null", () => {
  const c = getPremiumHeroCopy({
    firstName: "Maryvonne",
    gender: "femme",
    religion: null,
  });
  assert.equal(c.headline, "Maryvonne, ton futur époux t’attend.");
  assert.equal(c.opportunity, "Ne rate pas cette belle occasion.");
  assert.equal(c.reassurance, "Ton avenir est entre tes mains.");
});

// 9. Prénom vide
test("prénom vide, homme, christianisme", () => {
  const c = getPremiumHeroCopy({
    firstName: "",
    gender: "homme",
    religion: "christianisme",
  });
  assert.equal(c.headline, "Ta future femme t’attend.");
  assert.equal(c.opportunity, "Ne rate pas cette occasion divine.");
  assert.equal(c.reassurance, "Dieu est au contrôle.");
});

// 10. Genre null — repli neutre
test("genre null, repli neutre", () => {
  const c = getPremiumHeroCopy({
    firstName: "Alex",
    gender: null,
    religion: "islam",
  });
  assert.equal(c.headline, "Alex, la personne qui te correspond t’attend.");
  assert.equal(c.opportunity, "Ne rate pas cette occasion divine.");
  assert.equal(c.reassurance, "Allah est au contrôle.");
});

// 11. Tout null — repli complet
test("tout null — repli complet", () => {
  const c = getPremiumHeroCopy({
    firstName: null,
    gender: null,
    religion: null,
  });
  assert.equal(
    c.headline,
    "La personne qui te correspond t’attend.",
  );
  assert.equal(c.opportunity, "Ne rate pas cette belle occasion.");
  assert.equal(c.reassurance, "Ton avenir est entre tes mains.");
});

// 12. Prénom avec espaces — nettoyage
test("prénom avec espaces", () => {
  const c = getPremiumHeroCopy({
    firstName: "  Sarah  ",
    gender: "femme",
    religion: "christianisme",
  });
  assert.equal(c.headline, "Sarah, ton futur époux t’attend.");
});
