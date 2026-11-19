import "server-only";

import {
  GuardedJsonTransport,
  PaymentFoundationError,
  type GuardedJsonTransportOptions,
  type InternalPaymentStatus,
} from "../sebpay/foundation-core.ts";
import {
  CAMEROON_PHONE_PATTERN,
  SAASPAY_API_BASE_PATH,
  SAASPAY_COUNTRY,
  SAASPAY_CURRENCY,
  SAASPAY_NETWORKS,
  SAASPAY_PROVIDER_CODE,
  loadSaaspayConfig,
  loadSaaspayCredentials,
  type SaaspayConfig,
  type SaaspayCredentials,
  type SaaspayNetwork,
} from "./config.ts";

/**
 * Adaptateur Saaspay — paiement direct Mobile Money (« softpay »).
 *
 * Contrat (docs.saspay.me, lu le 2026-11-19) :
 *  - `POST /payments/softpay/` : `amount` (décimal en chaîne), `currency`,
 *    `country`, `network`, `customer { email, first_name, last_name, phone }`,
 *    `description`, `metadata` libre ; en-tête `Idempotency-Key` (même clé +
 *    même corps = réponse d'origine, sans second débit) ;
 *  - réponse `{ success, data: { id, status, checkout_url }, code }` ;
 *  - `GET /payments/{id}/verify/` : statut courant (`PENDING`, `SUCCESS`,
 *    `FAILED`, `CANCELLED`).
 *
 * Invariants : aucun message fournisseur n'est propagé, statut inconnu =
 * échec fermé, mode pilote restreint aux numéros configurés, et cet
 * adaptateur n'écrit jamais `profiles.is_premium`.
 */

const MAX_AMOUNT_XAF = 10_000_000;
const MAX_TEXT_LENGTH = 100;

export interface SaaspayPaymentResult {
  readonly provider: typeof SAASPAY_PROVIDER_CODE;
  readonly providerReference: string;
  readonly status: InternalPaymentStatus;
  /** Page de validation fournisseur (Orange, carte…) ; `null` si push USSD. */
  readonly checkoutUrl: string | null;
}

export interface SaaspayCustomer {
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  /** Format international sans « + » : 237XXXXXXXXX. */
  readonly phone: string;
}

export interface SaaspayPaymentInput {
  /** Identifiant KASSALAFAM de la transaction, aussi clé d'idempotence. */
  readonly idempotencyKey: string;
  readonly transactionId: string;
  /** Montant entier en XAF (pas de sous-unité). */
  readonly amountXaf: number;
  readonly network: SaaspayNetwork;
  readonly customer: SaaspayCustomer;
  readonly description: string;
}

/** Statuts de transaction Saaspay → statuts internes. Inconnu = échec fermé. */
export function mapSaaspayStatus(raw: unknown): InternalPaymentStatus {
  if (typeof raw !== "string") {
    throw new PaymentFoundationError(
      "PAYMENT_RESPONSE_INVALID",
      "Payment provider returned an invalid status.",
    );
  }

  switch (raw.trim().toUpperCase()) {
    case "PENDING":
      return "pending";
    case "SUCCESS":
      return "succeeded";
    case "FAILED":
      return "failed";
    case "CANCELLED":
      return "cancelled";
    default:
      throw new PaymentFoundationError(
        "PAYMENT_RESPONSE_INVALID",
        "Payment provider returned an unknown status.",
      );
  }
}

/**
 * Montant décimal Saaspay (« 5900.00 », ou nombre) → XAF entiers. Toute
 * fraction non nulle est refusée : le XAF n'a pas de sous-unité.
 */
export function parseSaaspayAmount(value: unknown): number | null {
  let text: string;

  if (typeof value === "number" && Number.isFinite(value)) {
    text = String(value);
  } else if (typeof value === "string") {
    text = value.trim();
  } else {
    return null;
  }

  const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(text);

  if (match === null || (match[2] !== undefined && Number(match[2]) !== 0)) {
    return null;
  }

  const amount = Number(match[1]);
  return amount >= 1 ? amount : null;
}

function readCheckoutUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function parseEnvelope(payload: unknown): SaaspayPaymentResult {
  const envelope = payload as { success?: unknown; data?: unknown } | null;

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
    throw new PaymentFoundationError(
      "PAYMENT_REQUEST_FAILED",
      "Payment provider rejected the request.",
    );
  }

  const data = envelope.data as {
    id?: unknown;
    status?: unknown;
    checkout_url?: unknown;
  } | null;

  if (
    data === null ||
    typeof data !== "object" ||
    typeof data.id !== "string" ||
    data.id.trim().length < 2 ||
    data.id.trim().length > 200
  ) {
    throw new PaymentFoundationError(
      "PAYMENT_RESPONSE_INVALID",
      "Payment provider returned an incomplete payload.",
    );
  }

  return Object.freeze({
    provider: SAASPAY_PROVIDER_CODE,
    providerReference: data.id.trim(),
    status: mapSaaspayStatus(data.status),
    checkoutUrl: readCheckoutUrl(data.checkout_url),
  });
}

function assertText(name: string, value: string): string {
  const trimmed = value.trim();

  if (trimmed === "" || trimmed.length > MAX_TEXT_LENGTH) {
    throw new PaymentFoundationError(
      "PAYMENT_CONFIG_INVALID",
      `${name} is missing or too long.`,
    );
  }

  return trimmed;
}

export interface SaaspayProviderOptions {
  readonly config: SaaspayConfig;
  readonly credentials: SaaspayCredentials;
  readonly transportOptions?: Omit<
    GuardedJsonTransportOptions,
    "allowedOrigins"
  >;
}

export class SaaspayProvider {
  readonly code = SAASPAY_PROVIDER_CODE;

  #config: SaaspayConfig;
  #credentials: SaaspayCredentials;
  #transport: GuardedJsonTransport;
  #baseUrl: string;

  constructor(options: SaaspayProviderOptions) {
    if (!options.config.enabled) {
      throw new PaymentFoundationError(
        "PAYMENT_PROVIDER_DISABLED",
        "Saaspay payments are disabled.",
      );
    }

    this.#config = options.config;
    this.#credentials = options.credentials;
    this.#transport = new GuardedJsonTransport({
      ...options.transportOptions,
      allowedOrigins: [options.config.apiOrigin],
    });
    this.#baseUrl = `${options.config.apiOrigin}${SAASPAY_API_BASE_PATH}`;
  }

  #headers(extra: Record<string, string> = {}): Record<string, string> {
    return { Authorization: `Bearer ${this.#credentials.secretKey}`, ...extra };
  }

  async initiatePayment(
    input: SaaspayPaymentInput,
  ): Promise<SaaspayPaymentResult> {
    if (
      !Number.isSafeInteger(input.amountXaf) ||
      input.amountXaf < 1 ||
      input.amountXaf > MAX_AMOUNT_XAF
    ) {
      throw new PaymentFoundationError(
        "PAYMENT_CONFIG_INVALID",
        "Payment amount is outside the allowed range.",
      );
    }

    if (!SAASPAY_NETWORKS.includes(input.network)) {
      throw new PaymentFoundationError(
        "PAYMENT_CONFIG_INVALID",
        "Unsupported Saaspay network.",
      );
    }

    if (!CAMEROON_PHONE_PATTERN.test(input.customer.phone)) {
      throw new PaymentFoundationError(
        "PAYMENT_CONFIG_INVALID",
        'Payer phone must be a Cameroon number without the leading "+".',
      );
    }

    const idempotencyKey = input.idempotencyKey.trim();

    if (idempotencyKey.length < 16 || idempotencyKey.length > 200) {
      throw new PaymentFoundationError(
        "PAYMENT_CONFIG_INVALID",
        "Idempotency key is invalid.",
      );
    }

    if (
      this.#config.pilotMode &&
      !this.#credentials.pilotPhones.has(input.customer.phone)
    ) {
      throw new PaymentFoundationError(
        "PAYMENT_CONFIG_INVALID",
        "Pilot mode restricts payments to the configured pilot numbers.",
      );
    }

    const payload = await this.#transport.request<unknown>({
      url: new URL(`${this.#baseUrl}/payments/softpay/`),
      method: "POST",
      headers: this.#headers({ "Idempotency-Key": idempotencyKey }),
      body: {
        amount: `${input.amountXaf}.00`,
        currency: SAASPAY_CURRENCY,
        country: SAASPAY_COUNTRY,
        network: input.network,
        description: assertText("description", input.description),
        customer: {
          email: assertText("customer.email", input.customer.email),
          first_name: assertText("customer.firstName", input.customer.firstName),
          last_name: assertText("customer.lastName", input.customer.lastName),
          phone: input.customer.phone,
        },
        metadata: {
          kassalafam_transaction_id: assertText(
            "transactionId",
            input.transactionId,
          ),
        },
      },
    });

    return parseEnvelope(payload);
  }

  async getPaymentStatus(
    providerReference: string,
  ): Promise<SaaspayPaymentResult> {
    const reference = providerReference.trim();

    if (reference.length < 2 || reference.length > 200) {
      throw new PaymentFoundationError(
        "PAYMENT_CONFIG_INVALID",
        "Payment reference is required.",
      );
    }

    const payload = await this.#transport.request<unknown>({
      url: new URL(
        `${this.#baseUrl}/payments/${encodeURIComponent(reference)}/verify/`,
      ),
      method: "GET",
      headers: this.#headers(),
    });

    return parseEnvelope(payload);
  }
}

/**
 * Désactivé (défaut) : `null`, aucun secret lu, aucun appel réseau possible.
 * Activé : secrets lus et validés, puis adaptateur.
 */
export function createSaaspayProvider(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): SaaspayProvider | null {
  const config = loadSaaspayConfig(environment);

  if (!config.enabled) {
    return null;
  }

  return new SaaspayProvider({
    config,
    credentials: loadSaaspayCredentials(environment, config.environment),
  });
}
