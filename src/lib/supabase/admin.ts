import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/types/database";

/**
 * Client Supabase ADMIN — SERVEUR UNIQUEMENT.
 *
 * Utilise `SUPABASE_SERVICE_ROLE_KEY` (jamais préfixée `NEXT_PUBLIC_`, donc
 * jamais incluse dans un bundle client). Ce client BYPASSE la RLS : il ne doit
 * être appelé que depuis un Server Component / Route Handler, APRÈS avoir
 * vérifié que l'appelant est bien administrateur (voir `isAdminUserId`).
 *
 * Ne JAMAIS importer ce module depuis un composant "use client".
 */
export function createAdminClient() {
  // Garde-fou défensif : empêche toute exécution accidentelle côté navigateur.
  if (typeof window !== "undefined") {
    throw new Error(
      "createAdminClient ne doit jamais être appelé côté client (service_role).",
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Env admin manquantes: NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis.",
    );
  }

  return createSupabaseClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
