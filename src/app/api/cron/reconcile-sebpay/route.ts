import { NextResponse, type NextRequest } from "next/server";

import {
  VerifiedSebPayProvider,
  createSebPayProvider,
} from "@/lib/server/sebpay";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Réconciliation SebPay — GET /api/cron/reconcile-sebpay.
 *
 * Filet de secours du webhook (webhook perdu ou jamais délivré) : interroge
 * `GET /collections/{external_reference}` pour les transactions `sebpay`
 * encore `initiated`/`pending` et applique la MÊME RPC autoritative que le
 * webhook (`apply_sebpay_payment_update` — machine à états idempotente).
 *
 * Protection : `Authorization: Bearer ${CRON_SECRET}` (même patron que
 * purge-analytics). Sans CRON_SECRET, la route refuse (503).
 * Paiements désactivés (provider verrouillé) : no-op explicite — aucun
 * secret SebPay n'est lu, aucun appel réseau.
 *
 * Le montant transmis à la RPC est celui de NOTRE transaction : la
 * réconciliation interroge le fournisseur sur notre propre référence unique ;
 * le contrôle de cohérence montant/devise du webhook garde tout son sens
 * pour les payloads entrants, pas pour ce chemin sortant authentifié.
 */

const RECONCILE_BATCH_SIZE = 25;
const RECONCILE_MIN_AGE_MS = 10 * 60 * 1000;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let provider: ReturnType<typeof createSebPayProvider>;

  try {
    provider = createSebPayProvider();
  } catch {
    // Configuration invalide : fail-closed, sans détail.
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  if (!(provider instanceof VerifiedSebPayProvider)) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  try {
    const admin = createAdminClient();
    const cutoff = new Date(Date.now() - RECONCILE_MIN_AGE_MS).toISOString();

    const { data, error } = await admin
      .from("payment_transactions")
      .select("id, idempotency_key, amount_xaf, status")
      .eq("provider", "sebpay")
      .in("status", ["initiated", "pending"])
      .lt("requested_at", cutoff)
      .order("requested_at", { ascending: true })
      .limit(RECONCILE_BATCH_SIZE);

    if (error) {
      throw error;
    }

    let applied = 0;
    let failures = 0;

    for (const transaction of data ?? []) {
      try {
        const status = await provider.getCollectionStatus(
          transaction.idempotency_key,
        );

        const { error: rpcError } = await admin.rpc(
          "apply_sebpay_payment_update",
          {
            p_provider_reference: status.providerReference,
            p_external_reference: transaction.idempotency_key,
            p_raw_status: `reconciliation_${status.status}`,
            p_mapped_status: status.status,
            p_amount_xaf: transaction.amount_xaf,
            p_currency: "XAF",
          },
        );

        if (rpcError) {
          throw new Error("apply_sebpay_payment_update failed");
        }

        applied += 1;
      } catch {
        // Une transaction en échec n'interrompt pas le lot ; le prochain
        // passage du cron la reprendra.
        failures += 1;
      }
    }

    return NextResponse.json({
      ok: true,
      checked: data?.length ?? 0,
      applied,
      failures,
    });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
