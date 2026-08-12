import "server-only";

import { PaymentFoundationError } from "./foundation-core.ts";

/**
 * Journalisation des échecs SebPay — Lot J.
 *
 * Constat à l'origine du lot : le 12/08/2026, un paiement pilote a échoué en
 * 502 « provider_unavailable ». Aucun journal, aucun statut, aucune cause. Le
 * `catch` de la chaîne d'encaissement avalait l'erreur, et le transport avait
 * déjà jeté le statut HTTP du fournisseur. Impossible de distinguer des clés
 * refusées d'une allowlist IP ou d'une panne — trois corrections radicalement
 * différentes derrière un seul message.
 *
 * CE QUI EST ÉCRIT : l'étape, le code d'erreur interne, le statut HTTP du
 * fournisseur. Rien d'autre.
 *
 * CE QUI NE L'EST JAMAIS : le corps de la réponse, les en-têtes (ils portent
 * les clés), le numéro du payeur, la référence de transaction, le montant.
 * L'invariant de la fondation — aucun secret, aucune donnée de membre dans les
 * journaux — n'est pas assoupli : il est simplement complété par la seule
 * information qui manquait pour diagnostiquer.
 *
 * Lecture des valeurs :
 *   401 → clés refusées par SebPay ;
 *   403 → requête bloquée en amont (allowlist IP) ;
 *   404 → référence inconnue du fournisseur ;
 *   5xx → panne côté SebPay ;
 *   `none` → l'échec précède la réponse : délai dépassé, origine refusée,
 *            réponse non-JSON, ou garde de configuration.
 */
export function logSebPayFailure(stage: string, error: unknown): void {
  const known = error instanceof PaymentFoundationError;
  const code = known ? error.code : "UNKNOWN";
  const status = known && error.httpStatus !== null ? error.httpStatus : "none";

  console.error(
    `[sebpay] ${stage} failed code=${code} providerHttpStatus=${status}`,
  );
}
