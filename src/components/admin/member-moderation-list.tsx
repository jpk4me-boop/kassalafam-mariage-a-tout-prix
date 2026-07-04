"use client";

import { useMemo, useState } from "react";
import { Search, Users, X } from "lucide-react";

import type { AccountStatus } from "@/lib/types/database";
import {
  ACCOUNT_MODERATION_FILTERS,
  ACCOUNT_STATUS_LABELS,
  type AccountFilterKey,
} from "@/lib/admin/account-moderation";
import { AccountStatusBadge } from "@/components/admin/account-status-badge";
import { MemberModerationActions } from "@/components/admin/member-moderation-actions";

/**
 * Ligne membre exposée au navigateur (L3F-C3B). Objets PLATS uniquement : la
 * jointure email est faite côté serveur avant sérialisation. On n'expose ni
 * `suspended_by` (UUID admin interne) ni aucune donnée technique sensible.
 */
export type AdminMemberRow = {
  id: string;
  first_name: string | null;
  email: string | null;
  account_status: AccountStatus;
  suspension_reason: string | null;
  // Dates DÉJÀ FORMATÉES côté serveur (fuseau métier Africa/Douala). Aucun
  // formatage de date n'est fait ici : un rendu dépendant du fuseau du
  // navigateur pendant l'hydratation provoquerait un mismatch (React #418).
  createdAtLabel: string;
  suspendedAtLabel: string | null;
};

function memberLabel(row: AdminMemberRow): string {
  return row.first_name?.trim() || row.email?.trim() || "ce membre";
}

/** Bloc « suspension » (date + motif) réutilisé desktop/mobile. */
function SuspensionDetail({ row }: { row: AdminMemberRow }) {
  if (row.account_status !== "suspended") {
    return <span className="text-ink-700/40">—</span>;
  }
  return (
    <div className="text-xs">
      <p className="text-ink-700/70">
        <span className="text-ink-700/45">Depuis&nbsp;: </span>
        {row.suspendedAtLabel ?? "—"}
      </p>
      {row.suspension_reason ? (
        <p className="mt-0.5 whitespace-pre-wrap break-words text-ink-700/75">
          <span className="text-ink-700/45">Motif&nbsp;: </span>
          {row.suspension_reason}
        </p>
      ) : null}
    </div>
  );
}

export function MemberModerationList({
  rows,
  currentAdminId,
}: {
  rows: AdminMemberRow[];
  currentAdminId: string;
}) {
  const [filter, setFilter] = useState<AccountFilterKey>("all");
  const [query, setQuery] = useState("");

  const counts = useMemo(
    () => ({
      all: rows.length,
      active: rows.filter((r) => r.account_status === "active").length,
      suspended: rows.filter((r) => r.account_status === "suspended").length,
    }),
    [rows],
  );

  const trimmedQuery = query.trim().toLowerCase();

  const visibleRows = useMemo(() => {
    const byStatus =
      filter === "all"
        ? rows
        : rows.filter((r) => r.account_status === filter);
    if (!trimmedQuery) return byStatus;
    return byStatus.filter((r) => {
      const name = r.first_name?.toLowerCase() ?? "";
      const email = r.email?.toLowerCase() ?? "";
      return name.includes(trimmedQuery) || email.includes(trimmedQuery);
    });
  }, [rows, filter, trimmedQuery]);

  // Liste totalement vide (aucun membre en base) : état distinct du « aucun
  // résultat » (filtre/recherche trop restrictifs).
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-champagne-500/25 bg-cream-100/40 px-6 py-12 text-center">
        <Users size={22} className="text-ink-700/40" />
        <p className="text-sm text-ink-700/60">Aucun membre pour le moment.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Recherche */}
      <div className="relative">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-700/40"
        />
        <input
          type="search"
          inputMode="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher par prénom ou email…"
          aria-label="Rechercher un membre par prénom ou email"
          className="w-full rounded-full border border-champagne-500/30 bg-cream-50/70 py-2.5 pl-10 pr-10 text-sm text-ink-800 outline-none transition-colors focus:border-choco-500/50 focus:ring-2 focus:ring-choco-500/20"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Effacer la recherche"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-ink-700/50 transition-colors hover:text-choco-600"
          >
            <X size={15} />
          </button>
        ) : null}
      </div>

      {/* Filtres par statut */}
      <nav className="flex flex-wrap gap-2">
        {ACCOUNT_MODERATION_FILTERS.map((f) => {
          const isActive = f.key === filter;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              aria-pressed={isActive}
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "border-choco-600/30 bg-choco-600/10 text-choco-700"
                  : "border-champagne-500/30 bg-cream-100/50 text-ink-700/70 hover:text-choco-600"
              }`}
            >
              {f.label}
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${
                  isActive
                    ? "bg-choco-600/15 text-choco-700"
                    : "bg-champagne-400/20 text-ink-700/60"
                }`}
              >
                {counts[f.key]}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Aucun résultat (la liste n'est pas vide, mais filtre/recherche ne
          renvoient rien) : deux messages distincts. */}
      {visibleRows.length === 0 ? (
        <div className="rounded-2xl border border-champagne-500/25 bg-cream-100/40 px-6 py-12 text-center text-sm text-ink-700/60">
          {trimmedQuery
            ? "Aucun membre ne correspond à votre recherche."
            : "Aucun membre pour ce filtre."}
        </div>
      ) : (
        <>
          {/* Vue bureau : tableau */}
          <div className="hidden overflow-x-auto rounded-2xl border border-champagne-500/25 bg-cream-50/60 sm:block">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-champagne-500/25 text-xs uppercase tracking-wide text-ink-700/55">
                  <th className="px-4 py-3 font-medium">Membre</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Statut</th>
                  <th className="px-4 py-3 font-medium">Inscrit le</th>
                  <th className="px-4 py-3 font-medium">Suspension</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-champagne-500/10 align-top last:border-0"
                  >
                    <td className="px-4 py-3 font-medium text-choco-700">
                      {row.first_name?.trim() || (
                        <span className="text-ink-700/40">Sans prénom</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink-700/75">
                      {row.email ?? <span className="text-ink-700/40">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <AccountStatusBadge status={row.account_status} />
                    </td>
                    <td className="px-4 py-3 text-ink-700/70">
                      {row.createdAtLabel}
                    </td>
                    <td className="px-4 py-3">
                      <SuspensionDetail row={row} />
                    </td>
                    <td className="px-4 py-3">
                      <MemberModerationActions
                        profileId={row.id}
                        currentStatus={row.account_status}
                        memberLabel={memberLabel(row)}
                        isSelf={row.id === currentAdminId}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Vue mobile : cartes */}
          <ul className="flex flex-col gap-3 sm:hidden">
            {visibleRows.map((row) => (
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
                      {row.email ?? "—"}
                    </p>
                  </div>
                  <AccountStatusBadge status={row.account_status} />
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                  <dt className="text-ink-700/50">Inscrit le</dt>
                  <dd className="text-right text-ink-700/75">
                    {row.createdAtLabel}
                  </dd>
                </dl>

                {row.account_status === "suspended" ? (
                  <div className="mt-3 rounded-lg border border-amber-500/25 bg-amber-400/5 px-3 py-2 text-amber-800/90">
                    <SuspensionDetail row={row} />
                  </div>
                ) : null}

                <div className="mt-3">
                  <MemberModerationActions
                    profileId={row.id}
                    currentStatus={row.account_status}
                    memberLabel={memberLabel(row)}
                    isSelf={row.id === currentAdminId}
                  />
                </div>
              </li>
            ))}
          </ul>

          <p className="text-xs text-ink-700/50">
            {visibleRows.length}{" "}
            {visibleRows.length > 1 ? "membres affichés" : "membre affiché"}
            {filter !== "all"
              ? ` · filtre : ${ACCOUNT_STATUS_LABELS[filter]}`
              : ""}
            {trimmedQuery ? ` · recherche : « ${query.trim()} »` : ""}
          </p>
        </>
      )}
    </div>
  );
}
