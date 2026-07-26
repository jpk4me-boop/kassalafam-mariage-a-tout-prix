import "server-only";

/**
 * Provider-neutral payment foundation with a locked SebPay adapter.
 *
 * This file intentionally contains no SebPay endpoint, authentication header,
 * provider payload, webhook shape, or status mapping. Those details remain
 * blocked until the official merchant contract is independently verified.
 */

export const SEBPAY_PROVIDER_CODE = "sebpay" as const;
export const SEBPAY_CONTRACT_STATE = "unconfirmed" as const;

/**
 * Deliberately empty. An origin may be added only after official verification.
 * Environment variables cannot expand this allowlist on their own.
 */
export const CONFIRMED_SEBPAY_API_ORIGINS: readonly string[] =
  Object.freeze([]);

export type PaymentCurrency = "XAF";

export type InternalPaymentStatus =
  | "initiated"
  | "pending"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "refunded";

export interface ProviderNeutralPaymentRequest {
  transactionId: string;
  idempotencyKey: string;
  amountMinor: number;
  currency: PaymentCurrency;
  customerReference: string;
}

export interface ProviderNeutralPaymentResult {
  provider: string;
  providerReference: string;
  status: InternalPaymentStatus;
}

export interface ProviderNeutralPaymentProvider {
  readonly code: string;

  initiatePayment(
    request: ProviderNeutralPaymentRequest,
  ): Promise<ProviderNeutralPaymentResult>;

  getPaymentStatus(
    providerReference: string,
  ): Promise<ProviderNeutralPaymentResult>;
}

export type PaymentFoundationErrorCode =
  | "PAYMENT_CONFIG_INVALID"
  | "PAYMENT_ORIGIN_NOT_ALLOWED"
  | "PAYMENT_PROVIDER_DISABLED"
  | "PAYMENT_PROVIDER_CONTRACT_UNCONFIRMED"
  | "PAYMENT_REQUEST_ABORTED"
  | "PAYMENT_REQUEST_FAILED"
  | "PAYMENT_REQUEST_TIMEOUT"
  | "PAYMENT_RESPONSE_INVALID"
  | "PAYMENT_RESPONSE_TOO_LARGE"
  | "PAYMENT_URL_INVALID";

export class PaymentFoundationError extends Error {
  readonly code: PaymentFoundationErrorCode;

  constructor(code: PaymentFoundationErrorCode, message: string) {
    super(message);
    this.name = "PaymentFoundationError";
    this.code = code;
  }
}

export type SebPayEnvironment = "test" | "live";

export interface SebPayFoundationConfig {
  readonly provider: typeof SEBPAY_PROVIDER_CODE;
  readonly enabled: false;
  readonly pilotMode: boolean;
  readonly environment: SebPayEnvironment;
  readonly contractConfirmed: false;
  readonly allowedApiOrigins: readonly string[];
}

type EnvironmentSource = Readonly<Record<string, string | undefined>>;

function parseStrictBoolean(
  name: string,
  value: string | undefined,
  defaultValue: boolean,
): boolean {
  if (value === undefined || value.trim() === "") {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "true") {
    return true;
  }

  if (normalized === "false") {
    return false;
  }

  throw new PaymentFoundationError(
    "PAYMENT_CONFIG_INVALID",
    `${name} must be either true or false.`,
  );
}

function parseEnvironment(value: string | undefined): SebPayEnvironment {
  if (value === undefined || value.trim() === "") {
    return "test";
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "test" || normalized === "live") {
    return normalized;
  }

  throw new PaymentFoundationError(
    "PAYMENT_CONFIG_INVALID",
    "SEBPAY_ENVIRONMENT must be either test or live.",
  );
}

/**
 * Reads only non-secret safety flags.
 *
 * API keys, phone numbers, callback URLs, operators, and API base URLs are not
 * consumed while the official provider contract is unconfirmed.
 */
export function loadSebPayFoundationConfig(
  environment: EnvironmentSource = process.env,
): SebPayFoundationConfig {
  const enabled = parseStrictBoolean(
    "SEBPAY_PAYMENTS_ENABLED",
    environment.SEBPAY_PAYMENTS_ENABLED,
    false,
  );
  const pilotMode = parseStrictBoolean(
    "SEBPAY_PILOT_MODE",
    environment.SEBPAY_PILOT_MODE,
    true,
  );
  const sebPayEnvironment = parseEnvironment(environment.SEBPAY_ENVIRONMENT);

  if (enabled) {
    throw new PaymentFoundationError(
      "PAYMENT_PROVIDER_CONTRACT_UNCONFIRMED",
      "SebPay cannot be enabled until its official merchant contract is verified and committed.",
    );
  }

  return Object.freeze({
    provider: SEBPAY_PROVIDER_CODE,
    enabled: false,
    pilotMode,
    environment: sebPayEnvironment,
    contractConfirmed: false,
    allowedApiOrigins: CONFIRMED_SEBPAY_API_ORIGINS,
  });
}

export class LockedSebPayProvider implements ProviderNeutralPaymentProvider {
  readonly code = SEBPAY_PROVIDER_CODE;
  #config: SebPayFoundationConfig;

  constructor(config: SebPayFoundationConfig) {
    this.#config = config;
  }

  async initiatePayment(
    request: ProviderNeutralPaymentRequest,
  ): Promise<ProviderNeutralPaymentResult> {
    void request;
    this.assertUnavailable();
  }

  async getPaymentStatus(
    providerReference: string,
  ): Promise<ProviderNeutralPaymentResult> {
    void providerReference;
    this.assertUnavailable();
  }

  private assertUnavailable(): never {
    if (!this.#config.enabled) {
      throw new PaymentFoundationError(
        "PAYMENT_PROVIDER_DISABLED",
        "SebPay payments are disabled.",
      );
    }

    throw new PaymentFoundationError(
      "PAYMENT_PROVIDER_CONTRACT_UNCONFIRMED",
      "SebPay provider contract is not confirmed.",
    );
  }
}

export interface GuardedJsonTransportRequest {
  readonly url: URL;
  readonly method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: unknown;
  readonly signal?: AbortSignal;
}

export interface GuardedJsonTransportOptions {
  readonly allowedOrigins: readonly string[];
  readonly timeoutMs?: number;
  readonly maxResponseBytes?: number;
  readonly fetchImpl?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RESPONSE_BYTES = 256 * 1024;
const FORBIDDEN_REQUEST_HEADERS = new Set([
  "connection",
  "content-length",
  "cookie",
  "host",
  "transfer-encoding",
]);

function normalizeAllowedOrigin(value: string): string {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new PaymentFoundationError(
      "PAYMENT_CONFIG_INVALID",
      "A payment API origin is invalid.",
    );
  }

  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new PaymentFoundationError(
      "PAYMENT_CONFIG_INVALID",
      "Payment API origins must be credential-free HTTPS origins.",
    );
  }

  return url.origin;
}

function validatePositiveInteger(
  value: number,
  name: string,
  maximum: number,
): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new PaymentFoundationError(
      "PAYMENT_CONFIG_INVALID",
      `${name} is outside the allowed range.`,
    );
  }

  return value;
}

async function readResponseText(
  response: Response,
  maxResponseBytes: number,
): Promise<string> {
  const contentLengthHeader = response.headers.get("content-length");

  if (contentLengthHeader !== null) {
    const contentLength = Number(contentLengthHeader);

    if (
      !Number.isSafeInteger(contentLength) ||
      contentLength < 0 ||
      contentLength > maxResponseBytes
    ) {
      throw new PaymentFoundationError(
        "PAYMENT_RESPONSE_TOO_LARGE",
        "Payment provider response exceeds the allowed size.",
      );
    }
  }

  if (response.body === null) {
    return "";
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let byteCount = 0;
  let text = "";

  try {
    while (true) {
      const chunk = await reader.read();

      if (chunk.done) {
        break;
      }

      byteCount += chunk.value.byteLength;

      if (byteCount > maxResponseBytes) {
        await reader.cancel();
        throw new PaymentFoundationError(
          "PAYMENT_RESPONSE_TOO_LARGE",
          "Payment provider response exceeds the allowed size.",
        );
      }

      text += decoder.decode(chunk.value, { stream: true });
    }

    text += decoder.decode();
    return text;
  } finally {
    reader.releaseLock();
  }
}

async function cancelResponseBodySilently(response: Response): Promise<void> {
  if (response.body === null) {
    return;
  }

  try {
    await response.body.cancel();
  } catch {
    // Best effort only: preserve the original sanitized provider failure.
  }
}

/**
 * Generic JSON transport for a future verified provider adapter.
 *
 * It does not contain provider routes or credentials. It denies all requests
 * when its immutable allowlist is empty.
 */
export class GuardedJsonTransport {
  private readonly allowedOrigins: ReadonlySet<string>;
  private readonly timeoutMs: number;
  private readonly maxResponseBytes: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: GuardedJsonTransportOptions) {
    this.allowedOrigins = new Set(
      options.allowedOrigins.map(normalizeAllowedOrigin),
    );
    this.timeoutMs = validatePositiveInteger(
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      "timeoutMs",
      60_000,
    );
    this.maxResponseBytes = validatePositiveInteger(
      options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
      "maxResponseBytes",
      1024 * 1024,
    );
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  async request<T>(request: GuardedJsonTransportRequest): Promise<T> {
    const url = request.url;

    if (
      url.protocol !== "https:" ||
      url.username !== "" ||
      url.password !== ""
    ) {
      throw new PaymentFoundationError(
        "PAYMENT_URL_INVALID",
        "Payment provider request URL is invalid.",
      );
    }

    if (!this.allowedOrigins.has(url.origin)) {
      throw new PaymentFoundationError(
        "PAYMENT_ORIGIN_NOT_ALLOWED",
        "Payment provider origin is not allowed.",
      );
    }

    if (request.method === "GET" && request.body !== undefined) {
      throw new PaymentFoundationError(
        "PAYMENT_CONFIG_INVALID",
        "GET payment requests cannot contain a body.",
      );
    }

    const headers = new Headers();

    for (const [name, value] of Object.entries(request.headers ?? {})) {
      if (FORBIDDEN_REQUEST_HEADERS.has(name.trim().toLowerCase())) {
        throw new PaymentFoundationError(
          "PAYMENT_CONFIG_INVALID",
          "A forbidden payment request header was supplied.",
        );
      }

      headers.set(name, value);
    }

    let body: string | undefined;

    if (request.body !== undefined) {
      try {
        body = JSON.stringify(request.body);
      } catch {
        throw new PaymentFoundationError(
          "PAYMENT_CONFIG_INVALID",
          "Payment request body is not JSON serializable.",
        );
      }

      if (!headers.has("content-type")) {
        headers.set("content-type", "application/json");
      }
    }

    headers.set("accept", "application/json");

    const controller = new AbortController();
    let timedOut = false;

    const abortFromCaller = () => {
      controller.abort(request.signal?.reason);
    };

    if (request.signal?.aborted) {
      abortFromCaller();
    } else {
      request.signal?.addEventListener("abort", abortFromCaller, {
        once: true,
      });
    }

    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);

    try {
      const response = await this.fetchImpl(url, {
        method: request.method,
        headers,
        body,
        signal: controller.signal,
        redirect: "error",
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer",
      });

      if (!response.ok) {
        await cancelResponseBodySilently(response);
        throw new PaymentFoundationError(
          "PAYMENT_REQUEST_FAILED",
          "Payment provider returned an unsuccessful response.",
        );
      }

      const contentType = response.headers.get("content-type") ?? "";

      if (
        !contentType.toLowerCase().includes("application/json") &&
        !contentType.toLowerCase().includes("+json")
      ) {
        throw new PaymentFoundationError(
          "PAYMENT_RESPONSE_INVALID",
          "Payment provider response is not JSON.",
        );
      }

      const text = await readResponseText(response, this.maxResponseBytes);

      if (text.trim() === "") {
        throw new PaymentFoundationError(
          "PAYMENT_RESPONSE_INVALID",
          "Payment provider returned an empty response.",
        );
      }

      try {
        return JSON.parse(text) as T;
      } catch {
        throw new PaymentFoundationError(
          "PAYMENT_RESPONSE_INVALID",
          "Payment provider returned invalid JSON.",
        );
      }
    } catch (error) {
      if (error instanceof PaymentFoundationError) {
        throw error;
      }

      if (timedOut) {
        throw new PaymentFoundationError(
          "PAYMENT_REQUEST_TIMEOUT",
          "Payment provider request timed out.",
        );
      }

      if (controller.signal.aborted) {
        throw new PaymentFoundationError(
          "PAYMENT_REQUEST_ABORTED",
          "Payment provider request was aborted.",
        );
      }

      throw new PaymentFoundationError(
        "PAYMENT_REQUEST_FAILED",
        "Payment provider request failed.",
      );
    } finally {
      clearTimeout(timeout);
      request.signal?.removeEventListener("abort", abortFromCaller);
    }
  }
}