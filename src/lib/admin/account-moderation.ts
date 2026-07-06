/**
 * L3G — Constantes & helpers PURS (client + serveur) pour la modération de
 * COMPTE (suspension / réactivation) depuis le back-office. Aucune écriture,
 * aucun secret, aucun accès DB : ces valeurs reflètent EXACTEMENT les règles de
 * la RPC transactionnelle `admin_set_account_status` (L3F-C3A). La base reste
 * l'autorité finale.
 */

import type { AccountStatus } from "@/lib/types/database";
import { BadgeCheck, Ban } from "lucide-react";

export { isUuid } from "@/lib/admin/safety-reports";

/** Bornes du motif — cohérentes avec le CHECK DB (btrim, 10..2000). */
export const SUSPENSION_REASON_MIN = 10;
export const SUSPENSION_REASON_MAX = 2000;

/** Motifs de suspension prédéfinis (l'admin en coche ≥ 1 ; composés par « ; »). */
export const SUSPENSION_REASONS = [
  "Comportement abusif ou harcèlement",
  "Contenu inapproprié ou choquant",
  "Arnaque ou tentative d’escroquerie",
  "Usurpation d’identité",
  "Propos haineux ou discriminatoires",
  "Menaces envers un autre membre",
  "Spam ou sollicitation commerciale",
  "Faux profil ou informations mensongères",
  "Multiples signalements concordants",
] as const;

/** Motifs de réactivation prédéfinis (motif OBLIGATOIRE aussi côté RPC). */
export const REACTIVATION_REASONS = [
  "Vérifications complémentaires favorables",
  "Suspension appliquée par erreur",
  "Engagement du membre à respecter les règles",
  "Signalement finalement classé sans suite",
  "Décision de modération révisée",
] as const;

/** Statut cible d'une action de compte. */
export type AccountTargetStatus = AccountStatus; // 'active' | 'suspended'

/** Libellés FR des statuts de compte (présentation seule). */
export const ACCOUNT_STATUS_LABELS: Record<AccountStatus, string> = {
  active: "Actif",
  suspended: "Suspendu",
};

/** Configuration de badge (libellé, icône, classes) par statut de compte. */
export const ACCOUNT_STATUS_BADGE: Record<
  AccountStatus,
  { label: string; Icon: typeof BadgeCheck; className: string }
> = {
  active: {
    label: "Actif",
    Icon: BadgeCheck,
    className: "border-emerald-600/30 bg-emerald-600/10 text-emerald-700",
  },
  suspended: {
    label: "Suspendu",
    Icon: Ban,
    className: "border-red-500/35 bg-red-500/10 text-red-800",
  },
};

/** Message FR générique (aucune erreur PostgreSQL brute exposée). */
export const ACCOUNT_ERROR_FALLBACK =
  "Une erreur est survenue pendant la mise à jour du compte.";

/**
 * Mapping des erreurs MÉTIER STABLES de `admin_set_account_status` vers des
 * messages FR. Toute autre erreur retombe sur ACCOUNT_ERROR_FALLBACK.
 */
export const ACCOUNT_ERROR_MESSAGES: Record<string, string> = {
  PROFILE_NOT_FOUND: "Ce profil n’existe plus.",
  ACCOUNT_STATUS_CONFLICT:
    "Ce compte a été modifié par un autre administrateur. La page va être actualisée.",
  INVALID_ACCOUNT_STATUS: "Ce statut de compte n’est pas valide.",
  INVALID_ACCOUNT_TRANSITION: "Cette transition de statut n’est pas autorisée.",
  REASON_REQUIRED: "Un motif est obligatoire.",
  REASON_LENGTH_INVALID:
    "Le motif doit contenir entre 10 et 2 000 caractères.",
  ACTOR_NOT_FOUND: "Le compte administrateur n’a pas pu être identifié.",
  REPORT_NOT_FOUND: "Le signalement associé n’existe plus.",
  REPORT_PROFILE_MISMATCH:
    "Le signalement ne concerne pas ce membre.",
};

/** Traduit un message d'exception plpgsql en message FR + code stable éventuel. */
export function mapAccountError(raw: string | null | undefined): {
  message: string;
  code?: string;
} {
  if (raw && raw in ACCOUNT_ERROR_MESSAGES) {
    return { message: ACCOUNT_ERROR_MESSAGES[raw], code: raw };
  }
  return { message: ACCOUNT_ERROR_FALLBACK };
}

/**
 * État de retour des Server Actions de compte (importable client + serveur ;
 * un fichier "use server" ne peut exporter que des fonctions async).
 */
export type AccountActionState =
  | { ok: true; message: string }
  | { ok: false; error: string; code?: string };
