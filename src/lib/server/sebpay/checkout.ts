import "server-only";

import {
  loadSebPayFoundationConfig,
  type ProviderNeutralPaymentResult,
} from "./foundation-core.ts";
import {
  SEBPAY_CAMEROON_OPERATORS,
  loadSebPayCredentials,
  type SebPayCameroonOperator,
} from "./adapter.ts";

/**
 * SebPay member checkout — Phase 4.
 *
 * Transport-agnostic decision chain (unit-testable without Next.js or any
 * network access): configuration gate → input validation → pilot gate →
 * authoritative transaction creation → provider collection → status linking.
 *
 * Security invariants preserved from the foundation:
 *  - while payments are disabled, NO secret is read and the flow is
 *    unavailable (503) — fail-closed, no visual change on /premium ;
 *  - in pilot mode, non-pilot numbers are refused BEFORE any database write
 *    or network call ;
 *  - the payer phone number is used once for the collection call and never
 *    persisted by KASSALAFAM ;
 *  - Premium activation stays exclusively in `apply_sebpay_payment_update`
 *    (webhook / reconciliation / initiation response all converge there).
 */

export const SEBPAY_CHECKOUT_PLAN_CODES = [
  "premium_1_mois",
  "premium_3_mois",
  "premium_6_mois",
] as const;

export type SebPayCheckoutPlanCode =
  (typeof SEBPAY_CHECKOUT_PLAN_CODES)[number];

const CAMEROON_PHONE_PATTERN = /^237\d{9}$/;

export interface SebPayCheckoutInput {
  readonly planCode: SebPayCheckoutPlanCode;
  readonly operator: SebPayCameroonOperator;
  readonly payerPhone: string;
}

/** Validates the client payload. Returns null on anything non-contractual. */
export function parseCheckoutRequest(
  payload: unknown,
): SebPayCheckoutInput | null {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const record = payload as Record<string, unknown>;

  const planCode = typeof record.planCode === "string"
    ? record.planCode.trim()
    : "";
  const operator = typeof record.operator === "string"
    ? record.operator.trim()
    : "";
  const payerPhone = typeof record.payerPhone === "string"
    ? record.payerPhone.trim()
    : "";

  if (
    !(SEBPAY_CHECKOUT_PLAN_CODES as readonly string[]).includes(planCode) ||
    !(SEBPAY_CAMEROON_OPERATORS as readonly string[]).includes(operator) ||
    !CAMEROON_PHONE_PATTERN.test(payerPhone)
  ) {
    return null;
  }

  return Object.freeze({
    planCode: planCode as SebPayCheckoutPlanCode,
    operator: operator as SebPayCameroonOperator,
    payerPhone,
  });
}

/** Business errors raised by the initiation RPC, carried by their code. */
export class SebPayCheckoutError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "SebPayCheckoutError";
    this.code = code;
  }
}

const KNOWN_BUSINESS_ERROR_CODES = [
  "PREMIUM_ALREADY_ACTIVE",
  "PAYMENT_ALREADY_IN_PROGRESS",
  "PREMIUM_PLAN_NOT_AVAILABLE",
  "ACCOUNT_SUSPENDED",
  "PROFILE_NOT_FOUND",
] as const;

/** Extracts a known business code from a database error message. */
export function toCheckoutErrorCode(message: string): string {
  for (const code of KNOWN_BUSINESS_ERROR_CODES) {
    if (message.includes(code)) {
      return code;
    }
  }

  return "UNKNOWN";
}

export interface InitiatedCheckoutTransaction {
  readonly transactionId: string;
  readonly idempotencyKey: string;
  readonly amountXaf: number;
}

export interface CheckoutCollectionInput {
  readonly externalReference: string;
  readonly amountXaf: number;
  readonly payerPhone: string;
  readonly operator: SebPayCameroonOperator;
}

export interface CheckoutApplyInput {
  readonly providerReference: string;
  readonly externalReference: string;
  readonly rawStatus: string;
  readonly mappedStatus: string;
  readonly amountXaf: number | null;
  readonly currency: string | null;
}

export interface HandleSebPayCheckoutOptions {
  readonly rawPayload: unknown;
  readonly environment?: Readonly<Record<string, string | undefined>>;
  /** Wired to `initiate_sebpay_payment_transaction` by the route. */
  readonly initiateTransaction: (input: {
    planCode: SebPayCheckoutPlanCode;
  }) => Promise<InitiatedCheckoutTransaction>;
  /** Wired to `VerifiedSebPayProvider.initiateCollection` by the route. */
  readonly initiateCollection: (
    input: CheckoutCollectionInput,
  ) => Promise<ProviderNeutralPaymentResult>;
  /** Wired to `apply_sebpay_payment_update` by the route. */
  readonly applyUpdate: (input: CheckoutApplyInput) => Promise<void>;
}

export interface SebPayCheckoutOutcome {
  readonly status: number;
  readonly body: {
    readonly ok: boolean;
    readonly code?: string;
    readonly transactionId?: string;
    readonly paymentStatus?: string;
  };
}

function failure(status: number, code: string): SebPayCheckoutOutcome {
  return { status, body: { ok: false, code } };
}

export async function handleSebPayCheckout(
  options: HandleSebPayCheckoutOptions,
): Promise<SebPayCheckoutOutcome> {
  const environment = options.environment ?? process.env;
  let pilotMode: boolean;
  let pilotPhones: Readonly<Record<SebPayCameroonOperator, string | null>>;

  try {
    const config = loadSebPayFoundationConfig(environment);

    if (!config.enabled) {
      // Fermé par défaut : aucun secret n'est lu.
      return failure(503, "payments_closed");
    }

    const credentials = loadSebPayCredentials(environment, config.environment);
    pilotMode = config.pilotMode;
    pilotPhones = credentials.pilotPhones;
  } catch {
    // Configuration invalide = indisponible, sans détail.
    return failure(503, "payments_closed");
  }

  const input = parseCheckoutRequest(options.rawPayload);

  if (input === null) {
    return failure(400, "invalid_request");
  }

  // Garde pilote AVANT toute écriture : message clair côté membre, aucun
  // appel réseau, aucune transaction créée.
  if (pilotMode && pilotPhones[input.operator] !== input.payerPhone) {
    return failure(403, "pilot_restricted");
  }

  let transaction: InitiatedCheckoutTransaction;

  try {
    transaction = await options.initiateTransaction({
      planCode: input.planCode,
    });
  } catch (error) {
    if (error instanceof SebPayCheckoutError) {
      switch (error.code) {
        case "PREMIUM_ALREADY_ACTIVE":
          return failure(409, "premium_already_active");
        case "PAYMENT_ALREADY_IN_PROGRESS":
          return failure(409, "payment_in_progress");
        case "PREMIUM_PLAN_NOT_AVAILABLE":
          return failure(400, "plan_not_available");
        case "ACCOUNT_SUSPENDED":
        case "PROFILE_NOT_FOUND":
          return failure(403, "account_not_eligible");
        default:
          return failure(500, "internal_error");
      }
    }

    return failure(500, "internal_error");
  }

  let collection: ProviderNeutralPaymentResult;

  try {
    collection = await options.initiateCollection({
      externalReference: transaction.idempotencyKey,
      amountXaf: transaction.amountXaf,
      payerPhone: input.payerPhone,
      operator: input.operator,
    });
  } catch {
    // L'appel fournisseur a échoué SANS certitude sur l'état réel côté
    // SebPay (rejet, timeout, réponse invalide…). Fail-closed : la
    // transaction reste `initiated` — jamais de `failed` spéculatif qui
    // rendrait terminal un paiement qu'un webhook confirmerait ensuite.
    // Un webhook ou la réconciliation la dénouera ; sinon l'annulation
    // automatique des `initiated` de plus de 15 minutes libérera le membre.
    return failure(502, "provider_unavailable");
  }

  try {
    // Lie la référence SebPay et fait avancer la machine à états
    // (initiated → pending, ou statut immédiat). En cas d'échec ici, le
    // webhook ou la réconciliation retrouveront la transaction par
    // external_reference : on ne bloque pas le membre.
    await options.applyUpdate({
      providerReference: collection.providerReference,
      externalReference: transaction.idempotencyKey,
      rawStatus: `initiation_${collection.status}`,
      mappedStatus: collection.status,
      amountXaf: transaction.amountXaf,
      currency: "XAF",
    });
  } catch {
    // Rattrapé par webhook / réconciliation.
  }

  return {
    status: 200,
    body: {
      ok: true,
      transactionId: transaction.transactionId,
      paymentStatus: collection.status,
    },
  };
}
