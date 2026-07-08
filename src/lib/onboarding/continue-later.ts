/**
 * Échappatoire « Continuer plus tard » du wizard d'onboarding.
 *
 * Cookie de SESSION (sans expiration) posé par le wizard au clic et lu par le
 * middleware : tant qu'il est présent ET qu'il correspond au compte connecté,
 * la garde de complétude profil ne renvoie plus le membre vers /onboarding —
 * la question d'acquisition (write-once) reste, elle, toujours bloquante.
 *
 * Choix d'UX, PAS un mécanisme de sécurité :
 *   - valeur = empreinte SHA-256 (hex) de l'id du compte — le cookie ne
 *     contient aucune donnée personnelle en clair et ne peut pas bénéficier à
 *     un AUTRE compte utilisant le même navigateur (le middleware compare
 *     l'empreinte au compte de la session courante) ;
 *   - temporaire : il disparaît à la fermeture du navigateur (le rappel du
 *     parcours se réapplique à la session suivante) ;
 *   - supprimé explicitement à la fin du wizard et à la déconnexion.
 */
export const CONTINUE_LATER_COOKIE = "kf_onboarding_continue_later";

/** Empreinte SHA-256 hex de l'id utilisateur — partagée client/middleware
 *  (Web Crypto, disponible dans le navigateur comme dans le runtime edge). */
export async function continueLaterCookieValue(userId: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(userId),
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

/** Pose le cookie côté client, lié au compte courant (aucune écriture base). */
export async function setContinueLaterCookie(userId: string): Promise<void> {
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${CONTINUE_LATER_COOKIE}=${await continueLaterCookieValue(
    userId,
  )}; path=/; samesite=lax${secure}`;
}

/** Supprime le cookie (fin de wizard, déconnexion). Sans effet s'il est absent. */
export function clearContinueLaterCookie(): void {
  document.cookie = `${CONTINUE_LATER_COOKIE}=; path=/; max-age=0; samesite=lax`;
}
