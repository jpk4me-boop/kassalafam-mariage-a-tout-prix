# SebPay secure foundation - PR #79

## State

This foundation is deliberately locked:

- `SEBPAY_PAYMENTS_ENABLED` defaults to `false`.
- The confirmed API origin allowlist is empty.
- No SebPay endpoint is implemented.
- No authentication header is implemented.
- No provider payload or status mapping is implemented.
- No webhook route or signature verification is implemented.
- No Premium activation path is implemented.

The provider remains unusable until the official merchant contract is verified
from an authoritative SebPay source.

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