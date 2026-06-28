import type { ProfileVerificationStatus } from "@/lib/types/database";
import { AdminStatusBadge } from "@/components/admin/admin-status-badge";
import { ProfileActions } from "@/components/admin/profile-actions";

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

/** Le motif administratif (colonne verification_rejection_reason) n'a de sens
 *  que pour les statuts rejected et paused. */
function hasMotif(status: ProfileVerificationStatus): boolean {
  return status === "rejected" || status === "paused";
}

function motifLabel(status: ProfileVerificationStatus): string {
  return status === "paused" ? "Motif de pause" : "Motif de rejet";
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
              <th className="px-4 py-3 font-medium">Motif</th>
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
                  {hasMotif(row.verification_status) &&
                  row.verification_rejection_reason ? (
                    <span>
                      <span className="text-ink-700/45">
                        {motifLabel(row.verification_status)} :{" "}
                      </span>
                      {row.verification_rejection_reason}
                    </span>
                  ) : (
                    <span className="text-ink-700/40">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <ProfileActions
                    profileId={row.id}
                    status={row.verification_status}
                  />
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

            {hasMotif(row.verification_status) &&
            row.verification_rejection_reason ? (
              <p
                className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
                  row.verification_status === "paused"
                    ? "border-amber-500/25 bg-amber-400/5 text-amber-800/90"
                    : "border-red-500/20 bg-red-500/5 text-red-800/90"
                }`}
              >
                {motifLabel(row.verification_status)} :{" "}
                {row.verification_rejection_reason}
              </p>
            ) : null}

            <div className="mt-3">
              <ProfileActions
                profileId={row.id}
                status={row.verification_status}
              />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
