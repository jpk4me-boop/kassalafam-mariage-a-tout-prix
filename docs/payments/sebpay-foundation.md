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
- No webhook route is implemented yet (next phase): the documented signature
  is `X-SebPay-Signature`, an HMAC-SHA256 of the JSON body computed with the
  secret key; replays are possible and must be deduplicated by
  `transaction_id`, and the endpoint must answer HTTP 200 within 5 seconds.
- No Premium activation path is implemented yet (next phases).

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