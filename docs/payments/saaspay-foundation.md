# Saaspay (SasPay) — fondation (PR A)

Saaspay remplace SebPay comme passerelle unique. Cette PR pose la fondation,
**désactivée par défaut** : aucune page membre ne l'utilise encore.

## Contrat (docs.saspay.me, lu le 19/11/2026)

- Origines : `https://sandbox-api.saspay.me` (test) et `https://api.saspay.me`
  (live), chemin `/api/v1`. C'est l'origine qui choisit l'environnement.
- Authentification : `Authorization: Bearer sk_test_…` / `sk_live_…`.
- Paiement Mobile Money : `POST /payments/softpay/` avec `Idempotency-Key`.
  Corps : `amount` (« 5900.00 »), `currency`, `country`, `network`,
  `customer { email, first_name, last_name, phone }`, `description`,
  `metadata`. Réponse `{ success, data: { id, status, checkout_url } }`.
- Statut : `GET /payments/{id}/verify/` → `PENDING`, `SUCCESS`, `FAILED`,
  `CANCELLED`.
- Cameroun (XAF) : réseaux `mtn_cm` et `orange_cm`.
- Webhooks : `X-Webhook-Signature` = HMAC-SHA256 hexadécimal de
  `{X-Webhook-Timestamp}.{corps brut}` avec le `signing_secret`, tolérance
  300 s, 5 tentatives jusqu'à +2 h. Événements utilisés :
  `transaction.created|success|failed|cancelled`.
- Pas d'abonnement récurrent : le Premium reste un paiement par période.

## Ce que contient la fondation

- `src/lib/server/saaspay/` : configuration (aucun secret lu tant que
  `SAASPAY_PAYMENTS_ENABLED=false`), adaptateur `softpay` / `verify`,
  vérification et analyse des webhooks.
- `POST /api/webhooks/saaspay` : 503 désactivé, 401 signature ou horodatage
  invalide, 400 hors contrat, 200 traité ou ignoré, 500 si la base échoue.
- Migration additive `apply_saaspay_payment_update` (service_role
  uniquement) : même machine à états que la RPC SebPay, `provider =
  'saaspay'`, statut `cancelled` en plus. Aucune table modifiée.

## Points à confirmer au premier test sandbox

- Correspondance webhook ↔ transaction : par `data.id`, enregistré comme
  `provider_reference` dès l'initiation (PR B).
- Forme exacte de `data` pour `transaction.failed` et `transaction.cancelled`
  (non documentée : le statut est alors déduit de l'événement).
- Numéros de test sandbox : le dernier chiffre décide (0 succès, 1 échec,
  2 solde insuffisant, 9 en attente).

## Suite

- PR B : initiation depuis `/premium`, suivi de transaction, réconciliation.
- PR C : retrait de SebPay (code, variables, cron, fonctions SQL — accord
  explicite requis pour la Production). Le transport HTTP générique
  (`GuardedJsonTransport`), aujourd'hui dans `sebpay/foundation-core.ts`, sera
  déplacé à ce moment-là.
