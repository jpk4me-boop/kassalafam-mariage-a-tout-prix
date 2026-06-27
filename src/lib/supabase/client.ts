import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/lib/types/database";

/**
 * Client Supabase pour le navigateur (composants "use client").
 *
 * Utilise exclusivement les variables publiques :
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - NEXT_PUBLIC_SUPABASE_ANON_KEY
 *
 * Aucune clé `service_role` ne doit jamais être référencée côté front.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    // En l'absence de configuration (ex. build sans secrets), on évite de
    // casser le rendu : un placeholder valide est utilisé. Les appels réseau
    // n'ont lieu que dans des gestionnaires d'événements, jamais au rendu.
    if (typeof window !== "undefined") {
      console.warn(
        "[Supabase] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY manquantes.",
      );
    }
  }

  return createBrowserClient<Database>(
    url ?? "https://placeholder.supabase.co",
    anonKey ?? "placeholder-anon-key",
  );
}
