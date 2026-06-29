/**
 * URL publique du site, utilisée pour construire les redirections d'auth
 * (ex. `emailRedirectTo` du lien de confirmation Supabase).
 *
 * Ordre de priorité :
 *   1. `NEXT_PUBLIC_SITE_URL` — variable PUBLIQUE (jamais un secret), à définir
 *      sur Vercel Production : https://kassalafam-mariage-a-tout-prix.vercel.app
 *      En build de production, cette valeur est figée : les liens pointeront
 *      toujours vers la prod, même si l'inscription part d'un autre contexte.
 *   2. `window.location.origin` — repli raisonnable côté navigateur en dev.
 *   3. `http://localhost:3000` — repli ultime (SSR/dev sans variable définie).
 *
 * Le `/` final éventuel est retiré pour permettre `${getSiteUrl()}/login`.
 */
export function getSiteUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");

  if (typeof window !== "undefined") return window.location.origin;

  return "http://localhost:3000";
}
