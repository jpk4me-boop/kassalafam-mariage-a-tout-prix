import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isAnalyticsEventType,
  normalizePath,
  extractUtmParams,
  referrerDomain,
} from "@/lib/analytics/path-normalization";

/**
 * Ingestion analytique FIRST-PARTY — POST /api/analytics/collect.
 *
 * Confidentialité :
 *  - AUCUNE IP ni User-Agent lus ou stockés ; aucun champ du body n'est
 *    conservé tel quel : le chemin est RE-normalisé serveur, les UTM filtrés
 *    par allowlist, le référent réduit à son hostname ;
 *  - le profil vient EXCLUSIVEMENT de la session Supabase serveur (cookies),
 *    jamais du body ;
 *  - cookie de session TECHNIQUE first-party (UUID aléatoire, HttpOnly,
 *    SameSite=Lax, Secure en production) — aucun identifiant publicitaire ;
 *  - réponses : 204 en succès, erreurs GÉNÉRIQUES sans identifiant interne.
 *
 * Limites : body ≤ 2 048 octets, cadence ≥ 5 s par session et par instance
 * (garde-fou mémoire best-effort — la vraie protection est l'anti-doublon SQL).
 */

const SESSION_COOKIE = "ka_sid";
const COOKIE_MAX_AGE_S = 90 * 24 * 60 * 60; // aligné sur la rétention (90 j)
const MAX_BODY_BYTES = 2048;
const MIN_INTERVAL_MS = 5_000;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Garde-fou de cadence par instance serveur (best-effort, jamais persisté).
const lastSeenBySession = new Map<string, number>();

function tooFrequent(sessionId: string): boolean {
  const now = Date.now();
  const last = lastSeenBySession.get(sessionId);
  if (lastSeenBySession.size > 5_000) lastSeenBySession.clear();
  lastSeenBySession.set(sessionId, now);
  return last !== undefined && now - last < MIN_INTERVAL_MS;
}

type CollectBody = {
  type?: unknown;
  path?: unknown;
  referrer?: unknown;
  search?: unknown;
};

export async function POST(request: NextRequest) {
  // 1. Body borné et parsé sans jamais relayer son contenu en cas d'erreur.
  let body: CollectBody;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      return NextResponse.json({ ok: false }, { status: 413 });
    }
    body = JSON.parse(raw) as CollectBody;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const type =
    typeof body.type === "string" && body.type === "heartbeat"
      ? "heartbeat"
      : typeof body.type === "string" && isAnalyticsEventType(body.type)
        ? body.type
        : null;
  if (!type) return NextResponse.json({ ok: false }, { status: 400 });

  // 2. RE-normalisation serveur : jamais de confiance au chemin du client.
  const pathGroup =
    typeof body.path === "string" ? normalizePath(body.path) : null;
  if (!pathGroup) return NextResponse.json({ ok: false }, { status: 400 });

  const utm = extractUtmParams(typeof body.search === "string" ? body.search : "");
  const refDomain = referrerDomain(
    typeof body.referrer === "string" ? body.referrer : "",
    request.nextUrl.hostname,
  );

  // 3. Session TECHNIQUE first-party (cookie HttpOnly, UUID aléatoire).
  const existing = request.cookies.get(SESSION_COOKIE)?.value;
  const sessionId =
    existing && UUID_RE.test(existing) ? existing : randomUUID();

  if (tooFrequent(sessionId)) {
    // Trop rapproché : on répond succès sans écrire (pas d'oracle de cadence).
    return finalize(new NextResponse(null, { status: 204 }), sessionId, existing);
  }

  // 4. Profil : UNIQUEMENT depuis la session Supabase serveur (cookies).
  let profileId: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    profileId = user?.id ?? null;
  } catch {
    profileId = null;
  }

  // 5. Écritures via les fonctions SQL dédiées (service_role, serveur).
  try {
    const admin = createAdminClient();

    const { error: sessionError } = await admin.rpc("analytics_upsert_session", {
      p_session_id: sessionId,
      p_profile_id: profileId,
      p_path_group: pathGroup,
      p_referrer_domain: refDomain,
      p_utm_source: utm.utm_source ?? null,
      p_utm_medium: utm.utm_medium ?? null,
      p_utm_campaign: utm.utm_campaign ?? null,
      p_utm_content: utm.utm_content ?? null,
      p_utm_term: utm.utm_term ?? null,
    });
    if (sessionError) throw sessionError;

    if (profileId) {
      const { error: touchError } = await admin.rpc(
        "analytics_touch_member_activity",
        { p_profile_id: profileId, p_path_group: pathGroup },
      );
      if (touchError) throw touchError;
    }

    if (type !== "heartbeat") {
      const { error: eventError } = await admin.rpc("analytics_record_event", {
        p_session_id: sessionId,
        p_profile_id: profileId,
        p_event_type: type,
        p_path_group: pathGroup,
        p_metadata: {},
      });
      if (eventError) throw eventError;
    }
  } catch {
    // Erreur générique : aucun détail d'infrastructure ni identifiant interne.
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return finalize(new NextResponse(null, { status: 204 }), sessionId, existing);
}

/** Pose (ou renouvelle) le cookie de session technique sur la réponse. */
function finalize(
  response: NextResponse,
  sessionId: string,
  existing: string | undefined,
): NextResponse {
  if (existing !== sessionId || existing === undefined) {
    response.cookies.set(SESSION_COOKIE, sessionId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: COOKIE_MAX_AGE_S,
    });
  }
  return response;
}
