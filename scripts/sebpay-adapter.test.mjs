/**
 * Verified SebPay adapter tests (node:test, zero real network access).
 * `node --conditions=react-server --test scripts/sebpay-adapter.test.mjs`
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  PaymentFoundationError,
  loadSebPayFoundationConfig,
  LockedSebPayProvider,
} from "../src/lib/server/sebpay/foundation-core.ts";
import {
  SEBPAY_CAMEROON_OPERATORS,
  VerifiedSebPayProvider,
  createSebPayProvider,
  loadSebPayCredentials,
  mapSebPayStatus,
} from "../src/lib/server/sebpay/adapter.ts";

function assertFoundationError(error, expectedCode) {
  assert.ok(error instanceof PaymentFoundationError);
  assert.equal(error.code, expectedCode);
  return true;
}

const TEST_ENV = Object.freeze({
  SEBPAY_PAYMENTS_ENABLED: "true",
  SEBPAY_PILOT_MODE: "false",
  SEBPAY_ENVIRONMENT: "test",
  SEBPAY_PUBLIC_KEY: "pk_test_synthetic",
  SEBPAY_SECRET_KEY: "sk_test_synthetic",
});

function buildProvider({ env = TEST_ENV, fetchImpl } = {}) {
  const config = loadSebPayFoundationConfig(env);
  const credentials = loadSebPayCredentials(env, config.environment);

  return new VerifiedSebPayProvider({
    config,
    credentials,
    transportOptions: { fetchImpl },
  });
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const VALID_INPUT = Object.freeze({
  externalReference: "txn-11111111-1111-4111-8111-111111111111",
  amountXaf: 2500,
  payerPhone: "237670000001",
  operator: "mtn-cm",
});

test("createSebPayProvider returns the locked provider while disabled", () => {
  const provider = createSebPayProvider({
    SEBPAY_PAYMENTS_ENABLED: "false",
  });

  assert.ok(provider instanceof LockedSebPayProvider);
});

test("credentials are validated against the configured environment", () => {
  // Missing keys fail closed.
  assert.throws(
    () => loadSebPayCredentials({}, "test"),
    (error) => assertFoundationError(error, "PAYMENT_CONFIG_INVALID"),
  );

  // Live keys with a test environment (and vice versa) fail closed, and the
  // key value never leaks into the error message.
  const liveKey = "sk_live_should-never-appear";

  assert.throws(
    () =>
      loadSebPayCredentials(
        {
          SEBPAY_PUBLIC_KEY: "pk_live_should-never-appear",
          SEBPAY_SECRET_KEY: liveKey,
        },
        "test",
      ),
    (error) => {
      assertFoundationError(error, "PAYMENT_CONFIG_INVALID");
      assert.equal(error.message.includes("should-never-appear"), false);
      return true;
    },
  );

  // Callback URL must be HTTPS when provided.
  assert.throws(
    () =>
      loadSebPayCredentials(
        {
          SEBPAY_PUBLIC_KEY: "pk_test_x",
          SEBPAY_SECRET_KEY: "sk_test_x",
          SEBPAY_CALLBACK_URL: "http://kassalafam.com/api/sebpay/webhook",
        },
        "test",
      ),
    (error) => assertFoundationError(error, "PAYMENT_CONFIG_INVALID"),
  );
});

test("initiateCollection posts the verified contract shape", async () => {
  let observedUrl;
  let observedInit;

  const provider = buildProvider({
    env: {
      ...TEST_ENV,
      SEBPAY_CALLBACK_URL: "https://kassalafam.com/api/sebpay/webhook",
    },
    fetchImpl: async (input, init) => {
      observedUrl = input;
      observedInit = init;

      return jsonResponse({
        success: true,
        data: {
          transaction_id: "20260731235959123456",
          status: "pending",
          external_reference: VALID_INPUT.externalReference,
          amount: 2500,
          currency: "XAF",
          message: "created",
        },
        message: "ok",
      });
    },
  });

  const result = await provider.initiateCollection(VALID_INPUT);

  assert.equal(
    observedUrl.href,
    "https://newapi.sebpay.bj/api/v1/collections",
  );
  assert.equal(observedInit.method, "POST");
  assert.equal(observedInit.headers.get("X-Public-Key"), "pk_test_synthetic");
  assert.equal(observedInit.headers.get("X-Secret-Key"), "sk_test_synthetic");

  const body = JSON.parse(observedInit.body);
  assert.deepEqual(body, {
    amount: 2500,
    currency: "XAF",
    phone: "237670000001",
    operator: "mtn-cm",
    country: "CM",
    external_reference: VALID_INPUT.externalReference,
    callback_url: "https://kassalafam.com/api/sebpay/webhook",
  });

  assert.deepEqual(result, {
    provider: "sebpay",
    providerReference: "20260731235959123456",
    status: "pending",
  });
});

test("getCollectionStatus queries the reference and maps the status", async () => {
  let observedUrl;

  const provider = buildProvider({
    fetchImpl: async (input) => {
      observedUrl = input;

      return jsonResponse({
        success: true,
        data: {
          transaction_id: "20260731235959123456",
          status: "approved",
          external_reference: VALID_INPUT.externalReference,
        },
        message: "ok",
      });
    },
  });

  const result = await provider.getCollectionStatus(
    "txn ref/needs encoding",
  );

  assert.equal(
    observedUrl.href,
    "https://newapi.sebpay.bj/api/v1/collections/txn%20ref%2Fneeds%20encoding",
  );
  assert.equal(result.status, "succeeded");
});

test("status mapping accepts both documented spellings and fails closed", () => {
  assert.equal(mapSebPayStatus("pending"), "pending");
  assert.equal(mapSebPayStatus("PENDING"), "pending");
  assert.equal(mapSebPayStatus("approved"), "succeeded");
  assert.equal(mapSebPayStatus("SUCCESS"), "succeeded");
  assert.equal(mapSebPayStatus("rejected"), "failed");
  assert.equal(mapSebPayStatus("FAILED"), "failed");

  assert.throws(
    () => mapSebPayStatus("mystery"),
    (error) => assertFoundationError(error, "PAYMENT_RESPONSE_INVALID"),
  );
  assert.throws(
    () => mapSebPayStatus(42),
    (error) => assertFoundationError(error, "PAYMENT_RESPONSE_INVALID"),
  );
});

test("invalid inputs are rejected before any network call", async () => {
  let fetchCalls = 0;
  const provider = buildProvider({
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error("network must not be reached");
    },
  });

  const badInputs = [
    { ...VALID_INPUT, amountXaf: 0 },
    { ...VALID_INPUT, amountXaf: 2500.5 },
    { ...VALID_INPUT, payerPhone: "+237670000001" },
    { ...VALID_INPUT, payerPhone: "22997000000" },
    { ...VALID_INPUT, operator: "moov-bj" },
    { ...VALID_INPUT, externalReference: "  " },
  ];

  for (const input of badInputs) {
    await assert.rejects(
      provider.initiateCollection(input),
      (error) => assertFoundationError(error, "PAYMENT_CONFIG_INVALID"),
    );
  }

  await assert.rejects(
    provider.getCollectionStatus("   "),
    (error) => assertFoundationError(error, "PAYMENT_CONFIG_INVALID"),
  );

  assert.equal(fetchCalls, 0);
});

test("pilot mode restricts payments to the configured pilot numbers", async () => {
  let fetchCalls = 0;
  const pilotEnv = {
    ...TEST_ENV,
    SEBPAY_PILOT_MODE: "true",
    SEBPAY_PILOT_MTN_PHONE: "237670000001",
    // No Orange pilot number configured.
  };

  const provider = buildProvider({
    env: pilotEnv,
    fetchImpl: async () => {
      fetchCalls += 1;
      return jsonResponse({
        success: true,
        data: { transaction_id: "20260731000000000001", status: "pending" },
        message: "ok",
      });
    },
  });

  // The configured MTN pilot number passes.
  const result = await provider.initiateCollection(VALID_INPUT);
  assert.equal(result.status, "pending");
  assert.equal(fetchCalls, 1);

  // Any other number is rejected before fetch.
  await assert.rejects(
    provider.initiateCollection({
      ...VALID_INPUT,
      payerPhone: "237699999999",
    }),
    (error) => assertFoundationError(error, "PAYMENT_CONFIG_INVALID"),
  );

  // An operator without a configured pilot number is rejected before fetch.
  await assert.rejects(
    provider.initiateCollection({
      ...VALID_INPUT,
      operator: "orange-cm",
    }),
    (error) => assertFoundationError(error, "PAYMENT_CONFIG_INVALID"),
  );

  assert.equal(fetchCalls, 1);
});

test("provider failure envelopes never propagate provider details", async () => {
  const providerDetail = "sensitive-provider-refusal-detail";

  const provider = buildProvider({
    fetchImpl: async () =>
      jsonResponse({
        success: false,
        data: null,
        message: providerDetail,
      }),
  });

  await assert.rejects(
    provider.initiateCollection(VALID_INPUT),
    (error) => {
      assertFoundationError(error, "PAYMENT_REQUEST_FAILED");
      assert.equal(error.message.includes(providerDetail), false);
      return true;
    },
  );
});

test("incomplete success payloads fail closed", async () => {
  const provider = buildProvider({
    fetchImpl: async () =>
      jsonResponse({
        success: true,
        data: { status: "pending" },
        message: "ok",
      }),
  });

  await assert.rejects(
    provider.initiateCollection(VALID_INPUT),
    (error) => assertFoundationError(error, "PAYMENT_RESPONSE_INVALID"),
  );
});

test("adapter refuses to build while payments are disabled", () => {
  const config = loadSebPayFoundationConfig({
    SEBPAY_PAYMENTS_ENABLED: "false",
  });

  assert.throws(
    () =>
      new VerifiedSebPayProvider({
        config,
        credentials: {
          publicKey: "pk_test_x",
          secretKey: "sk_test_x",
          callbackUrl: null,
          pilotPhones: { "mtn-cm": null, "orange-cm": null },
        },
      }),
    (error) => assertFoundationError(error, "PAYMENT_PROVIDER_DISABLED"),
  );
});

test("the Cameroon operator catalogue matches the verified API data", () => {
  assert.deepEqual(SEBPAY_CAMEROON_OPERATORS, ["mtn-cm", "orange-cm"]);
  assert.equal(Object.isFrozen(SEBPAY_CAMEROON_OPERATORS), true);
});
