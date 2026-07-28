/**
 * Contrôles de l'interface admin « Promotion du profil » (PR #82).
 * `node --test scripts/admin-profile-promotion-ui.test.mjs`
 *
 * 1re partie : contrôles STRUCTURELS (lecture des sources, zéro dépendance).
 * 2e partie : tests UNITAIRES des fonctions pures (modules réels importés via
 * le type stripping natif de Node).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

import {
  availablePromotionDurations,
  buildFacebookShareUrl,
  buildWhatsAppShareUrl,
  formatPromotionDate,
  isPromotionChannel,
  isPromotionDuration,
  PROMOTION_LINK_STATUS_LABELS,
  promotionSummary,
  promotionUrlFromToken,
  shareLinkExpiryIso,
} from "../src/lib/admin/profile-promotion.ts";

const MEMBERS_PAGE = "src/app/admin/members/page.tsx";
const MEMBER_DETAIL_PAGE = "src/app/admin/members/[profileId]/page.tsx";
const MEMBERS_LIST = "src/components/admin/members-list.tsx";
const SECTION = "src/components/admin/member-promotion-section.tsx";
const FORM = "src/components/admin/promotion-link-form.tsx";
const REVOKE_BUTTON = "src/components/admin/promotion-revoke-button.tsx";
const ACTIONS = "src/app/admin/members/promotion-actions.ts";
const PURE_LIB = "src/lib/admin/profile-promotion.ts";

const [
  membersPage,
  memberDetailPage,
  membersList,
  section,
  form,
  revokeButton,
  actions,
  pureLib,
] = await Promise.all([
  readFile(MEMBERS_PAGE, "utf8"),
  readFile(MEMBER_DETAIL_PAGE, "utf8"),
  readFile(MEMBERS_LIST, "utf8"),
  readFile(SECTION, "utf8"),
  readFile(FORM, "utf8"),
  readFile(REVOKE_BUTTON, "utf8"),
  readFile(ACTIONS, "utf8"),
  readFile(PURE_LIB, "utf8"),
]);

const clientComponents = [
  ["promotion-link-form", form],
  ["promotion-revoke-button", revokeButton],
];

/** Retire les commentaires de bloc : les interdictions portent sur le CODE. */
function stripBlockComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "");
}

// ---------------------------------------------------------------------------
// /admin/members : appel groupé unique, échec non bloquant.
// ---------------------------------------------------------------------------
test("la liste charge les statuts promotionnels en UN SEUL appel groupé", () => {
  assert.match(membersPage, /getProfilePromotionShareStatuses\(\{/);
  assert.match(membersPage, /profileIds: items\.map\(\(m\) => m\.id\)/);
  // Une seule occurrence de l'appel dans la page.
  const calls = membersPage.match(/getProfilePromotionShareStatuses\(/g) ?? [];
  assert.equal(calls.length, 1);
});

test("l'échec de la lecture promotionnelle ne bloque pas la liste", () => {
  assert.match(
    membersPage,
    /const promotionById = new Map<string, AdminProfilePromotionShareStatus>\(\)/,
  );
  assert.match(membersPage, /promotionById=\{promotionById\}/);
});

test("aucune requête promotionnelle par membre dans la présentation", () => {
  assert.doesNotMatch(membersList, /getProfilePromotionShareStatuses/);
  assert.doesNotMatch(membersList, /listProfilePromotionShareLinks/);
  assert.doesNotMatch(membersList, /\.rpc\(/);
  assert.match(membersList, /promotionById\.get\(m\.id\)/);
});

// ---------------------------------------------------------------------------
// Réutilisation des quatre helpers serveur existants.
// ---------------------------------------------------------------------------
test("les quatre helpers serveur existants sont réutilisés", () => {
  assert.match(membersPage, /getProfilePromotionShareStatuses/);
  assert.match(section, /getProfilePromotionShareStatuses/);
  assert.match(section, /listProfilePromotionShareLinks/);
  assert.match(actions, /createProfilePromotionShareLink/);
  assert.match(actions, /revokeProfilePromotionShareLink/);
});

// ---------------------------------------------------------------------------
// Gardes admin conservées.
// ---------------------------------------------------------------------------
test("les pages admin conservent requireAdmin", () => {
  assert.match(membersPage, /await requireAdmin\("\/admin\/members"\)/);
  assert.match(memberDetailPage, /await requireAdmin\(/);
});

test("les Server Actions ne reçoivent jamais l'acteur ni les IDs dérivés", () => {
  // L'acteur est résolu par les helpers serveur (resolveAdminActor interne).
  const code = stripBlockComments(actions);
  assert.doesNotMatch(code, /actorId|actor_id|p_actor_id/);
  assert.doesNotMatch(code, /photoId|photo_id/);
  assert.doesNotMatch(code, /consentId|consent_id/);
  assert.match(code, /"use server"/);
});

// ---------------------------------------------------------------------------
// Composants client : aucun accès privilégié, aucune persistance du jeton.
// ---------------------------------------------------------------------------
for (const [name, content] of clientComponents) {
  test(`${name} : aucun client Supabase privilégié côté navigateur`, () => {
    assert.match(content, /"use client"/);
    assert.doesNotMatch(content, /createAdminClient/);
    assert.doesNotMatch(content, /service_role/);
    assert.doesNotMatch(content, /supabase/i);
  });

  test(`${name} : aucune persistance ni journalisation du jeton`, () => {
    const code = stripBlockComments(content);
    assert.doesNotMatch(code, /localStorage/);
    assert.doesNotMatch(code, /sessionStorage/);
    assert.doesNotMatch(code, /document\.cookie/);
    assert.doesNotMatch(code, /console\.log/);
    assert.doesNotMatch(code, /history\.pushState|history\.replaceState/);
  });
}

test("la Server Action ne journalise jamais le jeton", () => {
  assert.doesNotMatch(actions, /console\./);
});

// ---------------------------------------------------------------------------
// Affichage unique, copie, partage.
// ---------------------------------------------------------------------------
test("le lien créé est copiable et partageable (Web Share + repli copie)", () => {
  assert.match(form, /navigator\.share/);
  assert.match(form, /navigator\.clipboard\?\.writeText/);
  assert.match(form, /Copier le lien/);
  assert.match(form, /copyLink\(\)/);
});

test("WhatsApp et Facebook utilisent les URLs de partage web sûres", () => {
  assert.match(form, /buildWhatsAppShareUrl/);
  assert.match(form, /buildFacebookShareUrl/);
  assert.match(pureLib, /https:\/\/wa\.me\/\?text=/);
  assert.match(pureLib, /facebook\.com\/sharer\/sharer\.php\?u=/);
});

test("Instagram et Snapchat passent par le partage natif ou la copie", () => {
  assert.match(
    form,
    /created\.channel === "instagram" \|\| created\.channel === "snapchat"/,
  );
  assert.doesNotMatch(form, /instagram\.com\/share|snapchat\.com\/share/);
});

test("les liens externes du panneau sont protégés (nouvel onglet)", () => {
  assert.match(form, /rel="noopener noreferrer"/);
  assert.match(form, /target="_blank"/);
});

test("l'URL est construite sur le domaine canonique", () => {
  assert.match(pureLib, /https:\/\/kassalafam\.com/);
  assert.match(actions, /promotionUrlFromToken\(result\.data\.token\)/);
});

// ---------------------------------------------------------------------------
// Historique et révocation.
// ---------------------------------------------------------------------------
test("l'historique n'affiche que le préfixe du jeton, jamais le hash", () => {
  assert.match(section, /token_prefix/);
  assert.doesNotMatch(section, /token_hash/);
  // Aucune propriété `token` complète manipulée dans la section serveur.
  assert.doesNotMatch(section, /\.token[^_]/);
});

test("la révocation est disponible avec confirmation explicite", () => {
  assert.match(section, /PromotionRevokeButton/);
  assert.match(section, /link\.status === "active"/);
  assert.match(revokeButton, /window\.confirm/);
  assert.match(revokeButton, /revokePromotionLinkAction/);
  assert.match(revokeButton, /useTransition/);
  assert.match(revokeButton, /router\.refresh\(\)/);
});

test("le motif de révocation par défaut est celui du back-office", () => {
  assert.match(
    actions,
    /Révocation manuelle depuis le back-office KASSALAFAM\./,
  );
});

// ---------------------------------------------------------------------------
// Photo autorisée : photo_id du consentement, URL signée courte.
// ---------------------------------------------------------------------------
test("la photo affichée est exactement celle du consentement", () => {
  assert.match(section, /\.eq\("id", photoId\)/);
  assert.match(section, /\.eq\("profile_id", profileId\)/);
  assert.doesNotMatch(section, /is_primary/);
  assert.match(section, /createSignedUrl\(photo\.storage_path, SIGNED_URL_TTL\)/);
  assert.match(section, /SIGNED_URL_TTL = 300/);
});

test("storage_path n'est jamais transmis aux composants client", () => {
  assert.doesNotMatch(form, /storage_path/);
  assert.doesNotMatch(revokeButton, /storage_path/);
});

// ---------------------------------------------------------------------------
// Aucune API sociale côté serveur, aucune migration.
// ---------------------------------------------------------------------------
test("aucune API sociale n'est appelée côté serveur", () => {
  for (const content of [actions, section]) {
    assert.doesNotMatch(content, /fetch\(/);
    assert.doesNotMatch(content, /graph\.facebook|wa\.me|sharer\.php/);
    assert.doesNotMatch(content, /instagram\.com|snapchat\.com/);
  }
});

test("la PR n'ajoute aucune migration", async () => {
  const migrations = await readdir("supabase/migrations");
  const promotionMigrations = migrations.filter((f) => f.includes("promotion"));
  assert.deepEqual(promotionMigrations.sort(), [
    "20260726030000_create_profile_promotion_consents.sql",
    "20260727003000_create_profile_promotion_share_links.sql",
  ]);
});

// ---------------------------------------------------------------------------
// Fonctions pures — résumé de statut.
// ---------------------------------------------------------------------------
test("promotionSummary : consentement exploitable → Autorisé", () => {
  assert.deepEqual(promotionSummary({ eligibility_reason: "eligible" }), {
    label: "Autorisé",
    tone: "ok",
  });
});

test("promotionSummary : aucun consentement → Non autorisé", () => {
  assert.deepEqual(
    promotionSummary({ eligibility_reason: "consent_required" }),
    { label: "Non autorisé", tone: "muted" },
  );
});

test("promotionSummary : consentement expiré → Expiré", () => {
  assert.deepEqual(promotionSummary({ eligibility_reason: "consent_expired" }), {
    label: "Expiré",
    tone: "warn",
  });
});

test("promotionSummary : blocage compte/profil/photo → Inéligible", () => {
  for (const reason of [
    "account_suspended",
    "profile_incomplete",
    "photo_invalid",
    "photo_privacy_enabled",
  ]) {
    assert.deepEqual(promotionSummary({ eligibility_reason: reason }), {
      label: "Inéligible",
      tone: "warn",
    });
  }
});

test("les statuts de lien du backend ont tous un libellé", () => {
  for (const status of ["active", "expired", "revoked", "invalidated"]) {
    assert.equal(typeof PROMOTION_LINK_STATUS_LABELS[status], "string");
  }
  assert.equal(PROMOTION_LINK_STATUS_LABELS.active, "Actif");
  assert.equal(PROMOTION_LINK_STATUS_LABELS.revoked, "Révoqué");
});

// ---------------------------------------------------------------------------
// Fonctions pures — durées.
// ---------------------------------------------------------------------------
const NOW = new Date("2026-07-28T12:00:00.000Z");

test("les quatre durées proposées sont fermées et validées", () => {
  for (const minutes of [60, 1440, 10080, 43200]) {
    assert.equal(isPromotionDuration(minutes), true);
  }
  assert.equal(isPromotionDuration(90), false);
  assert.equal(isPromotionDuration(0), false);
});

test("durée 1 h : marge de sécurité au-dessus du minimum SQL d'une heure", () => {
  const iso = shareLinkExpiryIso(NOW, 60);
  const deltaMs = new Date(iso).getTime() - NOW.getTime();
  assert.ok(deltaMs > 60 * 60 * 1000, "doit dépasser strictement 1 h");
  assert.equal(deltaMs, 62 * 60 * 1000);
});

test("durée 30 j : reste strictement sous la limite SQL de 30 jours", () => {
  const iso = shareLinkExpiryIso(NOW, 43200);
  const deltaMs = new Date(iso).getTime() - NOW.getTime();
  assert.ok(deltaMs < 30 * 24 * 60 * 60 * 1000, "doit rester sous 30 j");
  assert.equal(deltaMs, 30 * 24 * 60 * 60 * 1000 - 2 * 60 * 1000);
});

test("consentement expirant dans 25 h : 1 h et 24 h seules disponibles", () => {
  const consent = new Date(NOW.getTime() + 25 * 60 * 60 * 1000).toISOString();
  const durations = availablePromotionDurations(NOW, consent);
  assert.deepEqual(
    durations.map((d) => [d.minutes, d.disabled]),
    [
      [60, false],
      [1440, false],
      [10080, true],
      [43200, true],
    ],
  );
});

test("consentement expirant dans 60 jours : toutes les durées disponibles", () => {
  const consent = new Date(
    NOW.getTime() + 60 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const durations = availablePromotionDurations(NOW, consent);
  assert.equal(durations.every((d) => !d.disabled), true);
});

test("consentement absent ou invalide : aucune durée disponible", () => {
  for (const consent of [null, "pas-une-date"]) {
    const durations = availablePromotionDurations(NOW, consent);
    assert.equal(durations.every((d) => d.disabled), true);
  }
});

// ---------------------------------------------------------------------------
// Fonctions pures — URLs et formatage.
// ---------------------------------------------------------------------------
test("promotionUrlFromToken construit l'URL canonique encodée", () => {
  assert.equal(
    promotionUrlFromToken("AbC123_-xyz"),
    "https://kassalafam.com/promo/AbC123_-xyz",
  );
});

test("buildWhatsAppShareUrl encode le texte et l'URL une seule fois", () => {
  const url = buildWhatsAppShareUrl("https://kassalafam.com/promo/T", "Bonjour & bienvenue");
  assert.ok(url.startsWith("https://wa.me/?text="));
  assert.ok(url.includes(encodeURIComponent("Bonjour & bienvenue")));
  assert.ok(url.includes(encodeURIComponent("https://kassalafam.com/promo/T")));
  assert.ok(!url.includes("Bonjour & bienvenue"));
});

test("buildFacebookShareUrl encode l'URL partagée", () => {
  const url = buildFacebookShareUrl("https://kassalafam.com/promo/T?x=1");
  assert.equal(
    url,
    `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
      "https://kassalafam.com/promo/T?x=1",
    )}`,
  );
});

test("isPromotionChannel n'accepte que les quatre canaux du backend", () => {
  for (const channel of ["facebook", "instagram", "snapchat", "whatsapp"]) {
    assert.equal(isPromotionChannel(channel), true);
  }
  assert.equal(isPromotionChannel("telegram"), false);
  assert.equal(isPromotionChannel(""), false);
});

test("formatPromotionDate : valeurs absentes ou invalides → tiret", () => {
  assert.equal(formatPromotionDate(null), "—");
  assert.equal(formatPromotionDate(undefined), "—");
  assert.equal(formatPromotionDate("pas-une-date"), "—");
});

test("formatPromotionDate : date ISO rendue en français", () => {
  const rendered = formatPromotionDate("2026-07-28T12:00:00.000Z");
  assert.notEqual(rendered, "—");
  assert.match(rendered, /2026/);
});
