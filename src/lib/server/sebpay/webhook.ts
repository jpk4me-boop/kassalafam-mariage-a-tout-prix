import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import {
  PaymentFoundationError,
  loadSebPayFoundationConfig,
  type InternalPaymentStatus,
} from "./foundation-core.ts";
import { loadSebPayCredentials, mapSebPayStatus } from "./adapter.ts";

/**
 * SebPay webhook verification and parsing — Phase 3.
 *
 * Verified contract (project sheet "SebPay — Activation KASSALAFAM") :
 *  - `X-SebPay-Signature` = HMAC-SHA256 of the raw JSON body, computed with
 *    the merchant secret key (`sk_…`) — verified in constant time ;
 *  - payload: `transaction_id`, `external_reference`, `status`, `amount`,
 *    `currency`, `customer_phone`, `created_at`, `updated_at` ;
 *  - webhooks are replayable: deduplication happens downstream (idempotent
 *    journal + immutable terminal statuses in `apply_sebpay_payment_update`) ;
 *  - HTTP 200 must be returned within 5 seconds.
 *
 * Security invariants preserved from the foundation:
 *  - while payments are disabled, NO secret is read and the route is
 *    unavailable (503) — fail-closed ;
 *  - signature failures return 401 without detail ;
 *  - unknown provider statuses fail closed (`mapSebPayStatus`) ;
 *  - `customer_phone` is never persisted nor forwarded (data minimization).
 */

export const SEBPAY_SIGNATURE_HEADER = "x-sebpay-signature";

/** Hex (64 chars) or strict base64 (32 bytes) encodings of an HMAC-SHA256. */
const HEX_SIGNATURE_PATTERN = /^[0-9a-f]{64}$/i;
const BASE64_SIGNATURE_PATTERN = /^[A-Za-z0-9+/]{43}=$/;

/**
 * Constant-time verification of `X-SebPay-Signature`.
 *
 * The exact digest encoding is to be confirmed on the first pilot
 * transaction: both the hex and base64 encodings of the same HMAC-SHA256
 * digest are accepted, each compared in constant time.
 */
export function verifySebPayWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secretKey: string,
): boolean {
  if (signatureHeader === null || secretKey === "") {
    return false;
  }

  const received = signatureHeader.trim();
  let candidate: Buffer;

  if (HEX_SIGNATURE_PATTERN.test(received)) {
    candidate = Buffer.from(received.toLowerCase(), "hex");
  } else if (BASE64_SIGNATURE_PATTERN.test(received)) {
    candidate = Buffer.from(received, "base64");
  } else {
    return false;
  }

  const expected = createHmac("sha256", secretKey)
    .update(rawBody, "utf8")
    .digest();

  return (
    candidate.length === expected.length && timingSafeEqual(expected, candidate)
  );
}

export interface SebPayWebhookEvent {
  /** SebPay `transaction_id` (provider reference). */
  readonly providerReference: string;
  /** KASSALAFAM reference (`external_reference` = idempotency key). */
  readonly externalReference: string | null;
  readonly rawStatus: string;
  readonly mappedStatus: InternalPaymentStatus;
  readonly amountXaf: number | null;
  readonly currency: string | null;
}

function readOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function readAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 1) {
    return value;
  }

  if (typeof value === "string" && /^\d{1,9}$/.test(value.trim())) {
    return Number(value.trim());
  }

  return null;
}

/**
 * Parses and validates a webhook body. Fails closed on anything that does not
 * match the verified contract (invalid JSON, missing `transaction_id`,
 * unknown status).
 */
export function parseSebPayWebhookPayload(rawBody: string): SebPayWebhookEvent {
  let payload: unknown;

  try {
    payload = JSON.parse(rawBody);
  } catch {
    throw new PaymentFoundationError(
      "PAYMENT_RESPONSE_INVALID",
      "Webhook payload is not valid JSON.",
    );
  }

  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new PaymentFoundationError(
      "PAYMENT_RESPONSE_INVALID",
      "Webhook payload is not a JSON object.",
    );
  }

  const record = payload as Record<string, unknown>;
  const providerReference = readOptionalString(record.transaction_id);

  if (providerReference === null || providerReference.length > 200) {
    throw new PaymentFoundationError(
      "PAYMENT_RESPONSE_INVALID",
      "Webhook payload is missing a valid transaction_id.",
    );
  }

  const rawStatus = readOptionalString(record.status);

  if (rawStatus === null || rawStatus.length > 100) {
    throw new PaymentFoundationError(
      "PAYMENT_RESPONSE_INVALID",
      "Webhook payload is missing a valid status.",
    );
  }

  return Object.freeze({
    providerReference,
    externalReference: readOptionalString(record.external_reference),
    rawStatus,
    // Fail-closed: unknown statuses throw here, before any database write.
    mappedStatus: mapSebPayStatus(rawStatus),
    amountXaf: readAmount(record.amount),
    currency: readOptionalString(record.currency)?.toUpperCase() ?? null,
  });
}

export interface SebPayWebhookApplyResult {
  readonly processingResult: string;
}

export interface HandleSebPayWebhookOptions {
  readonly rawBody: string;
  readonly signatureHeader: string | null;
  /** Injected persistence step (the route wires `apply_sebpay_payment_update`). */
  readonly applyUpdate: (
    event: SebPayWebhookEvent,
  ) => Promise<SebPayWebhookApplyResult>;
  readonly environment?: Readonly<Record<string, string | undefined>>;
}

export interface SebPayWebhookOutcome {
  readonly status: number;
  readonly body: { readonly ok: boolean; readonly result?: string };
}

/**
 * Full webhook decision chain, transport-agnostic (unit-testable without
 * Next.js): configuration gate → signature → parsing → persistence.
 *
 * Response codes: 503 disabled/misconfigured (no secret read while disabled),
 * 401 bad signature, 400 non-contractual payload, 500 persistence failure
 * (SebPay retries; replays are absorbed downstream), 200 processed.
 */
export async function handleSebPayWebhook(
  options: HandleSebPayWebhookOptions,
): Promise<SebPayWebhookOutcome> {
  const environment = options.environment ?? process.env;
  let secretKey: string;

  try {
    const config = loadSebPayFoundationConfig(environment);

    if (!config.enabled) {
      return { status: 503, body: { ok: false } };
    }

    secretKey = loadSebPayCredentials(environment, config.environment).secretKey;
  } catch {
    // Invalid configuration = unavailable, without detail.
    return { status: 503, body: { ok: false } };
  }

  if (
    !verifySebPayWebhookSignature(
      options.rawBody,
      options.signatureHeader,
      secretKey,
    )
  ) {
    return { status: 401, body: { ok: false } };
  }

  let event: SebPayWebhookEvent;

  try {
    event = parseSebPayWebhookPayload(options.rawBody);
  } catch {
    return { status: 400, body: { ok: false } };
  }

  try {
    const applied = await options.applyUpdate(event);
    return { status: 200, body: { ok: true, result: applied.processingResult } };
  } catch {
    return { status: 500, body: { ok: false } };
  }
}
