import { NextResponse } from "next/server";

import {
  VerifiedSebPayProvider,
  createSebPayProvider,
} from "@/lib/server/sebpay";
import {
  SebPayCheckoutError,
  handleSebPayCheckout,
  toCheckoutErrorCode,
} from "@/lib/server/sebpay/checkout";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Souscription Premium via SebPay — POST /api/premium/subscribe.
 *
 * Chaîne complète dans `handleSebPayCheckout` (lib testable hors réseau) :
 * 503 paiements fermés (aucun secret lu), 400 payload invalide, 403 pilote
 * restreint / compte inéligible, 409 premium actif ou paiement en cours,
 * 502 fournisseur indisponible (transaction laissée `initiated`, dénouée par
 * webhook/réconciliation/auto-annulation), 200 {transactionId, paymentStatus}.
 * Le numéro du payeur transite une seule fois vers SebPay et n'est jamais
 * persisté par KASSALAFAM.
 */

function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return privateJson({ ok: false, code: "unauthenticated" }, 401);
  }

  let rawPayload: unknown = null;

  try {
    rawPayload = await request.json();
  } catch {
    rawPayload = null;
  }

  const admin = createAdminClient();

  const outcome = await handleSebPayCheckout({
    rawPayload,
    initiateTransaction: async ({ planCode }) => {
      const { data, error } = await admin.rpc(
        "initiate_sebpay_payment_transaction",
        {
          p_profile_id: user.id,
          p_plan_code: planCode,
        },
      );

      if (error) {
        throw new SebPayCheckoutError(toCheckoutErrorCode(error.message));
      }

      const row = Array.isArray(data) ? data[0] : data;

      if (!row) {
        throw new SebPayCheckoutError("UNKNOWN");
      }

      return {
        transactionId: row.transaction_id,
        idempotencyKey: row.idempotency_key,
        amountXaf: row.amount_xaf,
      };
    },
    initiateCollection: async (input) => {
      const provider = createSebPayProvider();

      if (!(provider instanceof VerifiedSebPayProvider)) {
        // Injoignable en pratique : handleSebPayCheckout a déjà rendu 503
        // lorsque les paiements sont fermés.
        throw new Error("SebPay provider is locked.");
      }

      return provider.initiateCollection(input);
    },
    applyUpdate: async (input) => {
      const { error } = await admin.rpc("apply_sebpay_payment_update", {
        p_provider_reference: input.providerReference,
        p_external_reference: input.externalReference,
        p_raw_status: input.rawStatus,
        p_mapped_status: input.mappedStatus,
        p_amount_xaf: input.amountXaf,
        p_currency: input.currency,
      });

      if (error) {
        // Jamais de détail fournisseur ni de payload dans les journaux.
        throw new Error("apply_sebpay_payment_update failed");
      }
    },
  });

  return privateJson(outcome.body, outcome.status);
}
