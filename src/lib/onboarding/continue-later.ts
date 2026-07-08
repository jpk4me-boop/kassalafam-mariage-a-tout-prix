/**
 * Échappatoire « Continuer plus tard » du wizard d'onboarding.
 *
 * Cookie de SESSION (sans expiration) posé par le wizard au clic et lu par le
 * middleware : tant qu'il est présent, la garde de complétude profil ne renvoie
 * plus le membre vers /onboarding — la question d'acquisition (write-once)
 * reste, elle, toujours bloquante. Le cookie disparaît à la fermeture du
 * navigateur : le rappel du parcours se réapplique à la session suivante.
 */
export const CONTINUE_LATER_COOKIE = "kf_onboarding_continue_later";

/** Pose le cookie côté client (aucune écriture base, aucune RPC). */
export function setContinueLaterCookie(): void {
  document.cookie = `${CONTINUE_LATER_COOKIE}=1; path=/; samesite=lax`;
}
