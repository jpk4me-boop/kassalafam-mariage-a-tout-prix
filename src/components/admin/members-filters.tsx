"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, SlidersHorizontal, X, Loader2 } from "lucide-react";

import {
  type MembersFilters,
  ACCOUNT_FILTERS,
  VERIFICATION_FILTERS,
  COMPLETENESS_FILTERS,
  PHOTO_FILTERS,
  MEMBER_SORTS,
  buildMembersQuery,
  toggleMemberFilterQuery,
  hasActiveMemberFilters,
  isMemberSort,
} from "@/lib/admin/members";

/**
 * Barre de filtres de la liste des membres (client). Ne fait AUCUN fetch : elle
 * ne construit que des URLs `/admin/members?...` (source de vérité = la page
 * serveur qui relit les searchParams). La recherche + pays/ville sont soumis par
 * formulaire ; les statuts/complétude/photo sont des « chips » bascule ; le tri
 * est un select. La pagination réelle est gérée côté serveur.
 */
export function MembersFilters({ filters }: { filters: MembersFilters }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [search, setSearch] = useState(filters.search);
  const [country, setCountry] = useState(filters.country ?? "");
  const [city, setCity] = useState(filters.city ?? "");

  function go(url: string) {
    startTransition(() => router.push(url));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    go(
      buildMembersQuery(filters, {
        search: search.trim(),
        country: country.trim() || null,
        city: city.trim() || null,
        page: 1,
      }),
    );
  }

  function chipClass(active: boolean): string {
    return `inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
      active
        ? "border-choco-600/30 bg-choco-600/10 text-choco-700"
        : "border-champagne-500/30 bg-cream-100/50 text-ink-700/70 hover:text-choco-600"
    }`;
  }

  const anyActive = hasActiveMemberFilters(filters);

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-champagne-500/25 bg-cream-50/50 p-4">
      {/* Recherche + localisation + tri */}
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="relative sm:col-span-2">
            <span className="sr-only">Rechercher un membre</span>
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-700/40"
              aria-hidden
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Prénom, email, ville ou pays…"
              className="w-full rounded-full border border-champagne-500/30 bg-cream-50/80 py-2 pl-9 pr-3 text-sm text-ink-800 outline-none focus:border-champagne-500/50 focus:ring-2 focus:ring-champagne-500/20"
            />
          </label>
          <label className="flex flex-col">
            <span className="sr-only">Pays</span>
            <input
              type="text"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="Pays (exact)"
              className="w-full rounded-full border border-champagne-500/30 bg-cream-50/80 px-4 py-2 text-sm text-ink-800 outline-none focus:border-champagne-500/50 focus:ring-2 focus:ring-champagne-500/20"
            />
          </label>
          <label className="flex flex-col">
            <span className="sr-only">Ville</span>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Ville (exact)"
              className="w-full rounded-full border border-champagne-500/30 bg-cream-50/80 px-4 py-2 text-sm text-ink-800 outline-none focus:border-champagne-500/50 focus:ring-2 focus:ring-champagne-500/20"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-full border border-choco-600/30 bg-choco-600/10 px-4 py-1.5 text-xs font-semibold text-choco-700 transition-colors hover:bg-choco-600/15 disabled:opacity-60"
          >
            {pending ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <SlidersHorizontal size={13} />
            )}
            Appliquer
          </button>

          {anyActive ? (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setCountry("");
                setCity("");
                go("/admin/members");
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-champagne-500/30 bg-cream-100/50 px-3 py-1.5 text-xs font-medium text-ink-700/70 transition-colors hover:text-choco-600"
            >
              <X size={13} />
              Réinitialiser
            </button>
          ) : null}

          <label className="ml-auto inline-flex items-center gap-2 text-xs text-ink-700/60">
            Trier
            <select
              value={filters.sort}
              onChange={(e) => {
                const value = e.target.value;
                go(
                  buildMembersQuery(filters, {
                    sort: isMemberSort(value) ? value : "recent",
                    page: 1,
                  }),
                );
              }}
              className="rounded-full border border-champagne-500/30 bg-cream-50/80 px-3 py-1.5 text-xs text-ink-800 outline-none focus:border-champagne-500/50 focus:ring-2 focus:ring-champagne-500/20"
            >
              {MEMBER_SORTS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </form>

      {/* Chips de filtres (bascule) */}
      <div className="flex flex-col gap-2 border-t border-champagne-500/15 pt-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] uppercase tracking-wide text-ink-700/45">
            Compte
          </span>
          {ACCOUNT_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() =>
                go(toggleMemberFilterQuery(filters, "account", f.key))
              }
              className={chipClass(filters.account === f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] uppercase tracking-wide text-ink-700/45">
            Vérification
          </span>
          {VERIFICATION_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() =>
                go(toggleMemberFilterQuery(filters, "verification", f.key))
              }
              className={chipClass(filters.verification === f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] uppercase tracking-wide text-ink-700/45">
            Profil
          </span>
          {COMPLETENESS_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() =>
                go(toggleMemberFilterQuery(filters, "completeness", f.key))
              }
              className={chipClass(filters.completeness === f.key)}
            >
              {f.label}
            </button>
          ))}
          {PHOTO_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => go(toggleMemberFilterQuery(filters, "photo", f.key))}
              className={chipClass(filters.photo === f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
