import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import {
  PaymentFoundationError,
  type InternalPaymentStatus,
} from "../sebpay/foundation-core.ts";
import { mapSaaspayStatus, parseSaaspayAmount } from "./adapter.ts";
import { loadSaaspayConfig, loadSaaspayCredentials } from "./config.ts";

/**
 * Webhooks Saaspay (docs.saspay.me/api-reference/webhooks, lu le 2026-11-19).
 *
 *  - `X-Webhook-Signature` = HMAC-SHA256 hexadécimal (minuscules) de
 *    `{X-Webhook-Timestamp}.{corps brut}`, clé = `signing_secret` du webhook ;
 *  - horodatage Unix en secondes, refusé au-delà de 300 s d'écart ;
 *  - enveloppe `{ event, data }` ; 5 tentatives (immédiat, +30 s, +5 min,
 *    +30 min, +2 h), délai de 15 s par tentative.
 *
 * Fail-closed : paiements désactivés → 503 sans lecture de secret ; signature
 * ou horodatage invalide → 401 ; charge utile hors contrat → 400 ; échec de
 * persistance → 500 (Saaspay rejoue, les rejeux sont absorbés en base). Les
 * événements hors transaction (settlement.*, wallet_transfer.*, webhook.test)
 * sont acquittés sans écriture.
 */

export const SAASPAY_SIGNATURE_HEADER = "x-webhook-signature";
export const SAASPAY_TIMESTAMP_HEADER = "x-webhook-timestamp";
export const SAASPAY_SIGNATURE_TOLERANCE_SECONDS = 300;

const HEX_SIGNATURE_PATTERN = /^[0-9a-f]{64}$/i;
const TIMESTAMP_PATTERN = /^\d{9,11}$/;

const EVENT_STATUSES: Readonly<Record<string, InternalPaymentStatus>> =
  Object.freeze({
    "transaction.created": "pending",
    "transaction.success": "succeeded",
    "transaction.failed": "failed",
    "transaction.cancelled": "cancelled",
  });

export function verifySaaspayWebhookSignature(options: {
  readonly rawBody: string;
  readonly signatureHeader: string | null;
  readonly timestampHeader: string | null;
  readonly secret: string;
  readonly nowSeconds?: number;
}): boolean {
  const signature = options.signatureHeader?.trim() ?? "";
  const timestamp = options.timestampHeader?.trim() ?? "";

  if (
    options.secret === "" ||
    !HEX_SIGNATURE_PATTERN.test(signature) ||
    !TIMESTAMP_PATTERN.test(timestamp)
  ) {
    return false;
  }

  const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1000);

  if (
    Math.abs(nowSeconds - Number(timestamp)) >
    SAASPAY_SIGNATURE_TOLERANCE_SECONDS
  ) {
    return false;
  }

  const expected = createHmac("sha256", options.secret)
    .update(`${timestamp}.${options.rawBody}`, "utf8")
    .digest();
  const received = Buffer.from(signature.toLowerCase(), "hex");

  return (
    received.length === expected.length && timingSafeEqual(expected, received)
  );
}

export interface SaaspayWebhookEvent {
  readonly event: string;
  /** Identifiant Saaspay du paiement (`data.id`). */
  readonly providerReference: string;
  readonly rawStatus: string;
  readonly mappedStatus: InternalPaymentStatus;
  /** Montant DEMANDÉ (`data.amount`), hors frais. */
  readonly amountXaf: number | null;
  readonly currency: string | null;
}

function readString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === "" || trimmed.length > maxLength ? null : trimmed;
}

/**
 * Valide le corps. Renvoie `null` pour un événement signé mais sans effet
 * métier ; lève une erreur pour une charge utile hors contrat.
 */
export function parseSaaspayWebhookPayload(
  rawBody: string,
): SaaspayWebhookEvent | null {
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

  const record = payload as { event?: unknown; data?: unknown };
  const event = readString(record.event, 100);

  if (event === null) {
    throw new PaymentFoundationError(
      "PAYMENT_RESPONSE_INVALID",
      "Webhook payload is missing its event.",
    );
  }

  const eventStatus = EVENT_STATUSES[event.toLowerCase()];

  if (eventStatus === undefined) {
    return null;
  }

  const data = record.data as Record<string, unknown> | null | undefined;

  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new PaymentFoundationError(
      "PAYMENT_RESPONSE_INVALID",
      "Webhook payload is missing its data.",
    );
  }

  const providerReference = readString(data.id, 200);

  if (providerReference === null || providerReference.length < 2) {
    throw new PaymentFoundationError(
      "PAYMENT_RESPONSE_INVALID",
      "Webhook payload is missing a valid payment id.",
    );
  }

  // Le statut du corps fait foi s'il est présent ; il doit concorder avec
  // l'événement annoncé, sinon la charge utile est refusée.
  const statusField = readString(data.status, 100);
  const mappedStatus =
    statusField === null ? eventStatus : mapSaaspayStatus(statusField);

  if (mappedStatus !== eventStatus) {
    throw new PaymentFoundationError(
      "PAYMENT_RESPONSE_INVALID",
      "Webhook event and status disagree.",
    );
  }

  return Object.freeze({
    event: event.toLowerCase(),
    providerReference,
    rawStatus: statusField ?? event.toLowerCase(),
    mappedStatus,
    amountXaf: parseSaaspayAmount(data.amount),
    currency: readString(data.currency, 10)?.toUpperCase() ?? null,
  });
}

export interface HandleSaaspayWebhookOptions {
  readonly rawBody: string;
  readonly signatureHeader: string | null;
  readonly timestampHeader: string | null;
  /** Persistance injectée (la route branche `apply_saaspay_payment_update`). */
  readonly applyUpdate: (
    event: SaaspayWebhookEvent,
  ) => Promise<{ readonly processingResult: string }>;
  readonly environment?: Readonly<Record<string, string | undefined>>;
  readonly nowSeconds?: number;
}

export interface SaaspayWebhookOutcome {
  readonly status: number;
  readonly body: { readonly ok: boolean; readonly result?: string };
}

export async function handleSaaspayWebhook(
  options: HandleSaaspayWebhookOptions,
): Promise<SaaspayWebhookOutcome> {
  const environment = options.environment ?? process.env;
  let secret: string;

  try {
    const config = loadSaaspayConfig(environment);

    if (!config.enabled) {
      return { status: 503, body: { ok: false } };
    }

    secret = loadSaaspayCredentials(environment, config.environment)
      .webhookSecret;
  } catch {
    return { status: 503, body: { ok: false } };
  }

  if (
    !verifySaaspayWebhookSignature({
      rawBody: options.rawBody,
      signatureHeader: options.signatureHeader,
      timestampHeader: options.timestampHeader,
      secret,
      nowSeconds: options.nowSeconds,
    })
  ) {
    return { status: 401, body: { ok: false } };
  }

  let event: SaaspayWebhookEvent | null;

  try {
    event = parseSaaspayWebhookPayload(options.rawBody);
  } catch {
    return { status: 400, body: { ok: false } };
  }

  if (event === null) {
    return { status: 200, body: { ok: true, result: "ignored" } };
  }

  try {
    const applied = await options.applyUpdate(event);
    return { status: 200, body: { ok: true, result: applied.processingResult } };
  } catch {
    return { status: 500, body: { ok: false } };
  }
}
