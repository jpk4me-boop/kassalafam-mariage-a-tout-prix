import { NextResponse } from "next/server";

import {
  SAASPAY_SIGNATURE_HEADER,
  SAASPAY_TIMESTAMP_HEADER,
  handleSaaspayWebhook,
} from "@/lib/server/saaspay/webhook";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Webhook Saaspay — POST /api/webhooks/saaspay.
 *
 * Chaîne dans `handleSaaspayWebhook` : paiements désactivés → 503 sans
 * lecture de secret ; signature `X-Webhook-Signature` + horodatage → 401 ;
 * charge utile hors contrat → 400 ; persistance via la RPC autoritative
 * `apply_saaspay_payment_update` (journal idempotent, états terminaux
 * immuables, activation Premium par `premium_subscriptions`). Toute erreur de
 * persistance rend 500 pour que Saaspay rejoue.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();

  const outcome = await handleSaaspayWebhook({
    rawBody,
    signatureHeader: request.headers.get(SAASPAY_SIGNATURE_HEADER),
    timestampHeader: request.headers.get(SAASPAY_TIMESTAMP_HEADER),
    applyUpdate: async (event) => {
      const admin = createAdminClient();
      const { data, error } = await admin.rpc("apply_saaspay_payment_update", {
        p_provider_reference: event.providerReference,
        p_raw_status: event.rawStatus,
        p_mapped_status: event.mappedStatus,
        p_amount_xaf: event.amountXaf,
        p_currency: event.currency,
      });

      if (error) {
        // Jamais de détail fournisseur ni de payload dans les journaux.
        throw new Error("apply_saaspay_payment_update failed");
      }

      const row = Array.isArray(data) ? data[0] : data;

      return { processingResult: row?.processing_result ?? "unknown" };
    },
  });

  return NextResponse.json(outcome.body, { status: outcome.status });
}
