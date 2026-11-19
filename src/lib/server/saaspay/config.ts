import "server-only";

import { PaymentFoundationError } from "../sebpay/foundation-core.ts";

/**
 * Saaspay (SasPay, docs.saspay.me) — configuration verrouillée par défaut.
 *
 * Contrat lu le 2026-11-19 dans la documentation officielle :
 *  - origines : `https://api.saspay.me` (live) et
 *    `https://sandbox-api.saspay.me` (sandbox) — c'est l'URL de base, et non
 *    le préfixe de clé, qui choisit l'environnement ;
 *  - authentification `Authorization: Bearer sk_live_…` / `sk_test_…` ;
 *  - webhooks signés par un `signing_secret` distinct de la clé API.
 *
 * Invariants repris de la fondation SebPay :
 *  - `SAASPAY_PAYMENTS_ENABLED` vaut `false` par défaut ;
 *  - aucun secret n'est lu tant que les paiements sont désactivés ;
 *  - aucune valeur de secret n'apparaît dans un message d'erreur ;
 *  - l'allowlist d'origines n'est pas extensible par variable d'environnement.
 */

export const SAASPAY_PROVIDER_CODE = "saaspay" as const;

export type SaaspayEnvironment = "test" | "live";

export const SAASPAY_API_ORIGINS: Readonly<Record<SaaspayEnvironment, string>> =
  Object.freeze({
    test: "https://sandbox-api.saspay.me",
    live: "https://api.saspay.me",
  });

export const SAASPAY_API_BASE_PATH = "/api/v1" as const;

/** Périmètre initial : Cameroun, XAF (contrainte `currency = 'XAF'` en base). */
export const SAASPAY_COUNTRY = "CM" as const;
export const SAASPAY_CURRENCY = "XAF" as const;

export type SaaspayNetwork = "mtn_cm" | "orange_cm";

export const SAASPAY_NETWORKS: readonly SaaspayNetwork[] = Object.freeze([
  "mtn_cm",
  "orange_cm",
]);

/** Numéro camerounais, format international sans « + » : 237 + 9 chiffres. */
export const CAMEROON_PHONE_PATTERN = /^237\d{9}$/;

export interface SaaspayConfig {
  readonly provider: typeof SAASPAY_PROVIDER_CODE;
  readonly enabled: boolean;
  readonly pilotMode: boolean;
  readonly environment: SaaspayEnvironment;
  readonly apiOrigin: string;
}

export interface SaaspayCredentials {
  readonly secretKey: string;
  readonly webhookSecret: string;
  readonly pilotPhones: ReadonlySet<string>;
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

function parseEnvironment(value: string | undefined): SaaspayEnvironment {
  if (value === undefined || value.trim() === "") {
    return "test";
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "test" || normalized === "live") {
    return normalized;
  }

  throw new PaymentFoundationError(
    "PAYMENT_CONFIG_INVALID",
    "SAASPAY_ENVIRONMENT must be either test or live.",
  );
}

/** Lit uniquement les drapeaux de sécurité, jamais un secret. */
export function loadSaaspayConfig(
  environment: EnvironmentSource = process.env,
): SaaspayConfig {
  const saaspayEnvironment = parseEnvironment(environment.SAASPAY_ENVIRONMENT);

  return Object.freeze({
    provider: SAASPAY_PROVIDER_CODE,
    enabled: parseStrictBoolean(
      "SAASPAY_PAYMENTS_ENABLED",
      environment.SAASPAY_PAYMENTS_ENABLED,
      false,
    ),
    pilotMode: parseStrictBoolean(
      "SAASPAY_PILOT_MODE",
      environment.SAASPAY_PILOT_MODE,
      true,
    ),
    environment: saaspayEnvironment,
    apiOrigin: SAASPAY_API_ORIGINS[saaspayEnvironment],
  });
}

function readRequired(name: string, value: string | undefined): string {
  const trimmed = value?.trim() ?? "";

  if (trimmed === "") {
    throw new PaymentFoundationError(
      "PAYMENT_CONFIG_INVALID",
      `${name} is required when Saaspay payments are enabled.`,
    );
  }

  return trimmed;
}

function readPilotPhones(value: string | undefined): ReadonlySet<string> {
  const phones = new Set<string>();

  for (const entry of (value ?? "").split(",")) {
    const phone = entry.trim();

    if (phone === "") {
      continue;
    }

    if (!CAMEROON_PHONE_PATTERN.test(phone)) {
      throw new PaymentFoundationError(
        "PAYMENT_CONFIG_INVALID",
        'SAASPAY_PILOT_PHONES must list Cameroon numbers without "+".',
      );
    }

    phones.add(phone);
  }

  return phones;
}

/** Lit les secrets. À n'appeler QUE lorsque les paiements sont activés. */
export function loadSaaspayCredentials(
  environment: EnvironmentSource,
  saaspayEnvironment: SaaspayEnvironment,
): SaaspayCredentials {
  const secretKey = readRequired(
    "SAASPAY_SECRET_KEY",
    environment.SAASPAY_SECRET_KEY,
  );
  const expectedPrefix = saaspayEnvironment === "live" ? "sk_live_" : "sk_test_";

  if (!secretKey.startsWith(expectedPrefix)) {
    throw new PaymentFoundationError(
      "PAYMENT_CONFIG_INVALID",
      "SAASPAY_SECRET_KEY does not match the configured Saaspay environment.",
    );
  }

  return Object.freeze({
    secretKey,
    webhookSecret: readRequired(
      "SAASPAY_WEBHOOK_SECRET",
      environment.SAASPAY_WEBHOOK_SECRET,
    ),
    pilotPhones: readPilotPhones(environment.SAASPAY_PILOT_PHONES),
  });
}
