import "server-only";

import {
  CONFIRMED_SEBPAY_API_ORIGINS,
  GuardedJsonTransport,
  LockedSebPayProvider,
  PaymentFoundationError,
  loadSebPayFoundationConfig,
  type GuardedJsonTransportOptions,
  type InternalPaymentStatus,
  type ProviderNeutralPaymentResult,
  type SebPayEnvironment,
  type SebPayFoundationConfig,
} from "./foundation-core.ts";

/**
 * Verified SebPay adapter — Cameroon pilot scope.
 *
 * Contract verified on 2026-07-31 against the official merchant documentation
 * (new.sebpay.bj/fr/docs) and authenticated read-only API calls:
 *  - base URL `https://newapi.sebpay.bj/api/v1/` (single origin, test/live
 *    selected by the API-key prefixes) ;
 *  - auth headers `X-Public-Key` / `X-Secret-Key` ;
 *  - `POST /collections` and `GET /collections/{id_or_reference}` ;
 *  - Cameroon operators `mtn-cm` and `orange-cm`, both `otp_required: false` ;
 *  - phone format: international WITHOUT "+" (237XXXXXXXXX) ;
 *  - response envelope `{ success, data, message }`.
 *
 * Security invariants preserved from the foundation:
 *  - credentials are read ONLY when `SEBPAY_PAYMENTS_ENABLED=true` ;
 *  - key values never appear in error messages ;
 *  - provider bodies are never propagated to callers ;
 *  - the hardened transport (allowlist, no-store, redirect error, size caps)
 *    is reused as-is ;
 *  - `profiles.is_premium` is never written by this adapter.
 */

export const SEBPAY_API_BASE_PATH = "/api/v1" as const;

export const SEBPAY_CAMEROON_COUNTRY = "CM" as const;
export const SEBPAY_CAMEROON_CURRENCY = "XAF" as const;

export type SebPayCameroonOperator = "mtn-cm" | "orange-cm";

export const SEBPAY_CAMEROON_OPERATORS: readonly SebPayCameroonOperator[] =
  Object.freeze(["mtn-cm", "orange-cm"]);

/** Cameroon MSISDN, international format without "+": 237 + 9 digits. */
const CAMEROON_PHONE_PATTERN = /^237\d{9}$/;

/** XAF has no minor units: amounts are integral francs CFA. */
const MAX_COLLECTION_AMOUNT_XAF = 10_000_000;

export interface SebPayCredentials {
  readonly publicKey: string;
  readonly secretKey: string;
  readonly callbackUrl: string | null;
  readonly pilotPhones: Readonly<Record<SebPayCameroonOperator, string | null>>;
}

function readKey(
  name: string,
  value: string | undefined,
  expectedPrefix: string,
): string {
  const trimmed = value?.trim() ?? "";

  if (trimmed === "") {
    throw new PaymentFoundationError(
      "PAYMENT_CONFIG_INVALID",
      `${name} is required when SebPay payments are enabled.`,
    );
  }

  if (!trimmed.startsWith(expectedPrefix)) {
    // The value itself is never included in the message.
    throw new PaymentFoundationError(
      "PAYMENT_CONFIG_INVALID",
      `${name} does not match the configured SebPay environment.`,
    );
  }

  return trimmed;
}

function readOptionalPilotPhone(
  name: string,
  value: string | undefined,
): string | null {
  const trimmed = value?.trim() ?? "";

  if (trimmed === "") {
    return null;
  }

  if (!CAMEROON_PHONE_PATTERN.test(trimmed)) {
    throw new PaymentFoundationError(
      "PAYMENT_CONFIG_INVALID",
      `${name} must be a Cameroon number in international format without "+".`,
    );
  }

  return trimmed;
}

type EnvironmentSource = Readonly<Record<string, string | undefined>>;

/**
 * Reads the SebPay credentials. Called ONLY once payments are enabled —
 * the foundation config loader still reads nothing but safety flags.
 */
export function loadSebPayCredentials(
  environment: EnvironmentSource,
  sebPayEnvironment: SebPayEnvironment,
): SebPayCredentials {
  const publicPrefix = sebPayEnvironment === "live" ? "pk_live_" : "pk_test_";
  const secretPrefix = sebPayEnvironment === "live" ? "sk_live_" : "sk_test_";

  const publicKey = readKey(
    "SEBPAY_PUBLIC_KEY",
    environment.SEBPAY_PUBLIC_KEY,
    publicPrefix,
  );
  const secretKey = readKey(
    "SEBPAY_SECRET_KEY",
    environment.SEBPAY_SECRET_KEY,
    secretPrefix,
  );

  const callbackRaw = environment.SEBPAY_CALLBACK_URL?.trim() ?? "";
  let callbackUrl: string | null = null;

  if (callbackRaw !== "") {
    let parsed: URL;

    try {
      parsed = new URL(callbackRaw);
    } catch {
      throw new PaymentFoundationError(
        "PAYMENT_CONFIG_INVALID",
        "SEBPAY_CALLBACK_URL is not a valid URL.",
      );
    }

    if (parsed.protocol !== "https:") {
      throw new PaymentFoundationError(
        "PAYMENT_CONFIG_INVALID",
        "SEBPAY_CALLBACK_URL must use HTTPS.",
      );
    }

    callbackUrl = parsed.toString();
  }

  return Object.freeze({
    publicKey,
    secretKey,
    callbackUrl,
    pilotPhones: Object.freeze({
      "mtn-cm": readOptionalPilotPhone(
        "SEBPAY_PILOT_MTN_PHONE",
        environment.SEBPAY_PILOT_MTN_PHONE,
      ),
      "orange-cm": readOptionalPilotPhone(
        "SEBPAY_PILOT_ORANGE_PHONE",
        environment.SEBPAY_PILOT_ORANGE_PHONE,
      ),
    }),
  });
}

export interface SebPayCollectionInput {
  /** KASSALAFAM transaction identifier — sent as `external_reference`. */
  readonly externalReference: string;
  /** Integral XAF amount (XAF has no minor units). */
  readonly amountXaf: number;
  /** Payer MSISDN, international format without "+": 237XXXXXXXXX. */
  readonly payerPhone: string;
  readonly operator: SebPayCameroonOperator;
}

type SebPayEnvelope = {
  success?: unknown;
  data?: unknown;
  message?: unknown;
};

type SebPayCollectionData = {
  transaction_id?: unknown;
  status?: unknown;
  external_reference?: unknown;
};

/**
 * Maps the verified provider statuses to the internal ones. The official
 * documentation uses `pending` / `approved` / `rejected` on collections and
 * `PENDING` / `SUCCESS` / `FAILED` on its status-codes page: both spellings
 * are accepted, case-insensitively. Anything else fails closed.
 */
export function mapSebPayStatus(raw: unknown): InternalPaymentStatus {
  if (typeof raw !== "string") {
    throw new PaymentFoundationError(
      "PAYMENT_RESPONSE_INVALID",
      "Payment provider returned an invalid status.",
    );
  }

  switch (raw.trim().toLowerCase()) {
    case "pending":
      return "pending";
    case "approved":
    case "success":
      return "succeeded";
    case "rejected":
    case "failed":
      return "failed";
    default:
      throw new PaymentFoundationError(
        "PAYMENT_RESPONSE_INVALID",
        "Payment provider returned an unknown status.",
      );
  }
}

function parseCollectionEnvelope(
  payload: unknown,
): ProviderNeutralPaymentResult {
  const envelope = payload as SebPayEnvelope | null;

  if (
    envelope === null ||
    typeof envelope !== "object" ||
    typeof envelope.success !== "boolean"
  ) {
    throw new PaymentFoundationError(
      "PAYMENT_RESPONSE_INVALID",
      "Payment provider returned an unexpected envelope.",
    );
  }

  if (!envelope.success) {
    // Provider messages are never propagated to callers.
    throw new PaymentFoundationError(
      "PAYMENT_REQUEST_FAILED",
      "Payment provider rejected the request.",
    );
  }

  const data = envelope.data as SebPayCollectionData | null;

  if (
    data === null ||
    typeof data !== "object" ||
    typeof data.transaction_id !== "string" ||
    data.transaction_id.trim() === ""
  ) {
    throw new PaymentFoundationError(
      "PAYMENT_RESPONSE_INVALID",
      "Payment provider returned an incomplete payload.",
    );
  }

  return {
    provider: "sebpay",
    providerReference: data.transaction_id,
    status: mapSebPayStatus(data.status),
  };
}

export interface VerifiedSebPayProviderOptions {
  readonly config: SebPayFoundationConfig;
  readonly credentials: SebPayCredentials;
  readonly transportOptions?: Omit<
    GuardedJsonTransportOptions,
    "allowedOrigins"
  >;
}

export class VerifiedSebPayProvider {
  readonly code = "sebpay";

  #config: SebPayFoundationConfig;
  #credentials: SebPayCredentials;
  #transport: GuardedJsonTransport;
  #baseUrl: string;

  constructor(options: VerifiedSebPayProviderOptions) {
    if (!options.config.enabled) {
      throw new PaymentFoundationError(
        "PAYMENT_PROVIDER_DISABLED",
        "SebPay payments are disabled.",
      );
    }

    this.#config = options.config;
    this.#credentials = options.credentials;
    this.#transport = new GuardedJsonTransport({
      ...options.transportOptions,
      allowedOrigins: CONFIRMED_SEBPAY_API_ORIGINS,
    });
    this.#baseUrl = `${CONFIRMED_SEBPAY_API_ORIGINS[0]}${SEBPAY_API_BASE_PATH}`;
  }

  #authHeaders(): Readonly<Record<string, string>> {
    return {
      "X-Public-Key": this.#credentials.publicKey,
      "X-Secret-Key": this.#credentials.secretKey,
    };
  }

  #assertPilotAllows(input: SebPayCollectionInput): void {
    if (!this.#config.pilotMode) {
      return;
    }

    const allowedPhone = this.#credentials.pilotPhones[input.operator];

    if (allowedPhone === null || input.payerPhone !== allowedPhone) {
      throw new PaymentFoundationError(
        "PAYMENT_CONFIG_INVALID",
        "Pilot mode restricts payments to the configured pilot numbers.",
      );
    }
  }

  async initiateCollection(
    input: SebPayCollectionInput,
  ): Promise<ProviderNeutralPaymentResult> {
    if (
      !Number.isSafeInteger(input.amountXaf) ||
      input.amountXaf < 1 ||
      input.amountXaf > MAX_COLLECTION_AMOUNT_XAF
    ) {
      throw new PaymentFoundationError(
        "PAYMENT_CONFIG_INVALID",
        "Collection amount is outside the allowed range.",
      );
    }

    if (!CAMEROON_PHONE_PATTERN.test(input.payerPhone)) {
      throw new PaymentFoundationError(
        "PAYMENT_CONFIG_INVALID",
        "Payer phone must be a Cameroon number without the leading +.",
      );
    }

    if (!SEBPAY_CAMEROON_OPERATORS.includes(input.operator)) {
      throw new PaymentFoundationError(
        "PAYMENT_CONFIG_INVALID",
        "Unsupported SebPay operator.",
      );
    }

    if (input.externalReference.trim() === "") {
      throw new PaymentFoundationError(
        "PAYMENT_CONFIG_INVALID",
        "External reference is required.",
      );
    }

    this.#assertPilotAllows(input);

    const body: Record<string, unknown> = {
      amount: input.amountXaf,
      currency: SEBPAY_CAMEROON_CURRENCY,
      phone: input.payerPhone,
      operator: input.operator,
      country: SEBPAY_CAMEROON_COUNTRY,
      external_reference: input.externalReference,
    };

    if (this.#credentials.callbackUrl !== null) {
      body.callback_url = this.#credentials.callbackUrl;
    }

    const payload = await this.#transport.request<unknown>({
      url: new URL(`${this.#baseUrl}/collections`),
      method: "POST",
      headers: this.#authHeaders(),
      body,
    });

    return parseCollectionEnvelope(payload);
  }

  async getCollectionStatus(
    reference: string,
  ): Promise<ProviderNeutralPaymentResult> {
    const trimmed = reference.trim();

    if (trimmed === "") {
      throw new PaymentFoundationError(
        "PAYMENT_CONFIG_INVALID",
        "Collection reference is required.",
      );
    }

    const payload = await this.#transport.request<unknown>({
      url: new URL(
        `${this.#baseUrl}/collections/${encodeURIComponent(trimmed)}`,
      ),
      method: "GET",
      headers: this.#authHeaders(),
    });

    return parseCollectionEnvelope(payload);
  }
}

/**
 * Builds the SebPay provider for the current environment.
 *
 * Disabled (the default): returns the locked provider — no credential is read
 * and no network call is possible. Enabled: reads and validates credentials,
 * then returns the verified adapter.
 */
export function createSebPayProvider(
  environment: EnvironmentSource = process.env,
): LockedSebPayProvider | VerifiedSebPayProvider {
  const config = loadSebPayFoundationConfig(environment);

  if (!config.enabled) {
    return new LockedSebPayProvider(config);
  }

  const credentials = loadSebPayCredentials(environment, config.environment);

  return new VerifiedSebPayProvider({ config, credentials });
}
