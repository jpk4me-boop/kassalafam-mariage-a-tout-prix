/**
 * Présence & dates relatives — helpers PURS (client + serveur, zéro accès DB).
 *
 * « En ligne » = dernière activité reçue il y a moins de 2 minutes
 * (ONLINE_THRESHOLD_SECONDS, miroir du seuil SQL). La dernière activité vient
 * TOUJOURS de member_activity.last_seen_at (heartbeat), jamais de
 * profiles.updated_at.
 */

// Module AUTONOME (aucun import) : chargeable tel quel par node:test.
/** « En ligne » = activité reçue il y a moins de 2 minutes (miroir SQL). */
export const ONLINE_THRESHOLD_SECONDS = 120;

export type PresenceInfo = {
  /** Libellé compact : « En ligne », « Actif il y a 5 min », « Jamais vu »… */
  label: string;
  online: boolean;
  /** Horodatage absolu (pour `title`), null si jamais vu. */
  absolute: string | null;
};

const ABSOLUTE_FMT = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function presenceInfo(
  lastSeenIso: string | null | undefined,
  now: Date,
): PresenceInfo {
  if (!lastSeenIso) {
    return { label: "Jamais vu", online: false, absolute: null };
  }
  const seen = new Date(lastSeenIso);
  if (Number.isNaN(seen.getTime())) {
    return { label: "Jamais vu", online: false, absolute: null };
  }

  const absolute = ABSOLUTE_FMT.format(seen);
  const diffS = Math.max(0, Math.floor((now.getTime() - seen.getTime()) / 1000));

  if (diffS < ONLINE_THRESHOLD_SECONDS) {
    return { label: "En ligne", online: true, absolute };
  }
  if (diffS < 3600) {
    return {
      label: `Actif il y a ${Math.max(1, Math.floor(diffS / 60))} min`,
      online: false,
      absolute,
    };
  }
  if (diffS < 24 * 3600) {
    return {
      label: `Actif il y a ${Math.floor(diffS / 3600)} h`,
      online: false,
      absolute,
    };
  }
  if (diffS < 48 * 3600) {
    return { label: "Actif hier", online: false, absolute };
  }
  return {
    label: `Actif il y a ${Math.floor(diffS / 86400)} j`,
    online: false,
    absolute,
  };
}
