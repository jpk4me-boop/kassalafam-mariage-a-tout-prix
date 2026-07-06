"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

import {
  type AuditFilters as AuditFiltersType,
  AUDIT_SOURCE_FILTERS,
  AUDIT_PERIODS,
  type AuditPeriod,
  type AuditSourceFilter,
  isAuditPeriod,
  buildAuditQuery,
} from "@/lib/admin/audit";

/**
 * Filtres du journal d'administration (client). Purement URL : construit des
 * liens `/admin/audit?...` ; la page serveur relit les searchParams, refait la
 * lecture paginée EN BASE et applique les filtres. Aucun fetch ici. Tout
 * changement de filtre réinitialise la page à 1 (géré par buildAuditQuery).
 */
export function AuditFilters({
  filters,
  actors,
}: {
  filters: AuditFiltersType;
  actors: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function go(url: string) {
    startTransition(() => router.push(url));
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-champagne-500/25 bg-cream-50/50 p-4">
      {/* Type d'action */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[11px] uppercase tracking-wide text-ink-700/45">
          Type
        </span>
        {AUDIT_SOURCE_FILTERS.map((f) => {
          const active = filters.source === f.key;
          return (
            <Link
              key={f.key}
              href={buildAuditQuery(filters, {
                source: f.key as AuditSourceFilter,
              })}
              className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? "border-choco-600/30 bg-choco-600/10 text-choco-700"
                  : "border-champagne-500/30 bg-cream-100/50 text-ink-700/70 hover:text-choco-600"
              }`}
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-4 border-t border-champagne-500/15 pt-3">
        {/* Période */}
        <label className="inline-flex items-center gap-2 text-xs text-ink-700/60">
          Période
          <select
            value={filters.period}
            disabled={pending}
            onChange={(e) => {
              const v = e.target.value;
              go(
                buildAuditQuery(filters, {
                  period: (isAuditPeriod(v) ? v : "30d") as AuditPeriod,
                }),
              );
            }}
            className="rounded-full border border-champagne-500/30 bg-cream-50/80 px-3 py-1.5 text-xs text-ink-800 outline-none focus:border-champagne-500/50 focus:ring-2 focus:ring-champagne-500/20"
          >
            {AUDIT_PERIODS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        {/* Administrateur */}
        {actors.length > 0 ? (
          <label className="inline-flex items-center gap-2 text-xs text-ink-700/60">
            Administrateur
            <select
              value={filters.actor ?? ""}
              disabled={pending}
              onChange={(e) => {
                const v = e.target.value;
                go(buildAuditQuery(filters, { actor: v === "" ? null : v }));
              }}
              className="max-w-[220px] rounded-full border border-champagne-500/30 bg-cream-50/80 px-3 py-1.5 text-xs text-ink-800 outline-none focus:border-champagne-500/50 focus:ring-2 focus:ring-champagne-500/20"
            >
              <option value="">Tous</option>
              {actors.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {/* Membre ciblé (filtre issu d'une fiche) */}
        {filters.target ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-choco-600/30 bg-choco-600/10 px-3 py-1.5 text-xs font-medium text-choco-700">
            Membre ciblé
            <Link
              href={buildAuditQuery(filters, { target: null })}
              aria-label="Retirer le filtre membre"
              className="text-choco-700/70 hover:text-choco-700"
            >
              <X size={13} />
            </Link>
          </span>
        ) : null}
      </div>
    </div>
  );
}
