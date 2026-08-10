/**
 * Contrôles structurels : interface de l'échange de coordonnées (carte de
 * conversation). `node --test scripts/contact-exchange-card.test.mjs`
 *
 * Complète scripts/contact-exchange.test.mjs (migration) : ici on verrouille le
 * CLIENT — aucun identifiant sensible envoyé depuis le DOM, aucun numéro
 * affiché hors de la RPC, aucun motif de verrou révélé au demandeur.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [card, view, types, pkg] = await Promise.all([
  readFile("src/components/member/contact-exchange-card.tsx", "utf8"),
  readFile("src/components/member/conversation-view.tsx", "utf8"),
  readFile("src/lib/types/database.ts", "utf8"),
  readFile("package.json", "utf8"),
]);

/** Code sans commentaires : une règle citée en commentaire ne compte pas. */
const code = card
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

test("la carte est un Client Component exporté et monté dans la conversation", () => {
  assert.match(card, /^"use client";/);
  assert.match(card, /export function ContactExchangeCard\(/);
  assert.match(view, /import \{ ContactExchangeCard \} from "@\/components\/member\/contact-exchange-card"/);
  assert.match(
    view,
    /<ContactExchangeCard\s+matchId=\{matchId\}\s+otherName=\{otherName\}\s+messagingAvailable=\{relation\.messaging_available\}\s*\/>/,
  );
});

test("messagerie indisponible : la carte ne propose plus rien, sauf le retrait (accepted)", () => {
  // Le garde !messagingAvailable arrive APRÈS le bloc accepted (le retrait
  // d'accord doit rester possible même après un blocage) et AVANT les blocs
  // pending / demande / incitation.
  const accepted = code.indexOf('status.state === "accepted"');
  const garde = code.indexOf("if (!messagingAvailable) {");
  const pending = code.indexOf('status.state === "pending"');
  assert.ok(accepted !== -1 && garde !== -1 && pending !== -1);
  assert.ok(accepted < garde && garde < pending, "garde mal placée");
});

test("après un refus dans la session, ni proposition ni incitation Premium", () => {
  assert.match(code, /if \(status\.can_request && !justDeclined\)/);
  assert.match(code, /if \(isPremium === false && !justDeclined\)/);
  assert.match(code, /if \(decision === "decline"\) setJustDeclined\(true\);/);
});

test("le client n'envoie JAMAIS d'identifiant de membre : p_match et p_decision seuls", () => {
  const payloads = [...code.matchAll(/supabase\.rpc\(\s*"([a-z_]+)"(?:,\s*(\{[^}]*\}))?/g)];
  const attendus = new Set([
    "get_contact_exchange",
    "get_my_premium_status",
    "request_contact_exchange",
    "respond_to_contact_exchange",
    "revoke_contact_exchange",
  ]);
  const vus = new Set(payloads.map(([, nom]) => nom));
  for (const nom of attendus) {
    assert.ok(vus.has(nom), `appel RPC ${nom} introuvable`);
  }
  for (const [, nom, args] of payloads) {
    assert.ok(attendus.has(nom), `RPC inattendue dans la carte : ${nom}`);
    if (!args) continue;
    const cles = [...args.matchAll(/([a-z_]+)\s*:/g)].map(([, c]) => c);
    for (const cle of cles) {
      assert.ok(
        ["p_match", "p_decision"].includes(cle),
        `paramètre interdit envoyé depuis le DOM : ${cle}`,
      );
    }
  }
});

test("un numéro ne peut venir QUE de la RPC (other_whatsapp / my_whatsapp)", () => {
  // Aucune autre source de numéro : ni profiles, ni variable publique, ni dur.
  assert.doesNotMatch(code, /whatsapp_phone/);
  assert.doesNotMatch(code, /NEXT_PUBLIC_WHATSAPP_CONTACT/);
  assert.doesNotMatch(code, /\+?237\d{6,}/, "aucun numéro en dur");
  // Le lien wa.me passe par le normaliseur partagé, sur le numéro de la RPC.
  assert.match(code, /normalizeWhatsappNumber\(status\.other_whatsapp/);
  assert.match(code, /https:\/\/wa\.me\/\$\{digits\}/);
});

test("les numéros ne s'affichent que dans l'état accepted", () => {
  // Les seuls rendus de numéros sont DANS le bloc accepted (avant le bloc
  // pending) : on vérifie l'ordre des sections du fichier.
  const accepted = code.indexOf('status.state === "accepted"');
  const pending = code.indexOf('status.state === "pending"');
  assert.ok(accepted !== -1 && pending !== -1 && accepted < pending);
  const apresAccepted = code.slice(pending);
  assert.doesNotMatch(apresAccepted, /\{status\.other_whatsapp\}/);
  assert.doesNotMatch(apresAccepted, /\{status\.my_whatsapp\}/);
});

test("aucun motif de verrou n'est révélé : LOCKED et CLOSED_BY_TARGET restent neutres", () => {
  // Ces deux exceptions ne doivent avoir AUCUNE branche dédiée : elles tombent
  // dans le message neutre par défaut.
  assert.doesNotMatch(code, /includes\("CONTACT_EXCHANGE_LOCKED"\)/);
  assert.doesNotMatch(code, /includes\("CONTACT_EXCHANGE_CLOSED_BY_TARGET"\)/);
  assert.doesNotMatch(code, /CONVERSATION_UNAVAILABLE"\)/);
  // Et le message neutre existe bel et bien.
  assert.match(code, /n’est pas disponible pour cette conversation/);
});

test("l'incitation Premium exige isPremium === false STRICT (jamais pour couvrir un verrou)", () => {
  assert.match(code, /isPremium === false/);
  // Un membre premium sans can_request (verrou) ne voit RIEN : le fallback
  // final rend null (ou la notice passagère seule).
  assert.match(code, /return notice \? <div className="px-1">\{noticeLine\}<\/div> : null;\s*\}\s*$/);
});

test("garde du plafond quotidien et confirmations avant demande et retrait", () => {
  assert.match(code, /disabled=\{busy \|\| left <= 0\}/);
  assert.match(code, /setConfirming\("request"\)/);
  assert.match(code, /setConfirming\("revoke"\)/);
  // Refuser/accepter : action directe de la personne sollicitée, sans envoi
  // d'autre paramètre que la décision contrôlée.
  assert.match(code, /doRespond\("accept"\)/);
  assert.match(code, /doRespond\("decline"\)/);
});

test("le backend reste l'autorité : re-synchronisation après CHAQUE écriture", () => {
  for (const fn of ["doRequest", "doRespond", "doRevoke"]) {
    const debut = code.indexOf(`const ${fn} = useCallback(`);
    assert.notEqual(debut, -1, `${fn} introuvable`);
    const bloc = code.slice(debut, code.indexOf("}, [", debut));
    assert.match(bloc, /await refresh\(\);/, `${fn} ne relit pas l'état serveur`);
  }
});

test("les 4 RPC et le type ContactExchangeStatus sont déclarés dans database.ts", () => {
  assert.match(types, /export type ContactExchangeStatus = \{/);
  for (const rpc of [
    "get_contact_exchange",
    "request_contact_exchange",
    "respond_to_contact_exchange",
    "revoke_contact_exchange",
  ]) {
    assert.match(
      types,
      new RegExp(`${rpc}: \\{\\s*\\n\\s*Args: \\{ p_match: string`),
      `typage Functions manquant : ${rpc}`,
    );
  }
});

test("package.json expose la suite", () => {
  assert.match(pkg, /"test:contact-exchange-card": "node --test scripts\/contact-exchange-card\.test\.mjs"/);
});
