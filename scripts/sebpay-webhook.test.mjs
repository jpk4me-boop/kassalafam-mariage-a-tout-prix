/**
 * SebPay webhook tests (node:test, zero network access).
 * `node --conditions=react-server --test scripts/sebpay-webhook.test.mjs`
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import { PaymentFoundationError } from "../src/lib/server/sebpay/foundation-core.ts";
import {
  SEBPAY_SIGNATURE_HEADER,
  handleSebPayWebhook,
  parseSebPayWebhookPayload,
  verifySebPayWebhookSignature,
} from "../src/lib/server/sebpay/webhook.ts";

const SECRET_KEY = "sk_test_synthetic";

const ENABLED_ENV = Object.freeze({
  SEBPAY_PAYMENTS_ENABLED: "true",
  SEBPAY_PILOT_MODE: "true",
  SEBPAY_ENVIRONMENT: "test",
  SEBPAY_PUBLIC_KEY: "pk_test_synthetic",
  SEBPAY_SECRET_KEY: SECRET_KEY,
});

const DISABLED_ENV = Object.freeze({
  SEBPAY_PAYMENTS_ENABLED: "false",
  // Volontairement AUCUNE clé : le mode désactivé ne doit rien lire.
});

const VALID_PAYLOAD = Object.freeze({
  transaction_id: "20260801000000000001",
  external_reference: "txn-11111111-1111-4111-8111-111111111111",
  status: "approved",
  amount: 2500,
  currency: "XAF",
  customer_phone: "237670000001",
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-01T00:00:30Z",
});

function signHex(rawBody, secretKey = SECRET_KEY) {
  return createHmac("sha256", secretKey).update(rawBody, "utf8").digest("hex");
}

function signBase64(rawBody, secretKey = SECRET_KEY) {
  return createHmac("sha256", secretKey)
    .update(rawBody, "utf8")
    .digest("base64");
}

function assertFoundationError(error, expectedCode) {
  assert.ok(error instanceof PaymentFoundationError);
  assert.equal(error.code, expectedCode);
  return true;
}

// ---------------------------------------------------------------------------
// Signature — vérification en temps constant, encodages hex et base64
// ---------------------------------------------------------------------------

test("valid hex signature is accepted (both cases)", () => {
  const body = JSON.stringify(VALID_PAYLOAD);
  const hex = signHex(body);

  assert.equal(verifySebPayWebhookSignature(body, hex, SECRET_KEY), true);
  assert.equal(
    verifySebPayWebhookSignature(body, hex.toUpperCase(), SECRET_KEY),
    true,
  );
});

test("valid base64 signature is accepted", () => {
  const body = JSON.stringify(VALID_PAYLOAD);

  assert.equal(
    verifySebPayWebhookSignature(body, signBase64(body), SECRET_KEY),
    true,
  );
});

test("tampered body, wrong key, or malformed header are rejected", () => {
  const body = JSON.stringify(VALID_PAYLOAD);
  const signature = signHex(body);

  // Corps modifié après signature.
  assert.equal(
    verifySebPayWebhookSignature(`${body} `, signature, SECRET_KEY),
    false,
  );
  // Signature calculée avec une autre clé.
  assert.equal(
    verifySebPayWebhookSignature(body, signHex(body, "sk_test_other"), SECRET_KEY),
    false,
  );
  // En-tête absent, vide ou hors format.
  assert.equal(verifySebPayWebhookSignature(body, null, SECRET_KEY), false);
  assert.equal(verifySebPayWebhookSignature(body, "", SECRET_KEY), false);
  assert.equal(
    verifySebPayWebhookSignature(body, "not-a-signature", SECRET_KEY),
    false,
  );
  assert.equal(
    verifySebPayWebhookSignature(body, signature.slice(0, 32), SECRET_KEY),
    false,
  );
  // Clé secrète vide : refus systématique.
  assert.equal(verifySebPayWebhookSignature(body, signature, ""), false);
});

// ---------------------------------------------------------------------------
// Parsing — contrat vérifié, fail-closed
// ---------------------------------------------------------------------------

test("valid payload is parsed and mapped (approved → succeeded)", () => {
  const event = parseSebPayWebhookPayload(JSON.stringify(VALID_PAYLOAD));

  assert.equal(event.providerReference, "20260801000000000001");
  assert.equal(
    event.externalReference,
    "txn-11111111-1111-4111-8111-111111111111",
  );
  assert.equal(event.rawStatus, "approved");
  assert.equal(event.mappedStatus, "succeeded");
  assert.equal(event.amountXaf, 2500);
  assert.equal(event.currency, "XAF");
});

test("both status spellings map case-insensitively, unknown fails closed", () => {
  const withStatus = (status) =>
    JSON.stringify({ ...VALID_PAYLOAD, status });

  assert.equal(
    parseSebPayWebhookPayload(withStatus("SUCCESS")).mappedStatus,
    "succeeded",
  );
  assert.equal(
    parseSebPayWebhookPayload(withStatus("rejected")).mappedStatus,
    "failed",
  );
  assert.equal(
    parseSebPayWebhookPayload(withStatus("FAILED")).mappedStatus,
    "failed",
  );
  assert.equal(
    parseSebPayWebhookPayload(withStatus("PENDING")).mappedStatus,
    "pending",
  );
  assert.throws(
    () => parseSebPayWebhookPayload(withStatus("chargeback")),
    (error) => assertFoundationError(error, "PAYMENT_RESPONSE_INVALID"),
  );
});

test("string amounts are accepted, invalid amounts become null", () => {
  const withAmount = (amount) =>
    parseSebPayWebhookPayload(JSON.stringify({ ...VALID_PAYLOAD, amount }));

  assert.equal(withAmount("2500").amountXaf, 2500);
  assert.equal(withAmount(0).amountXaf, null);
  assert.equal(withAmount(-5).amountXaf, null);
  assert.equal(withAmount(25.5).amountXaf, null);
  assert.equal(withAmount(undefined).amountXaf, null);
});

test("non-contractual payloads fail closed", () => {
  const expectInvalid = (rawBody) =>
    assert.throws(
      () => parseSebPayWebhookPayload(rawBody),
      (error) => assertFoundationError(error, "PAYMENT_RESPONSE_INVALID"),
    );

  expectInvalid("not-json");
  expectInvalid("null");
  expectInvalid("[]");
  expectInvalid(JSON.stringify({ ...VALID_PAYLOAD, transaction_id: "" }));
  expectInvalid(JSON.stringify({ ...VALID_PAYLOAD, transaction_id: 42 }));
  expectInvalid(JSON.stringify({ ...VALID_PAYLOAD, status: "" }));

  const withoutStatus = { ...VALID_PAYLOAD };
  delete withoutStatus.status;
  expectInvalid(JSON.stringify(withoutStatus));
});

// ---------------------------------------------------------------------------
// Chaîne complète — handleSebPayWebhook
// ---------------------------------------------------------------------------

function neverCalled() {
  throw new Error("applyUpdate ne doit pas être appelé dans ce scénario.");
}

test("disabled payments answer 503 without reading any secret", async () => {
  const outcome = await handleSebPayWebhook({
    rawBody: JSON.stringify(VALID_PAYLOAD),
    signatureHeader: signHex(JSON.stringify(VALID_PAYLOAD)),
    environment: DISABLED_ENV,
    applyUpdate: neverCalled,
  });

  assert.deepEqual(outcome, { status: 503, body: { ok: false } });
});

test("enabled but incomplete configuration answers 503", async () => {
  const outcome = await handleSebPayWebhook({
    rawBody: JSON.stringify(VALID_PAYLOAD),
    signatureHeader: signHex(JSON.stringify(VALID_PAYLOAD)),
    environment: { SEBPAY_PAYMENTS_ENABLED: "true" },
    applyUpdate: neverCalled,
  });

  assert.deepEqual(outcome, { status: 503, body: { ok: false } });
});

test("invalid signature answers 401 before any processing", async () => {
  const body = JSON.stringify(VALID_PAYLOAD);

  for (const signatureHeader of [null, "", signHex(`${body} `)]) {
    const outcome = await handleSebPayWebhook({
      rawBody: body,
      signatureHeader,
      environment: ENABLED_ENV,
      applyUpdate: neverCalled,
    });

    assert.deepEqual(outcome, { status: 401, body: { ok: false } });
  }
});

test("signed but non-contractual payload answers 400", async () => {
  const body = JSON.stringify({ ...VALID_PAYLOAD, status: "chargeback" });

  const outcome = await handleSebPayWebhook({
    rawBody: body,
    signatureHeader: signHex(body),
    environment: ENABLED_ENV,
    applyUpdate: neverCalled,
  });

  assert.deepEqual(outcome, { status: 400, body: { ok: false } });
});

test("valid webhook reaches applyUpdate and answers 200", async () => {
  const body = JSON.stringify(VALID_PAYLOAD);
  const seen = [];

  const outcome = await handleSebPayWebhook({
    rawBody: body,
    signatureHeader: signBase64(body),
    environment: ENABLED_ENV,
    applyUpdate: async (event) => {
      seen.push(event);
      return { processingResult: "applied_succeeded" };
    },
  });

  assert.deepEqual(outcome, {
    status: 200,
    body: { ok: true, result: "applied_succeeded" },
  });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].providerReference, "20260801000000000001");
  assert.equal(seen[0].mappedStatus, "succeeded");
  assert.equal(seen[0].amountXaf, 2500);
  // Minimisation : le téléphone du payeur n'est jamais transmis en aval.
  assert.equal("customerPhone" in seen[0], false);
});

test("persistence failure answers 500 so SebPay retries", async () => {
  const body = JSON.stringify(VALID_PAYLOAD);

  const outcome = await handleSebPayWebhook({
    rawBody: body,
    signatureHeader: signHex(body),
    environment: ENABLED_ENV,
    applyUpdate: async () => {
      throw new Error("database unavailable");
    },
  });

  assert.deepEqual(outcome, { status: 500, body: { ok: false } });
});

test("signature header constant is the expected lowercase header name", () => {
  assert.equal(SEBPAY_SIGNATURE_HEADER, "x-sebpay-signature");
});
