import { BadgeCheck, Clock, TriangleAlert } from "lucide-react";

import type { ProfileVerificationStatus } from "@/lib/types/database";

/**
 * Badge de statut de vérification — LECTURE SEULE.
 *
 * Le statut est décidé par le back-office admin et verrouillé en base
 * (trigger trg_profiles_guard_verification). Le membre ne peut jamais le
 * modifier : ce composant n'est qu'un affichage.
 */

type StatusConfig = {
  label: string;
  Icon: typeof BadgeCheck;
  className: string;
};

const STATUS_CONFIG: Record<ProfileVerificationStatus, StatusConfig> = {
  pending: {
    label: "En attente de vérification",
    Icon: Clock,
    className: "border-champagne-500/40 bg-champagne-400/15 text-choco-700",
  },
  approved: {
    label: "Profil vérifié",
    Icon: BadgeCheck,
    className: "border-emerald-600/30 bg-emerald-600/10 text-emerald-700",
  },
  rejected: {
    label: "Profil à corriger",
    Icon: TriangleAlert,
    className: "border-red-500/30 bg-red-500/10 text-red-800",
  },
};

export function VerificationBadge({
  status,
}: {
  status: ProfileVerificationStatus;
}) {
  const { label, Icon, className } = STATUS_CONFIG[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${className}`}
    >
      <Icon size={14} />
      {label}
    </span>
  );
}
