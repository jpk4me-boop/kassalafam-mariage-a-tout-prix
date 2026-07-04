import { BadgeCheck, Ban } from "lucide-react";

import type { AccountStatus } from "@/lib/types/database";
import { ACCOUNT_STATUS_LABELS } from "@/lib/admin/account-moderation";

/**
 * Badge de statut de COMPTE côté back-office (L3F-C3B). Présentation seule.
 * `Actif` : ton vert rassurant. `Suspendu` : alerte ambre MAÎTRISÉE (pas de
 * rouge agressif), cohérente avec le reste du back-office.
 */
const CONFIG: Record<
  AccountStatus,
  { Icon: typeof BadgeCheck; className: string }
> = {
  active: {
    Icon: BadgeCheck,
    className: "border-emerald-600/30 bg-emerald-600/10 text-emerald-700",
  },
  suspended: {
    Icon: Ban,
    className: "border-amber-500/40 bg-amber-400/15 text-amber-800",
  },
};

export function AccountStatusBadge({ status }: { status: AccountStatus }) {
  const { Icon, className } = CONFIG[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium ${className}`}
    >
      <Icon size={13} />
      {ACCOUNT_STATUS_LABELS[status]}
    </span>
  );
}
