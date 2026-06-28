import { Check, X } from "lucide-react";

import type { ProfileVerificationStatus } from "@/lib/types/database";
import { AdminStatusBadge } from "@/components/admin/admin-status-badge";

export type AdminProfileRow = {
  id: string;
  first_name: string | null;
  verification_status: ProfileVerificationStatus;
  verification_rejection_reason: string | null;
  created_at: string;
  updated_at: string;
};

const DATE_FMT = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return DATE_FMT.format(new Date(iso));
}

/**
 * Boutons d'action de modération — DÉSACTIVÉS dans ce lot (L3-B1, lecture
 * seule). L'écriture (approbation / rejet) arrivera en L3-B2 via un chemin
 * serveur sécurisé (service_role). Aucune logique d'écriture ici.
 */
function DisabledActions() {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        disabled
        title="Approbation disponible en L3-B2"
        aria-label="Approuver (bientôt disponible)"
        className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-full border border-emerald-600/25 bg-emerald-600/5 px-3 py-1.5 text-xs font-semibold text-emerald-700/70 opacity-60"
      >
        <Check size={13} />
        Approuver
      </button>
      <button
        type="button"
        disabled
        title="Rejet disponible en L3-B2"
        aria-label="Rejeter (bientôt disponible)"
        className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-full border border-red-500/25 bg-red-500/5 px-3 py-1.5 text-xs font-semibold text-red-800/70 opacity-60"
      >
        <X size={13} />
        Rejeter
      </button>
    </div>
  );
}

export function ProfileVerificationList({
  rows,
  emailById,
}: {
  rows: AdminProfileRow[];
  emailById: Map<string, string>;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-champagne-500/25 bg-cream-100/40 px-6 py-12 text-center text-sm text-ink-700/60">
        Aucun profil pour ce filtre.
      </div>
    );
  }

  return (
    <>
      {/* Vue bureau : tableau */}
      <div className="hidden overflow-x-auto rounded-2xl border border-champagne-500/25 bg-cream-50/60 sm:block">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-champagne-500/25 text-xs uppercase tracking-wide text-ink-700/55">
              <th className="px-4 py-3 font-medium">Membre</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              <th className="px-4 py-3 font-medium">Créé le</th>
              <th className="px-4 py-3 font-medium">Mis à jour</th>
              <th className="px-4 py-3 font-medium">Motif de rejet</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-champagne-500/10 last:border-0 align-top"
              >
                <td className="px-4 py-3 font-medium text-choco-700">
                  {row.first_name?.trim() || (
                    <span className="text-ink-700/40">Sans prénom</span>
                  )}
                </td>
                <td className="px-4 py-3 text-ink-700/75">
                  {emailById.get(row.id) ?? (
                    <span className="text-ink-700/40">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <AdminStatusBadge status={row.verification_status} />
                </td>
                <td className="px-4 py-3 text-ink-700/70">
                  {formatDate(row.created_at)}
                </td>
                <td className="px-4 py-3 text-ink-700/70">
                  {formatDate(row.updated_at)}
                </td>
                <td className="px-4 py-3 text-ink-700/70">
                  {row.verification_status === "rejected" &&
                  row.verification_rejection_reason ? (
                    row.verification_rejection_reason
                  ) : (
                    <span className="text-ink-700/40">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <DisabledActions />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Vue mobile : cartes */}
      <ul className="flex flex-col gap-3 sm:hidden">
        {rows.map((row) => (
          <li
            key={row.id}
            className="rounded-2xl border border-champagne-500/25 bg-cream-50/60 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-choco-700">
                  {row.first_name?.trim() || (
                    <span className="text-ink-700/40">Sans prénom</span>
                  )}
                </p>
                <p className="truncate text-xs text-ink-700/70">
                  {emailById.get(row.id) ?? "—"}
                </p>
              </div>
              <AdminStatusBadge status={row.verification_status} />
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
              <dt className="text-ink-700/50">Créé le</dt>
              <dd className="text-right text-ink-700/75">
                {formatDate(row.created_at)}
              </dd>
              <dt className="text-ink-700/50">Mis à jour</dt>
              <dd className="text-right text-ink-700/75">
                {formatDate(row.updated_at)}
              </dd>
            </dl>

            {row.verification_status === "rejected" &&
            row.verification_rejection_reason ? (
              <p className="mt-3 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-800/90">
                Motif : {row.verification_rejection_reason}
              </p>
            ) : null}

            <div className="mt-3">
              <DisabledActions />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
