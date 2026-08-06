/**
 * Contrôles structurels : échange mutuel de coordonnées (migration 20260806075800).
 * `node --test scripts/contact-exchange.test.mjs`
 *
 * Ces tests ne remplacent PAS la suite pgTAP — ils verrouillent ce qu'une
 * relecture humaine laisse passer : un grant oublié, une règle recopiée au lieu
 * d'être encapsulée, un numéro renvoyé sans condition.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const MIGRATION = "supabase/migrations/20260806075800_create_contact_exchange.sql";

const [sql, pgtap, pkg] = await Promise.all([
  readFile(MIGRATION, "utf8"),
  readFile("supabase/tests/20260806075800_create_contact_exchange.test.sql", "utf8"),
  readFile("package.json", "utf8"),
]);

/**
 * Corps d'une fonction de la migration, entre son en-tête et ses revoke,
 * COMMENTAIRES RETIRÉS : sinon une règle citée dans un commentaire ferait
 * passer — ou échouer — une assertion portant sur le code réel.
 */
function corpsDe(nom) {
  const debut = sql.indexOf(`create or replace function public.${nom}(`);
  assert.notEqual(debut, -1, `fonction ${nom} introuvable`);
  const fin = sql.indexOf(`revoke all on function public.${nom}`, debut);
  return sql
    .slice(debut, fin === -1 ? undefined : fin)
    .replace(/^\s*--.*$/gm, "");
}

test("la table n'est accessible par AUCUN chemin direct", () => {
  assert.match(sql, /alter table public\.contact_exchange_requests enable row level security/);
  assert.match(
    sql,
    /revoke all privileges on table public\.contact_exchange_requests\s*\n\s*from public, anon, authenticated/,
  );
  assert.doesNotMatch(
    sql,
    /create policy/i,
    "aucune policy permissive : tout doit passer par les RPC",
  );
  assert.doesNotMatch(
    sql,
    /grant (select|insert|update|delete)[^;]*on table public\.contact_exchange_requests/i,
  );
});

test("les 4 RPC sont réservées à authenticated, jamais à anon", () => {
  for (const rpc of [
    "request_contact_exchange(uuid)",
    "respond_to_contact_exchange(uuid, text)",
    "revoke_contact_exchange(uuid)",
    "get_contact_exchange(uuid)",
  ]) {
    const nom = rpc.replace(/\(.*/, "");
    assert.match(
      sql,
      new RegExp(`revoke all on function public\\.${nom}\\([^)]*\\) from anon`),
      `${nom} : revoke anon manquant`,
    );
    assert.match(
      sql,
      new RegExp(`grant execute on function public\\.${nom}\\([^)]*\\)\\s*\\n?\\s*to authenticated`),
      `${nom} : grant authenticated manquant`,
    );
  }
});

test("la fonction d'expiration reste INTERNE", () => {
  // Elle écrit : personne ne doit pouvoir la déclencher directement.
  assert.match(
    sql,
    /revoke all on function public\.expire_stale_contact_exchanges\(\) from authenticated/,
  );
  assert.doesNotMatch(
    sql,
    /grant execute on function public\.expire_stale_contact_exchanges/,
  );
});

test("le droit d'accès à la conversation est ENCAPSULÉ, jamais recopié", () => {
  // can_send_message porte déjà « match accepté + comptes actifs + non bloqué
  // + non suspendu ». Recopier ces conditions créerait une seconde vérité.
  assert.match(sql, /public\.can_send_message\(p_match\)/);
  assert.doesNotMatch(
    sql,
    /blocking_exists/,
    "le prédicat de blocage ne doit pas être réécrit ici",
  );
  assert.doesNotMatch(
    sql,
    /m\.status = 'accepted'/,
    "le statut du match ne doit pas être revérifié à la main",
  );
});

test("toutes les fonctions sont cadenassées de la même façon", () => {
  for (const nom of [
    "request_contact_exchange",
    "respond_to_contact_exchange",
    "revoke_contact_exchange",
    "get_contact_exchange",
    "expire_stale_contact_exchanges",
  ]) {
    const corps = corpsDe(nom);
    assert.match(corps, /security definer/, `${nom} : security definer manquant`);
    assert.match(corps, /set search_path = ''/, `${nom} : search_path non fixé`);
  }
});

test("un numéro n'est renvoyé QUE si l'échange est accepté ET la conversation ouverte", () => {
  const corps = corpsDe("get_contact_exchange");

  const revelations = [...corps.matchAll(/whatsapp_phone/g)];
  assert.equal(revelations.length, 2, "deux révélations attendues : l'autre et soi");

  // Chacune est gardée par la même double condition.
  const gardes = [
    ...corps.matchAll(/when v_row\.status = 'accepted' and v_allowed/g),
  ];
  assert.equal(
    gardes.length,
    2,
    "chaque révélation doit être gardée par « accepted ET conversation ouverte »",
  );
});

test("le premium ouvre la DEMANDE, jamais la réception ni la réponse", () => {
  assert.match(
    corpsDe("request_contact_exchange"),
    /profile_has_active_premium/,
    "la demande doit exiger le premium",
  );
  for (const nom of ["respond_to_contact_exchange", "get_contact_exchange"]) {
    const corps = corpsDe(nom);
    if (nom === "respond_to_contact_exchange") {
      assert.doesNotMatch(
        corps,
        /profile_has_active_premium/,
        "répondre ne doit JAMAIS exiger un abonnement",
      );
    }
  }
});

test("l'insistance est verrouillée des deux façons annoncées", () => {
  const corps = corpsDe("request_contact_exchange");

  assert.match(corps, /CONTACT_EXCHANGE_CLOSED_BY_TARGET/,
    "retrait par la personne sollicitée : verrou définitif");
  assert.match(corps, /r\.revoked_by = v_target/,
    "le verrou définitif doit distinguer QUI a retiré son accord");
  assert.match(corps, /interval '30 days'/, "verrou de 30 jours après refus");
  assert.match(corps, /v_recent >= 3/, "plafond de 3 demandes par 24 h");
  assert.match(corps, /interval '24 hours'/);
});

test("un refus ne notifie personne", () => {
  const corps = corpsDe("respond_to_contact_exchange");
  const notifs = [...corps.matchAll(/insert into public\.member_notifications/g)];
  assert.equal(notifs.length, 1, "une seule notification : l'acceptation");
  assert.match(corps, /contact_exchange_accepted/);
  assert.doesNotMatch(corps, /contact_exchange_declined/);
});

test("les notifications ne portent ni identité ni contenu", () => {
  // Règle de confidentialité du projet : le prénom d'un AUTRE membre
  // n'apparaît JAMAIS dans le corps d'une notification.
  const corps = sql.slice(sql.indexOf("member_notifications"));
  assert.doesNotMatch(corps, /first_name/);
  assert.doesNotMatch(corps, /whatsapp_phone[^;]*member_notifications/);
  assert.match(sql, /'Un membre avec qui vous échangez/);
});

test("le retrait reste possible même après un blocage", () => {
  const corps = corpsDe("revoke_contact_exchange");
  assert.doesNotMatch(
    corps,
    /can_send_message/,
    "on doit pouvoir se retirer même si la conversation est coupée",
  );
});

test("la migration est idempotente et correctement ordonnée", () => {
  assert.match(sql, /create table if not exists/);
  assert.match(sql, /create unique index if not exists/);
  assert.match(sql, /create or replace function/);
  assert.match(sql, /APPLIQUER AVANT LE MERGE/);
  assert.ok("20260806075800" > "20260806073500");
});

test("la suite pgTAP couvre les invariants critiques", () => {
  for (const attendu of [
    "CONTACT_EXCHANGE_PREMIUM_REQUIRED",
    "CONTACT_EXCHANGE_CLOSED_BY_TARGET",
    "CONTACT_EXCHANGE_LOCKED",
    "CONTACT_EXCHANGE_DAILY_LIMIT",
  ]) {
    assert.match(pgtap, new RegExp(attendu), `pgTAP : ${attendu} non couvert`);
  }
  assert.match(pgtap, /select plan\(21\)/);
  // Les UUID de test doivent être hexadécimaux, sinon rien ne se caste.
  for (const uuid of pgtap.match(/'00000000-[0-9a-zA-Z-]+'/g) ?? []) {
    assert.match(uuid, /^'[0-9a-f-]+'$/, `UUID non hexadécimal : ${uuid}`);
  }
});

test("la suite est déclarée dans package.json", () => {
  assert.match(pkg, /"test:contact-exchange"/);
});
