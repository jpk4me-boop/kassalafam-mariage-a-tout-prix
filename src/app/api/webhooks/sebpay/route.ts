import { NextResponse } from "next/server";

import {
  SEBPAY_SIGNATURE_HEADER,
  handleSebPayWebhook,
} from "@/lib/server/sebpay/webhook";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Webhook SebPay — POST /api/webhooks/sebpay.
 *
 * Chaîne complète dans `handleSebPayWebhook` (lib testable hors réseau) :
 * paiements désactivés → 503 sans lecture de secret ; signature
 * `X-SebPay-Signature` (HMAC-SHA256 du body brut, temps constant) → 401 ;
 * payload hors contrat → 400 ; persistance via la RPC autoritative
 * `apply_sebpay_payment_update` (journal idempotent, états terminaux
 * immuables, activation Premium par `premium_subscriptions` — jamais
 * `is_premium` direct). Réponse 200 en un aller-retour SQL, largement sous
 * les 5 s exigées ; toute erreur de persistance rend 500 pour que SebPay
 * rejoue (rejeux absorbés par le journal).
 */
export async function POST(request: Request) {
  const rawBody = await request.text();

  const outcome = await handleSebPayWebhook({
    rawBody,
    signatureHeader: request.headers.get(SEBPAY_SIGNATURE_HEADER),
    applyUpdate: async (event) => {
      const admin = createAdminClient();
      const { data, error } = await admin.rpc("apply_sebpay_payment_update", {
        p_provider_reference: event.providerReference,
        p_external_reference: event.externalReference,
        p_raw_status: event.rawStatus,
        p_mapped_status: event.mappedStatus,
        p_amount_xaf: event.amountXaf,
        p_currency: event.currency,
      });

      if (error) {
        // Jamais de détail fournisseur ni de payload dans les journaux.
        throw new Error("apply_sebpay_payment_update failed");
      }

      const row = Array.isArray(data) ? data[0] : data;

      return { processingResult: row?.processing_result ?? "unknown" };
    },
  });

  return NextResponse.json(outcome.body, { status: outcome.status });
}
