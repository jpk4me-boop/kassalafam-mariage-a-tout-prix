import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Statut d'une transaction SebPay du membre connecté —
 * GET /api/premium/transactions/[transactionId].
 *
 * Polling du parcours de souscription. S'appuie sur la RPC
 * `get_my_sebpay_transaction` (authenticated) : identité via auth.uid()
 * côté serveur, uniquement les transactions du membre, aucune donnée
 * fournisseur ni numéro de téléphone exposés.
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ transactionId: string }> },
) {
  const { transactionId } = await params;

  if (!UUID_PATTERN.test(transactionId)) {
    return privateJson({ ok: false, code: "invalid_request" }, 400);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return privateJson({ ok: false, code: "unauthenticated" }, 401);
  }

  const { data, error } = await supabase.rpc("get_my_sebpay_transaction", {
    p_transaction_id: transactionId,
  });

  if (error) {
    if (error.message.includes("PAYMENT_TRANSACTION_NOT_FOUND")) {
      return privateJson({ ok: false, code: "not_found" }, 404);
    }

    return privateJson({ ok: false, code: "internal_error" }, 500);
  }

  const row = Array.isArray(data) ? data[0] : data;

  if (!row) {
    return privateJson({ ok: false, code: "not_found" }, 404);
  }

  return privateJson({
    ok: true,
    paymentStatus: row.status,
    failureCode: row.failure_code,
    subscriptionId: row.subscription_id,
  });
}
