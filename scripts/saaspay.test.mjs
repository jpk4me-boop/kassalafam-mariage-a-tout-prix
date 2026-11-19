/**
 * Saaspay foundation tests (node:test, zero network access).
 * `node --conditions=react-server --test scripts/saaspay.test.mjs`
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import { PaymentFoundationError } from "../src/lib/server/sebpay/foundation-core.ts";
import {
  SAASPAY_API_ORIGINS,
  loadSaaspayConfig,
  loadSaaspayCredentials,
} from "../src/lib/server/saaspay/config.ts";
import {
  SaaspayProvider,
  createSaaspayProvider,
  mapSaaspayStatus,
  parseSaaspayAmount,
} from "../src/lib/server/saaspay/adapter.ts";
import {
  handleSaaspayWebhook,
  parseSaaspayWebhookPayload,
  verifySaaspayWebhookSignature,
} from "../src/lib/server/saaspay/webhook.ts";

const WEBHOOK_SECRET = "whsec_synthetic";
const NOW = 1_763_550_000;

const ENABLED_ENV = Object.freeze({
  SAASPAY_PAYMENTS_ENABLED: "true",
  SAASPAY_PILOT_MODE: "true",
  SAASPAY_ENVIRONMENT: "test",
  SAASPAY_SECRET_KEY: "sk_test_synthetic",
  SAASPAY_WEBHOOK_SECRET: WEBHOOK_SECRET,
  SAASPAY_PILOT_PHONES: "237670000000",
});

const PAYMENT_INPUT = Object.freeze({
  idempotencyKey: "kassalafam-idem-0000000001",
  transactionId: "11111111-1111-4111-8111-111111111111",
  amountXaf: 5900,
  network: "mtn_cm",
  description: "KASSALAFAM Premium mensuel",
  customer: Object.freeze({
    email: "membre@example.test",
    firstName: "Awa",
    lastName: "Membre",
    phone: "237670000000",
  }),
});

function sign(body, timestamp = String(NOW), secret = WEBHOOK_SECRET) {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

function jsonResponse(payload, status = 201) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function providerWith(fetchImpl, env = ENABLED_ENV) {
  const config = loadSaaspayConfig(env);
  return new SaaspayProvider({
    config,
    credentials: loadSaaspayCredentials(env, config.environment),
    transportOptions: { fetchImpl },
  });
}

// --- Configuration -----------------------------------------------------------

test("disabled by default: no secret read, no provider", () => {
  const config = loadSaaspayConfig({});
  assert.equal(config.enabled, false);
  assert.equal(config.pilotMode, true);
  assert.equal(config.environment, "test");
  assert.equal(config.apiOrigin, SAASPAY_API_ORIGINS.test);
  assert.equal(createSaaspayProvider({}), null);
});

test("live environment selects the live origin", () => {
  const config = loadSaaspayConfig({ SAASPAY_ENVIRONMENT: "live" });
  assert.equal(config.apiOrigin, "https://api.saspay.me");
});

test("invalid flags fail closed", () => {
  assert.throws(
    () => loadSaaspayConfig({ SAASPAY_PAYMENTS_ENABLED: "yes" }),
    PaymentFoundationError,
  );
  assert.throws(
    () => loadSaaspayConfig({ SAASPAY_ENVIRONMENT: "prod" }),
    PaymentFoundationError,
  );
});

test("credentials: required, environment-matched, never echoed", () => {
  assert.throws(
    () => loadSaaspayCredentials({ ...ENABLED_ENV, SAASPAY_SECRET_KEY: "" }, "test"),
    /SAASPAY_SECRET_KEY is required/,
  );
  assert.throws(
    () => loadSaaspayCredentials({ ...ENABLED_ENV, SAASPAY_WEBHOOK_SECRET: " " }, "test"),
    /SAASPAY_WEBHOOK_SECRET is required/,
  );
  assert.throws(
    () => loadSaaspayCredentials(ENABLED_ENV, "live"),
    (error) =>
      error instanceof PaymentFoundationError &&
      !error.message.includes("sk_test_synthetic"),
  );
  assert.throws(
    () =>
      loadSaaspayCredentials({ ...ENABLED_ENV, SAASPAY_PILOT_PHONES: "+237670000000" }, "test"),
    PaymentFoundationError,
  );
});

// --- Adapter -----------------------------------------------------------------

test("status mapping is fail-closed", () => {
  assert.equal(mapSaaspayStatus("PENDING"), "pending");
  assert.equal(mapSaaspayStatus("success"), "succeeded");
  assert.equal(mapSaaspayStatus("FAILED"), "failed");
  assert.equal(mapSaaspayStatus("CANCELLED"), "cancelled");
  assert.throws(() => mapSaaspayStatus("PAID"), PaymentFoundationError);
  assert.throws(() => mapSaaspayStatus(null), PaymentFoundationError);
});

test("amount parsing accepts whole XAF only", () => {
  assert.equal(parseSaaspayAmount("5900.00"), 5900);
  assert.equal(parseSaaspayAmount("5900"), 5900);
  assert.equal(parseSaaspayAmount(5900), 5900);
  assert.equal(parseSaaspayAmount("5900.50"), null);
  assert.equal(parseSaaspayAmount("0.00"), null);
  assert.equal(parseSaaspayAmount("-5"), null);
  assert.equal(parseSaaspayAmount(undefined), null);
});

test("softpay request matches the contract", async () => {
  let captured;
  const provider = providerWith(async (url, init) => {
    captured = { url: String(url), init };
    return jsonResponse({
      success: true,
      data: { id: "pay_123", status: "PENDING", checkout_url: "", instructions: "" },
      code: 201,
    });
  });

  const result = await provider.initiatePayment(PAYMENT_INPUT);

  assert.deepEqual(result, {
    provider: "saaspay",
    providerReference: "pay_123",
    status: "pending",
    checkoutUrl: null,
  });
  assert.equal(captured.url, "https://sandbox-api.saspay.me/api/v1/payments/softpay/");
  assert.equal(captured.init.method, "POST");
  assert.equal(captured.init.headers.get("authorization"), "Bearer sk_test_synthetic");
  assert.equal(captured.init.headers.get("idempotency-key"), PAYMENT_INPUT.idempotencyKey);
  assert.deepEqual(JSON.parse(captured.init.body), {
    amount: "5900.00",
    currency: "XAF",
    country: "CM",
    network: "mtn_cm",
    description: "KASSALAFAM Premium mensuel",
    customer: {
      email: "membre@example.test",
      first_name: "Awa",
      last_name: "Membre",
      phone: "237670000000",
    },
    metadata: { kassalafam_transaction_id: PAYMENT_INPUT.transactionId },
  });
});

test("pilot mode blocks non-pilot numbers before any network call", async () => {
  let called = false;
  const provider = providerWith(async () => {
    called = true;
    return jsonResponse({});
  });

  await assert.rejects(
    provider.initiatePayment({
      ...PAYMENT_INPUT,
      customer: { ...PAYMENT_INPUT.customer, phone: "237690000001" },
    }),
    /Pilot mode/,
  );
  assert.equal(called, false);
});

test("invalid inputs are refused before any network call", async () => {
  let called = false;
  const provider = providerWith(async () => {
    called = true;
    return jsonResponse({});
  });

  for (const input of [
    { ...PAYMENT_INPUT, amountXaf: 0 },
    { ...PAYMENT_INPUT, amountXaf: 59.5 },
    { ...PAYMENT_INPUT, network: "wave_sn" },
    { ...PAYMENT_INPUT, idempotencyKey: "short" },
    { ...PAYMENT_INPUT, customer: { ...PAYMENT_INPUT.customer, phone: "+237670000000" } },
  ]) {
    await assert.rejects(provider.initiatePayment(input), PaymentFoundationError);
  }
  assert.equal(called, false);
});

test("provider failures are sanitized", async () => {
  const rejected = providerWith(async () =>
    jsonResponse({ success: false, error: { message: "secret detail" }, code: 422 }),
  );
  await assert.rejects(
    rejected.initiatePayment(PAYMENT_INPUT),
    (error) => error.code === "PAYMENT_REQUEST_FAILED" && !error.message.includes("secret"),
  );

  const http = providerWith(async () => jsonResponse({ error: "nope" }, 401));
  await assert.rejects(
    http.getPaymentStatus("pay_123"),
    (error) => error.code === "PAYMENT_REQUEST_FAILED" && error.httpStatus === 401,
  );

  const unknown = providerWith(async () =>
    jsonResponse({ success: true, data: { id: "pay_123", status: "WEIRD" } }, 200),
  );
  await assert.rejects(unknown.getPaymentStatus("pay_123"), /unknown status/);
});

test("verify endpoint and checkout url", async () => {
  let url;
  const provider = providerWith(async (requested) => {
    url = String(requested);
    return jsonResponse(
      {
        success: true,
        data: { id: "pay/123", status: "SUCCESS", checkout_url: "https://pay.saspay.me/x" },
      },
      200,
    );
  });

  const result = await provider.getPaymentStatus("pay/123");
  assert.equal(url, "https://sandbox-api.saspay.me/api/v1/payments/pay%2F123/verify/");
  assert.equal(result.status, "succeeded");
  assert.equal(result.checkoutUrl, "https://pay.saspay.me/x");
});

// --- Webhook -----------------------------------------------------------------

const SUCCESS_BODY = JSON.stringify({
  event: "transaction.success",
  data: {
    id: "pay_123",
    reference: "SP-REF",
    type: "PAIEMENT",
    status: "SUCCESS",
    amount: "5900.00",
    fee: "177.00",
    charged: "6077.00",
    net_amount: "5900.00",
    fee_charge_mode: "ADD_ON",
    currency: "XAF",
    country: "CM",
    network: "mtn_cm",
    msisdn: "237670000000",
  },
});

test("signature: valid, tampered, stale, malformed", () => {
  const base = {
    rawBody: SUCCESS_BODY,
    signatureHeader: sign(SUCCESS_BODY),
    timestampHeader: String(NOW),
    secret: WEBHOOK_SECRET,
    nowSeconds: NOW,
  };

  assert.equal(verifySaaspayWebhookSignature(base), true);
  assert.equal(verifySaaspayWebhookSignature({ ...base, rawBody: `${SUCCESS_BODY} ` }), false);
  assert.equal(verifySaaspayWebhookSignature({ ...base, nowSeconds: NOW + 301 }), false);
  assert.equal(verifySaaspayWebhookSignature({ ...base, nowSeconds: NOW - 301 }), false);
  assert.equal(verifySaaspayWebhookSignature({ ...base, signatureHeader: null }), false);
  assert.equal(verifySaaspayWebhookSignature({ ...base, timestampHeader: "abc" }), false);
  assert.equal(
    verifySaaspayWebhookSignature({ ...base, signatureHeader: sign(SUCCESS_BODY, String(NOW), "other") }),
    false,
  );
});

test("payload parsing: success event, minimized fields", () => {
  const event = parseSaaspayWebhookPayload(SUCCESS_BODY);
  assert.deepEqual(event, {
    event: "transaction.success",
    providerReference: "pay_123",
    rawStatus: "SUCCESS",
    mappedStatus: "succeeded",
    amountXaf: 5900,
    currency: "XAF",
  });
  assert.equal(JSON.stringify(event).includes("237670000000"), false);
});

test("payload parsing: status taken from event when absent, mismatch refused", () => {
  const failed = parseSaaspayWebhookPayload(
    JSON.stringify({ event: "transaction.failed", data: { id: "pay_9" } }),
  );
  assert.equal(failed.mappedStatus, "failed");
  assert.equal(failed.rawStatus, "transaction.failed");

  assert.throws(
    () =>
      parseSaaspayWebhookPayload(
        JSON.stringify({ event: "transaction.success", data: { id: "pay_9", status: "FAILED" } }),
      ),
    /disagree/,
  );
  assert.throws(() => parseSaaspayWebhookPayload("{"), PaymentFoundationError);
  assert.throws(
    () => parseSaaspayWebhookPayload(JSON.stringify({ event: "transaction.success", data: {} })),
    PaymentFoundationError,
  );
});

test("payload parsing: non-transaction events are ignored", () => {
  for (const event of ["webhook.test", "settlement.success", "wallet_transfer.completed"]) {
    assert.equal(parseSaaspayWebhookPayload(JSON.stringify({ event, data: {} })), null);
  }
});

function webhook(overrides = {}) {
  const calls = [];
  const options = {
    rawBody: SUCCESS_BODY,
    signatureHeader: sign(SUCCESS_BODY),
    timestampHeader: String(NOW),
    environment: ENABLED_ENV,
    nowSeconds: NOW,
    applyUpdate: async (event) => {
      calls.push(event);
      return { processingResult: "applied_succeeded" };
    },
    ...overrides,
  };
  return { calls, run: () => handleSaaspayWebhook(options) };
}

test("handler: disabled returns 503 without reading secrets", async () => {
  const { calls, run } = webhook({ environment: { SAASPAY_PAYMENTS_ENABLED: "false" } });
  assert.deepEqual(await run(), { status: 503, body: { ok: false } });
  assert.equal(calls.length, 0);
});

test("handler: misconfigured returns 503", async () => {
  const { run } = webhook({
    environment: { ...ENABLED_ENV, SAASPAY_WEBHOOK_SECRET: "" },
  });
  assert.equal((await run()).status, 503);
});

test("handler: bad signature 401, bad payload 400, persistence error 500", async () => {
  assert.equal((await webhook({ signatureHeader: "0".repeat(64) }).run()).status, 401);

  const badBody = JSON.stringify({ event: "transaction.success", data: { status: "SUCCESS" } });
  assert.equal(
    (await webhook({ rawBody: badBody, signatureHeader: sign(badBody) }).run()).status,
    400,
  );

  const failing = webhook({
    applyUpdate: async () => {
      throw new Error("db down");
    },
  });
  assert.deepEqual(await failing.run(), { status: 500, body: { ok: false } });
});

test("handler: valid success is applied once; test event acknowledged", async () => {
  const ok = webhook();
  assert.deepEqual(await ok.run(), {
    status: 200,
    body: { ok: true, result: "applied_succeeded" },
  });
  assert.equal(ok.calls.length, 1);
  assert.equal(ok.calls[0].providerReference, "pay_123");

  const testBody = JSON.stringify({ event: "webhook.test", data: {} });
  const ping = webhook({ rawBody: testBody, signatureHeader: sign(testBody) });
  assert.deepEqual(await ping.run(), { status: 200, body: { ok: true, result: "ignored" } });
  assert.equal(ping.calls.length, 0);
});
