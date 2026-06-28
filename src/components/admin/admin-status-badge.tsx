import { BadgeCheck, Clock, Pause, TriangleAlert } from "lucide-react";

import type { ProfileVerificationStatus } from "@/lib/types/database";

/** Badge de statut côté back-office (libellés courts). Présentation seule. */
const CONFIG: Record<
  ProfileVerificationStatus,
  { label: string; Icon: typeof BadgeCheck; className: string }
> = {
  pending: {
    label: "En attente",
    Icon: Clock,
    className: "border-champagne-500/40 bg-champagne-400/15 text-choco-700",
  },
  approved: {
    label: "Approuvé",
    Icon: BadgeCheck,
    className: "border-emerald-600/30 bg-emerald-600/10 text-emerald-700",
  },
  rejected: {
    label: "Rejeté",
    Icon: TriangleAlert,
    className: "border-red-500/30 bg-red-500/10 text-red-800",
  },
  paused: {
    label: "En pause",
    Icon: Pause,
    className: "border-amber-500/40 bg-amber-400/15 text-amber-800",
  },
};

export function AdminStatusBadge({
  status,
}: {
  status: ProfileVerificationStatus;
}) {
  const { label, Icon, className } = CONFIG[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium ${className}`}
    >
      <Icon size={13} />
      {label}
    </span>
  );
}
