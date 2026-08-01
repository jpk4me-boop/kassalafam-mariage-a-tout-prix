/**
 * SebPay member checkout tests (node:test, zero network access).
 * `node --conditions=react-server --test scripts/sebpay-checkout.test.mjs`
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  SEBPAY_CHECKOUT_PLAN_CODES,
  SebPayCheckoutError,
  handleSebPayCheckout,
  parseCheckoutRequest,
  toCheckoutErrorCode,
} from "../src/lib/server/sebpay/checkout.ts";

const DISABLED_ENV = Object.freeze({
  SEBPAY_PAYMENTS_ENABLED: "false",
  // Volontairement AUCUNE clé : le mode désactivé ne doit rien lire.
});

const OPEN_ENV = Object.freeze({
  SEBPAY_PAYMENTS_ENABLED: "true",
  SEBPAY_PILOT_MODE: "false",
  SEBPAY_ENVIRONMENT: "test",
  SEBPAY_PUBLIC_KEY: "pk_test_synthetic",
  SEBPAY_SECRET_KEY: "sk_test_synthetic",
});

const PILOT_ENV = Object.freeze({
  ...OPEN_ENV,
  SEBPAY_PILOT_MODE: "true",
  SEBPAY_PILOT_MTN_PHONE: "237670000001",
  // Orange volontairement non configuré : refus systématique.
});

const VALID_PAYLOAD = Object.freeze({
  planCode: "premium_1_mois",
  operator: "mtn-cm",
  payerPhone: "237670000001",
});

const TRANSACTION = Object.freeze({
  transactionId: "11111111-1111-4111-8111-111111111111",
  idempotencyKey: "kslf_0123456789abcdef0123456789abcdef",
  amountXaf: 2500,
});

function unusedDeps() {
  const fail = () => {
    throw new Error("Cette dépendance ne doit pas être appelée ici.");
  };

  return {
    initiateTransaction: fail,
    initiateCollection: fail,
    applyUpdate: fail,
  };
}

// ---------------------------------------------------------------------------
// Validation du payload client
// ---------------------------------------------------------------------------

test("valid payloads are parsed, everything else is rejected", () => {
  const parsed = parseCheckoutRequest({ ...VALID_PAYLOAD });

  assert.deepEqual(parsed, VALID_PAYLOAD);

  for (const invalid of [
    null,
    [],
    "text",
    {},
    { ...VALID_PAYLOAD, planCode: "premium_15_jours" },
    { ...VALID_PAYLOAD, operator: "mtn-bj" },
    { ...VALID_PAYLOAD, payerPhone: "670000001" },
    { ...VALID_PAYLOAD, payerPhone: "+237670000001" },
    { ...VALID_PAYLOAD, payerPhone: "23767000000" },
    { ...VALID_PAYLOAD, payerPhone: 237670000001 },
  ]) {
    assert.equal(parseCheckoutRequest(invalid), null);
  }
});

test("the checkout plan allowlist matches the seeded catalogue codes", () => {
  assert.deepEqual(SEBPAY_CHECKOUT_PLAN_CODES, [
    "premium_1_mois",
    "premium_3_mois",
    "premium_6_mois",
  ]);
});

test("toCheckoutErrorCode extracts known business codes", () => {
  assert.equal(
    toCheckoutErrorCode('P0001: PREMIUM_ALREADY_ACTIVE details'),
    "PREMIUM_ALREADY_ACTIVE",
  );
  assert.equal(
    toCheckoutErrorCode("PAYMENT_ALREADY_IN_PROGRESS"),
    "PAYMENT_ALREADY_IN_PROGRESS",
  );
  assert.equal(toCheckoutErrorCode("boom"), "UNKNOWN");
});

// ---------------------------------------------------------------------------
// Portes de configuration
// ---------------------------------------------------------------------------

test("disabled payments answer 503 without reading any secret", async () => {
  const outcome = await handleSebPayCheckout({
    rawPayload: { ...VALID_PAYLOAD },
    environment: DISABLED_ENV,
    ...unusedDeps(),
  });

  assert.deepEqual(outcome, {
    status: 503,
    body: { ok: false, code: "payments_closed" },
  });
});

test("enabled but incomplete configuration answers 503", async () => {
  const outcome = await handleSebPayCheckout({
    rawPayload: { ...VALID_PAYLOAD },
    environment: { SEBPAY_PAYMENTS_ENABLED: "true" },
    ...unusedDeps(),
  });

  assert.deepEqual(outcome, {
    status: 503,
    body: { ok: false, code: "payments_closed" },
  });
});

test("invalid payloads answer 400 before any write", async () => {
  const outcome = await handleSebPayCheckout({
    rawPayload: { ...VALID_PAYLOAD, payerPhone: "12345" },
    environment: OPEN_ENV,
    ...unusedDeps(),
  });

  assert.deepEqual(outcome, {
    status: 400,
    body: { ok: false, code: "invalid_request" },
  });
});

// ---------------------------------------------------------------------------
// Garde pilote
// ---------------------------------------------------------------------------

test("pilot mode refuses non-pilot numbers before any write", async () => {
  const wrongNumber = await handleSebPayCheckout({
    rawPayload: { ...VALID_PAYLOAD, payerPhone: "237699999999" },
    environment: PILOT_ENV,
    ...unusedDeps(),
  });

  assert.deepEqual(wrongNumber, {
    status: 403,
    body: { ok: false, code: "pilot_restricted" },
  });

  // Opérateur sans numéro pilote configuré : refus aussi.
  const orange = await handleSebPayCheckout({
    rawPayload: {
      ...VALID_PAYLOAD,
      operator: "orange-cm",
      payerPhone: "237690000001",
    },
    environment: PILOT_ENV,
    ...unusedDeps(),
  });

  assert.deepEqual(orange, {
    status: 403,
    body: { ok: false, code: "pilot_restricted" },
  });
});

test("pilot mode lets the configured pilot number through", async () => {
  const calls = [];

  const outcome = await handleSebPayCheckout({
    rawPayload: { ...VALID_PAYLOAD },
    environment: PILOT_ENV,
    initiateTransaction: async (input) => {
      calls.push(["transaction", input]);
      return { ...TRANSACTION };
    },
    initiateCollection: async (input) => {
      calls.push(["collection", input]);
      return {
        provider: "sebpay",
        providerReference: "20260801000000000042",
        status: "pending",
      };
    },
    applyUpdate: async (input) => {
      calls.push(["apply", input]);
    },
  });

  assert.equal(outcome.status, 200);
  assert.equal(calls.length, 3);
});

// ---------------------------------------------------------------------------
// Erreurs métier de l'initiation
// ---------------------------------------------------------------------------

test("business errors from the initiation RPC map to explicit statuses", async () => {
  const scenarios = [
    ["PREMIUM_ALREADY_ACTIVE", 409, "premium_already_active"],
    ["PAYMENT_ALREADY_IN_PROGRESS", 409, "payment_in_progress"],
    ["PREMIUM_PLAN_NOT_AVAILABLE", 400, "plan_not_available"],
    ["ACCOUNT_SUSPENDED", 403, "account_not_eligible"],
    ["PROFILE_NOT_FOUND", 403, "account_not_eligible"],
    ["UNKNOWN", 500, "internal_error"],
  ];

  for (const [code, expectedStatus, expectedCode] of scenarios) {
    const outcome = await handleSebPayCheckout({
      rawPayload: { ...VALID_PAYLOAD },
      environment: OPEN_ENV,
      initiateTransaction: async () => {
        throw new SebPayCheckoutError(code);
      },
      initiateCollection: unusedDeps().initiateCollection,
      applyUpdate: unusedDeps().applyUpdate,
    });

    assert.deepEqual(outcome, {
      status: expectedStatus,
      body: { ok: false, code: expectedCode },
    });
  }
});

// ---------------------------------------------------------------------------
// Chemin nominal et défaillances fournisseur
// ---------------------------------------------------------------------------

test("happy path wires the three steps in order and answers 200", async () => {
  const calls = [];

  const outcome = await handleSebPayCheckout({
    rawPayload: { ...VALID_PAYLOAD },
    environment: OPEN_ENV,
    initiateTransaction: async (input) => {
      calls.push(["transaction", input.planCode]);
      return { ...TRANSACTION };
    },
    initiateCollection: async (input) => {
      calls.push(["collection", input]);
      return {
        provider: "sebpay",
        providerReference: "20260801000000000042",
        status: "pending",
      };
    },
    applyUpdate: async (input) => {
      calls.push(["apply", input]);
    },
  });

  assert.deepEqual(outcome, {
    status: 200,
    body: {
      ok: true,
      transactionId: TRANSACTION.transactionId,
      paymentStatus: "pending",
    },
  });

  assert.deepEqual(calls[0], ["transaction", "premium_1_mois"]);
  assert.deepEqual(calls[1], [
    "collection",
    {
      externalReference: TRANSACTION.idempotencyKey,
      amountXaf: 2500,
      payerPhone: "237670000001",
      operator: "mtn-cm",
    },
  ]);
  assert.deepEqual(calls[2], [
    "apply",
    {
      providerReference: "20260801000000000042",
      externalReference: TRANSACTION.idempotencyKey,
      rawStatus: "initiation_pending",
      mappedStatus: "pending",
      amountXaf: 2500,
      currency: "XAF",
    },
  ]);
});

test("provider failure answers 502 and NEVER marks the transaction failed", async () => {
  const applied = [];

  const outcome = await handleSebPayCheckout({
    rawPayload: { ...VALID_PAYLOAD },
    environment: OPEN_ENV,
    initiateTransaction: async () => ({ ...TRANSACTION }),
    initiateCollection: async () => {
      throw new Error("network down");
    },
    applyUpdate: async (input) => {
      applied.push(input);
    },
  });

  assert.deepEqual(outcome, {
    status: 502,
    body: { ok: false, code: "provider_unavailable" },
  });

  // Fail-closed : aucun `failed` spéculatif — webhook / réconciliation /
  // auto-annulation trancheront.
  assert.equal(applied.length, 0);
});

test("a failing status link does not block the member (webhook catches up)", async () => {
  const outcome = await handleSebPayCheckout({
    rawPayload: { ...VALID_PAYLOAD },
    environment: OPEN_ENV,
    initiateTransaction: async () => ({ ...TRANSACTION }),
    initiateCollection: async () => ({
      provider: "sebpay",
      providerReference: "20260801000000000042",
      status: "pending",
    }),
    applyUpdate: async () => {
      throw new Error("database hiccup");
    },
  });

  assert.deepEqual(outcome, {
    status: 200,
    body: {
      ok: true,
      transactionId: TRANSACTION.transactionId,
      paymentStatus: "pending",
    },
  });
});

test("an immediate provider decision is passed through to the client", async () => {
  const outcome = await handleSebPayCheckout({
    rawPayload: { ...VALID_PAYLOAD },
    environment: OPEN_ENV,
    initiateTransaction: async () => ({ ...TRANSACTION }),
    initiateCollection: async () => ({
      provider: "sebpay",
      providerReference: "20260801000000000042",
      status: "failed",
    }),
    applyUpdate: async () => {},
  });

  assert.equal(outcome.status, 200);
  assert.equal(outcome.body.paymentStatus, "failed");
});
