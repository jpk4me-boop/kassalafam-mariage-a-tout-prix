/**
 * Secure SebPay foundation tests (node:test, zero network access).
 * `node --conditions=react-server --test scripts/sebpay-foundation.test.mjs`
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  CONFIRMED_SEBPAY_API_ORIGINS,
  GuardedJsonTransport,
  LockedSebPayProvider,
  PaymentFoundationError,
  loadSebPayFoundationConfig,
} from "../src/lib/server/sebpay/foundation-core.ts";

function assertFoundationError(error, expectedCode) {
  assert.ok(error instanceof PaymentFoundationError);
  assert.equal(error.code, expectedCode);
  return true;
}

test("core module enforces the server-only boundary", async () => {
  const source = await readFile(
    new URL("../src/lib/server/sebpay/foundation-core.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /^import "server-only";\r?\n/);
});

test("SebPay is disabled by default without reading secrets", () => {
  const secretNames = new Set([
    "SEBPAY_API_BASE_URL",
    "SEBPAY_CALLBACK_URL",
    "SEBPAY_PUBLIC_KEY",
    "SEBPAY_SECRET_KEY",
    "SEBPAY_PILOT_MTN_PHONE",
    "SEBPAY_PILOT_ORANGE_PHONE",
  ]);

  const environment = new Proxy(
    {},
    {
      get(_target, property) {
        if (secretNames.has(String(property))) {
          throw new Error(`Secret access attempted: ${String(property)}`);
        }

        return undefined;
      },
    },
  );

  const config = loadSebPayFoundationConfig(environment);

  assert.equal(config.enabled, false);
  assert.equal(config.pilotMode, true);
  assert.equal(config.environment, "test");
  assert.equal(config.contractConfirmed, true);
  assert.deepEqual(config.allowedApiOrigins, ["https://newapi.sebpay.bj"]);
});

test("enabling SebPay stays credential-free at the config level", () => {
  // Contract verified on 2026-07-31: enabling no longer throws, but the
  // foundation config loader must still read nothing beyond safety flags.
  const secretNames = new Set([
    "SEBPAY_API_BASE_URL",
    "SEBPAY_CALLBACK_URL",
    "SEBPAY_PUBLIC_KEY",
    "SEBPAY_SECRET_KEY",
    "SEBPAY_PILOT_MTN_PHONE",
    "SEBPAY_PILOT_ORANGE_PHONE",
  ]);

  const environment = new Proxy(
    {
      SEBPAY_PAYMENTS_ENABLED: "true",
      SEBPAY_ENVIRONMENT: "test",
      SEBPAY_PILOT_MODE: "true",
    },
    {
      get(target, property, receiver) {
        if (secretNames.has(String(property))) {
          throw new Error(`Secret access attempted: ${String(property)}`);
        }

        return Reflect.get(target, property, receiver);
      },
    },
  );

  const config = loadSebPayFoundationConfig(environment);

  assert.equal(config.enabled, true);
  assert.equal(config.pilotMode, true);
  assert.equal(config.contractConfirmed, true);
});

test("invalid safety flags fail closed", () => {
  assert.throws(
    () =>
      loadSebPayFoundationConfig({
        SEBPAY_PAYMENTS_ENABLED: "yes",
      }),
    (error) => assertFoundationError(error, "PAYMENT_CONFIG_INVALID"),
  );

  assert.throws(
    () =>
      loadSebPayFoundationConfig({
        SEBPAY_ENVIRONMENT: "production",
      }),
    (error) => assertFoundationError(error, "PAYMENT_CONFIG_INVALID"),
  );
});

test("confirmed SebPay API origin allowlist holds the single verified origin", () => {
  assert.deepEqual(CONFIRMED_SEBPAY_API_ORIGINS, ["https://newapi.sebpay.bj"]);
  assert.equal(Object.isFrozen(CONFIRMED_SEBPAY_API_ORIGINS), true);
});

test("disabled provider performs zero network calls", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;

  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("network must not be reached");
  };

  try {
    const config = loadSebPayFoundationConfig({
      SEBPAY_PAYMENTS_ENABLED: "false",
    });
    const provider = new LockedSebPayProvider(config);

    await assert.rejects(
      provider.initiatePayment({
        transactionId: "11111111-1111-4111-8111-111111111111",
        idempotencyKey: "idem-1111111111111111",
        amountMinor: 1000,
        currency: "XAF",
        customerReference: "profile-reference",
      }),
      (error) => assertFoundationError(error, "PAYMENT_PROVIDER_DISABLED"),
    );

    await assert.rejects(
      provider.getPaymentStatus("provider-reference"),
      (error) => assertFoundationError(error, "PAYMENT_PROVIDER_DISABLED"),
    );

    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("empty origin allowlist rejects before fetch", async () => {
  let fetchCalls = 0;
  const transport = new GuardedJsonTransport({
    allowedOrigins: [],
    fetchImpl: async () => {
      fetchCalls += 1;
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "content-type": "application/json" },
      });
    },
  });

  await assert.rejects(
    transport.request({
      url: new URL("https://example.invalid/payment"),
      method: "POST",
      body: { test: true },
    }),
    (error) => assertFoundationError(error, "PAYMENT_ORIGIN_NOT_ALLOWED"),
  );

  assert.equal(fetchCalls, 0);
});

test("guarded transport forces secure fetch options", async () => {
  let observedInput;
  let observedInit;

  const transport = new GuardedJsonTransport({
    allowedOrigins: ["https://sandbox.example.invalid"],
    fetchImpl: async (input, init) => {
      observedInput = input;
      observedInit = init;

      return new Response(JSON.stringify({ accepted: true }), {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    },
  });

  const result = await transport.request({
    url: new URL("https://sandbox.example.invalid/future-confirmed-route"),
    method: "POST",
    headers: { "x-test-header": "test" },
    body: { reference: "synthetic" },
  });

  assert.deepEqual(result, { accepted: true });
  assert.equal(observedInput.origin, "https://sandbox.example.invalid");
  assert.equal(observedInit.redirect, "error");
  assert.equal(observedInit.cache, "no-store");
  assert.equal(observedInit.credentials, "omit");
  assert.equal(observedInit.referrerPolicy, "no-referrer");
  assert.equal(observedInit.headers.get("accept"), "application/json");
  assert.equal(
    observedInit.headers.get("content-type"),
    "application/json",
  );
});

test("guarded transport rejects cross-origin URLs before fetch", async () => {
  let fetchCalls = 0;
  const transport = new GuardedJsonTransport({
    allowedOrigins: ["https://sandbox.example.invalid"],
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error("network must not be reached");
    },
  });

  await assert.rejects(
    transport.request({
      url: new URL("https://attacker.example.invalid/payment"),
      method: "GET",
    }),
    (error) => assertFoundationError(error, "PAYMENT_ORIGIN_NOT_ALLOWED"),
  );

  assert.equal(fetchCalls, 0);
});

test("guarded transport rejects oversized responses", async () => {
  const transport = new GuardedJsonTransport({
    allowedOrigins: ["https://sandbox.example.invalid"],
    maxResponseBytes: 16,
    fetchImpl: async () =>
      new Response(JSON.stringify({ value: "this is too large" }), {
        headers: { "content-type": "application/json" },
      }),
  });

  await assert.rejects(
    transport.request({
      url: new URL("https://sandbox.example.invalid/status"),
      method: "GET",
    }),
    (error) => assertFoundationError(error, "PAYMENT_RESPONSE_TOO_LARGE"),
  );
});
// --- Final transport hardening coverage ---

test("guarded transport times out with a generic error", async () => {
  let fetchCalls = 0;

  const transport = new GuardedJsonTransport({
    allowedOrigins: ["https://sandbox.example.invalid"],
    timeoutMs: 10,
    fetchImpl: async (_input, init) => {
      fetchCalls += 1;

      return await new Promise((_resolve, reject) => {
        init.signal.addEventListener(
          "abort",
          () => reject(new DOMException("provider detail", "AbortError")),
          { once: true },
        );
      });
    },
  });

  await assert.rejects(
    transport.request({
      url: new URL("https://sandbox.example.invalid/status"),
      method: "GET",
    }),
    (error) => {
      assertFoundationError(error, "PAYMENT_REQUEST_TIMEOUT");
      assert.equal(error.message.includes("provider detail"), false);
      return true;
    },
  );

  assert.equal(fetchCalls, 1);
});

test("caller cancellation is distinguished from timeout", async () => {
  const controller = new AbortController();

  const transport = new GuardedJsonTransport({
    allowedOrigins: ["https://sandbox.example.invalid"],
    timeoutMs: 1_000,
    fetchImpl: async (_input, init) =>
      await new Promise((_resolve, reject) => {
        init.signal.addEventListener(
          "abort",
          () => reject(new DOMException("cancelled", "AbortError")),
          { once: true },
        );
      }),
  });

  const request = transport.request({
    url: new URL("https://sandbox.example.invalid/status"),
    method: "GET",
    signal: controller.signal,
  });

  controller.abort();

  await assert.rejects(
    request,
    (error) => assertFoundationError(error, "PAYMENT_REQUEST_ABORTED"),
  );
});

test("forbidden request headers are rejected before fetch", async () => {
  let fetchCalls = 0;

  const transport = new GuardedJsonTransport({
    allowedOrigins: ["https://sandbox.example.invalid"],
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error("network must not be reached");
    },
  });

  await assert.rejects(
    transport.request({
      url: new URL("https://sandbox.example.invalid/payment"),
      method: "POST",
      headers: { Host: "attacker.example.invalid" },
      body: { test: true },
    }),
    (error) => assertFoundationError(error, "PAYMENT_CONFIG_INVALID"),
  );

  assert.equal(fetchCalls, 0);
});

test("non-JSON provider responses are rejected", async () => {
  const transport = new GuardedJsonTransport({
    allowedOrigins: ["https://sandbox.example.invalid"],
    fetchImpl: async () =>
      new Response("<html>unexpected</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
  });

  await assert.rejects(
    transport.request({
      url: new URL("https://sandbox.example.invalid/status"),
      method: "GET",
    }),
    (error) => assertFoundationError(error, "PAYMENT_RESPONSE_INVALID"),
  );
});

test("invalid JSON provider responses are rejected", async () => {
  const transport = new GuardedJsonTransport({
    allowedOrigins: ["https://sandbox.example.invalid"],
    fetchImpl: async () =>
      new Response("{invalid-json", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  });

  await assert.rejects(
    transport.request({
      url: new URL("https://sandbox.example.invalid/status"),
      method: "GET",
    }),
    (error) => assertFoundationError(error, "PAYMENT_RESPONSE_INVALID"),
  );
});



test("provider error bodies are cancelled and never propagated", async () => {
  const providerDetail = "sensitive-provider-debug-detail";
  let responseBodyCancelled = false;

  const responseBody = new ReadableStream({
    start(controller) {
      controller.enqueue(
        new TextEncoder().encode(JSON.stringify({ error: providerDetail })),
      );
    },
    cancel() {
      responseBodyCancelled = true;
    },
  });

  const transport = new GuardedJsonTransport({
    allowedOrigins: ["https://sandbox.example.invalid"],
    fetchImpl: async () =>
      new Response(responseBody, {
        status: 502,
        headers: { "content-type": "application/json" },
      }),
  });

  await assert.rejects(
    transport.request({
      url: new URL("https://sandbox.example.invalid/status"),
      method: "GET",
    }),
    (error) => {
      assertFoundationError(error, "PAYMENT_REQUEST_FAILED");
      assert.equal(error.message.includes(providerDetail), false);
      return true;
    },
  );

  assert.equal(responseBodyCancelled, true);
});
test("credential-bearing and non-origin allowlist values are rejected", () => {
  assert.throws(
    () =>
      new GuardedJsonTransport({
        allowedOrigins: [
          "https://user:password@sandbox.example.invalid",
        ],
      }),
    (error) => assertFoundationError(error, "PAYMENT_CONFIG_INVALID"),
  );

  assert.throws(
    () =>
      new GuardedJsonTransport({
        allowedOrigins: [
          "https://sandbox.example.invalid/path",
        ],
      }),
    (error) => assertFoundationError(error, "PAYMENT_CONFIG_INVALID"),
  );
});
