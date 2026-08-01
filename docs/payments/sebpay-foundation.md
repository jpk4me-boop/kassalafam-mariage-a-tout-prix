# SebPay secure foundation - PR #79 (unlocked by the verified adapter)

## State

The merchant contract was verified on 2026-07-31 against the official
documentation (new.sebpay.bj/fr/docs) and authenticated read-only API calls
(`GET /api/v1/operators?country=CM`, `GET /api/v1/countries`). Since then:

- `SEBPAY_PAYMENTS_ENABLED` still defaults to `false` — enabling it is a
  deliberate configuration act, gated by the pilot procedure.
- The confirmed API origin allowlist contains the single verified origin
  `https://newapi.sebpay.bj` (still not expandable through environment
  variables).
- The verified adapter (`adapter.ts`) implements `POST /api/v1/collections`
  and `GET /api/v1/collections/{id_or_reference}` with the
  `X-Public-Key` / `X-Secret-Key` headers, Cameroon-only scope
  (`mtn-cm` / `orange-cm`, phone `237XXXXXXXXX`, `XAF`), and a fail-closed
  status mapping (`pending` → pending, `approved`/`SUCCESS` → succeeded,
  `rejected`/`FAILED` → failed).
- Credentials are read ONLY when payments are enabled, are validated against
  the configured environment (`pk_test_`/`sk_test_` vs `pk_live_`/`sk_live_`),
  and never appear in error messages.
- Pilot mode (`SEBPAY_PILOT_MODE`, default `true`) restricts collections to
  the configured pilot numbers (`SEBPAY_PILOT_MTN_PHONE`,
  `SEBPAY_PILOT_ORANGE_PHONE`) — with no configured number, every payment is
  refused before any network call.
- Phase 3 delivered the webhook + activation machinery (see below). The
  member-facing checkout flow on `/premium` remains for Phase 4.

## Phase 3 — webhook, idempotent journal, Premium activation

- `POST /api/webhooks/sebpay` (logic in `src/lib/server/sebpay/webhook.ts`,
  fully unit-testable): 503 while payments are disabled (no secret read),
  constant-time verification of `X-SebPay-Signature` (HMAC-SHA256 of the raw
  body with the secret key; hex and base64 digest encodings both accepted —
  the exact encoding is confirmed on the first pilot transaction), 401 on bad
  signature, 400 on non-contractual payloads (unknown statuses fail closed),
  200 within one SQL round-trip (well under the required 5 s), 500 on
  persistence failure so SebPay retries.
- `apply_sebpay_payment_update` (SECURITY DEFINER, service_role only) is the
  single authoritative transition path: terminal transaction statuses are
  immutable, `pending` only moves forward, `succeeded` requires an exact
  amount/currency match, and every event is recorded in the append-only
  `payment_webhook_events` journal (deduplicated per provider reference and
  announced status; `customer_phone` is never persisted).
- A successful payment activates Premium exclusively through
  `premium_subscriptions` (source `payment`, provider ref = SebPay
  `transaction_id`) plus a `payment_activated` action log entry —
  `profiles.is_premium` is still only written by the sync trigger. Blocked
  activations (missing/suspended profile, already-active Premium) mark the
  transaction `succeeded` but create no subscription; the journal records the
  blocked result for admin resolution.
- `GET /api/cron/reconcile-sebpay` (Bearer `CRON_SECRET`, daily via
  `vercel.json`) is the fallback path: it polls
  `GET /collections/{external_reference}` for stale `initiated`/`pending`
  transactions and applies the same RPC. It is a no-op while payments are
  disabled. The schedule can be tightened (e.g. `*/15 * * * *`) on a Vercel
  plan that allows it.
- Tests: `npm run test:sebpay-webhook` (zero network access).

## Security invariants

1. Environment variables cannot expand the API-origin allowlist by themselves.
2. Disabled mode does not read API keys, pilot phone numbers, callback URLs, or
   provider endpoints.
3. A request is rejected before `fetch` when its origin is not allowlisted.
4. The generic transport always sets `redirect: "error"`, `cache: "no-store"`,
   `credentials: "omit"`, and `referrerPolicy: "no-referrer"`.
5. Response bodies are size-limited and must contain valid JSON.
6. Provider error bodies are not propagated to callers.
7. `profiles.is_premium` is never written by this foundation.

## Future activation gates

Before adding a real adapter, independently confirm:

- exact sandbox and live origins;
- exact authentication headers;
- payment-creation and status routes;
- request and response schemas;
- Cameroon operator identifiers and phone format;
- complete status mapping;
- idempotency guarantees;
- webhook signature and replay protection;
- reconciliation rules after timeout or partial failure.

Production secrets, Vercel variables, real payments, and any Supabase Production
migration require separate explicit authorization.