/**
 * Redirection interne SÛRE partagée par le Server Component d'onboarding et le
 * wizard client. N'accepte qu'un chemin interne relatif (anti open-redirect) et
 * jamais une route qui relancerait la boucle d'onboarding ou d'authentification.
 * Toute valeur suspecte retombe sur /dashboard.
 */
export function safeOnboardingRedirect(raw: string | undefined | null): string {
  if (
    !raw ||
    !raw.startsWith("/") ||
    raw.startsWith("//") ||
    raw.startsWith("/onboarding") ||
    raw.startsWith("/login") ||
    raw.startsWith("/register")
  ) {
    return "/dashboard";
  }
  return raw;
}
