import { getSiteUrl } from "@/lib/site-url";

/**
 * Base d'URL pour une redirection d'authentification INITIÉE CÔTÉ NAVIGATEUR
 * (ex. lien de réinitialisation de mot de passe envoyé par email).
 *
 * Contrairement à `getSiteUrl()` — figé sur `NEXT_PUBLIC_SITE_URL` dès le build
 * de production, donc identique en Preview et en Production — on privilégie ici
 * l'ORIGINE RÉELLEMENT VISITÉE (`window.location.origin`). Ainsi :
 *   - navigateur Preview   → l'origine de la Preview courante ;
 *   - navigateur Production → https://kassalafam.com (le domaine visité) ;
 *   - local                → http://localhost:3000.
 *
 * Repli `getSiteUrl()` uniquement hors navigateur (SSR), cas qui ne devrait pas
 * survenir pour un flux déclenché dans un gestionnaire d'évènement client.
 *
 * N'affecte PAS les redirections d'inscription existantes (qui continuent
 * d'utiliser `getSiteUrl()`).
 */
export function browserAuthRedirectUrl(path: string): string {
  const base =
    typeof window !== "undefined" ? window.location.origin : getSiteUrl();
  return `${base}${path}`;
}
