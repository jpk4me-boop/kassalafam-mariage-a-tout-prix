import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Purge planifiée des données analytiques — GET /api/cron/purge-analytics.
 *
 * Rétention : événements 180 j, sessions inactives 90 j (fonction SQL
 * purge_expired_analytics ; member_activity n'est JAMAIS purgée — elle vit
 * avec le profil). Déclenchée par le Cron Vercel quotidien (vercel.json).
 *
 * Protection : exige `Authorization: Bearer ${CRON_SECRET}` — en-tête envoyé
 * automatiquement par Vercel Cron quand la variable CRON_SECRET est définie.
 * Sans CRON_SECRET configurée, la route REFUSE de purger (503) : jamais de
 * purge publiquement déclenchable.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("purge_expired_analytics");
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return NextResponse.json({
      ok: true,
      deleted_events: row?.deleted_events ?? 0,
      deleted_sessions: row?.deleted_sessions ?? 0,
    });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
