/**
 * Contrôles structurels : fondation des notifications WhatsApp (PR A).
 * `node --test scripts/whatsapp-notifications.test.mjs`
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [migration, card, profilePage, types, pkg] = await Promise.all([
  readFile(
    "supabase/migrations/20260803220000_create_whatsapp_notifications_foundation.sql",
    "utf8",
  ),
  readFile("src/components/member/whatsapp-notifications-card.tsx", "utf8"),
  readFile("src/app/(member)/profile/page.tsx", "utf8"),
  readFile("src/lib/types/database.ts", "utf8"),
  readFile("package.json", "utf8"),
]);

test("la migration est additive : aucun backfill, aucune écriture de données", () => {
  assert.match(migration, /create table if not exists public\.notification_channel_consents/);
  assert.match(migration, /create table if not exists public\.notification_deliveries/);
  // Aucune modification des données existantes (les insert des triggers ne
  // s'exécutent qu'au fil de l'eau, jamais à l'application).
  assert.doesNotMatch(migration, /update public\.profiles/i);
  assert.doesNotMatch(migration, /update public\.member_notifications/i);
  assert.doesNotMatch(migration, /delete from/i);
});

test("le consentement est explicite, par canal, et le canal push est déjà prévu", () => {
  assert.match(migration, /channel in \('whatsapp', 'push'\)/);
  assert.match(migration, /grant_my_whatsapp_notifications/);
  assert.match(migration, /withdraw_my_whatsapp_notifications/);
  assert.match(migration, /NOTIFICATIONS_PHONE_REQUIRED/);
  // Jamais activé par défaut : l'accord passe par la RPC, pas par un default.
  assert.doesNotMatch(migration, /granted_at.*default.*profiles/i);
});

test("les RPC membre sont SECURITY DEFINER, search_path fixé, GRANT minimaux", () => {
  const rpcCount = (migration.match(/security definer/gi) ?? []).length;
  assert.ok(rpcCount >= 3, "RPC + triggers en security definer");
  const spCount = (migration.match(/set search_path = ''/g) ?? []).length;
  assert.ok(spCount >= 6, "search_path fixé partout");
  assert.match(migration, /revoke all on function public\.grant_my_whatsapp_notifications\(\) from anon/);
  assert.match(migration, /grant execute on function public\.grant_my_whatsapp_notifications\(\) to authenticated/);
});

test("la file de livraison est verrouillée : service_role seul, états terminaux immuables", () => {
  assert.match(migration, /revoke all on public\.notification_deliveries from authenticated/);
  assert.match(migration, /DELIVERY_TERMINAL_STATUS_IMMUTABLE/);
  assert.match(migration, /'pending', 'sent', 'failed', 'skipped'/);
});

test("l'enfilement respecte le périmètre V1 : types autorisés, consentement, dédup", () => {
  assert.match(migration, /'new_message', 'new_interest', 'interest_accepted',/);
  assert.match(migration, /'verification_approved', 'verification_rejected', 'verification_paused',/);
  assert.match(migration, /'account_security'/);
  assert.match(migration, /withdrawn_at is null/);
  assert.match(migration, /d\.status = 'pending'/);
});

test("les triggers source ne divulguent JAMAIS le contenu ni l'identité", () => {
  // Le corps des notifications est un texte FIXE : jamais new.content, jamais
  // un prénom d'autre membre.
  assert.doesNotMatch(migration, /new\.content/);
  assert.doesNotMatch(migration, /first_name/);
  assert.match(migration, /trg_messages_notify_new_message/);
  assert.match(migration, /trg_matches_notify_new_interest/);
  assert.match(migration, /trg_matches_notify_interest_accepted/);
  // Anti-rafale : dédup sur les notifications NON LUES.
  assert.match(migration, /read_at is null/);
});

test("la carte opt-in est un îlot client fidèle à la base", () => {
  assert.match(card, /"use client"/);
  for (const rpc of [
    "get_my_whatsapp_notifications_status",
    "grant_my_whatsapp_notifications",
    "withdraw_my_whatsapp_notifications",
  ]) {
    assert.match(card, new RegExp(rpc), `RPC non câblée : ${rpc}`);
  }
  // La base reste l'autorité : le statut est relu après chaque action.
  assert.match(card, /const fresh = await fetchWhatsappState\(\)/);
  // Le membre est informé : contenu jamais transmis, retrait à tout moment.
  assert.match(card, /Jamais le\s*\n?\s*contenu/);
  assert.match(card, /retirer\s*\n?\s*votre accord à tout moment/i);
  assert.match(card, /Retirer mon accord/);
  // Aucun accès privilégié côté client.
  assert.doesNotMatch(card, /createAdminClient|service_role/i);
});

test("la carte est montée sur /profile", () => {
  assert.match(
    profilePage,
    /import \{ WhatsappNotificationsCard \} from "@\/components\/member\/whatsapp-notifications-card"/,
  );
  assert.match(profilePage, /<WhatsappNotificationsCard \/>/);
});

test("les types des RPC sont déclarés", () => {
  assert.match(types, /WhatsappNotificationsStatusRow/);
  assert.match(types, /get_my_whatsapp_notifications_status: \{/);
  assert.match(types, /grant_my_whatsapp_notifications: \{/);
  assert.match(types, /withdraw_my_whatsapp_notifications: \{/);
});

test("le script de test est déclaré dans package.json", () => {
  assert.match(
    pkg,
    /"test:whatsapp-notifications": "node --test scripts\/whatsapp-notifications\.test\.mjs"/,
  );
});
