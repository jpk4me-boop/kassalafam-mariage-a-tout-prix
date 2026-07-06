import Link from "next/link";
import {
  TriangleAlert,
  ScrollText,
  BadgeCheck,
  ShieldAlert,
  Flag,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin-guard";
import type { AdminAuditEventRow } from "@/lib/types/database";
import {
  eventFromAuditRow,
  buildAuditQuery,
  auditPeriodSince,
  isAuditSourceFilter,
  isAuditPeriod,
  AUDIT_PAGE_SIZE,
  type AuditFilters as AuditFiltersType,
  type AuditSource,
} from "@/lib/admin/audit";
import { AuditFilters } from "@/components/admin/audit-filters";
import { isUuid } from "@/lib/admin/safety-reports";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Journal d’administration — Administration",
};

const SOURCE_META: Record<
  AuditSource,
  { label: string; Icon: typeof BadgeCheck; className: string }
> = {
  verification: {
    label: "Vérification",
    Icon: BadgeCheck,
    className: "border-champagne-500/40 bg-champagne-400/15 text-choco-700",
  },
  account: {
    label: "Compte",
    Icon: ShieldAlert,
    className: "border-red-500/30 bg-red-500/10 text-red-800",
  },
  report: {
    label: "Signalement",
    Icon: Flag,
    className: "border-amber-500/40 bg-amber-400/15 text-amber-800",
  },
};

const DATE_FMT = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeStyle: "short",
});
function fmt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : DATE_FMT.format(d);
}

function flatten(
  sp: Record<string, string | string[] | undefined>,
): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(sp)) out[k] = Array.isArray(v) ? v[0] : v;
  return out;
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Lecture réservée Admin ET Super admin (garde centralisée, 100 % serveur).
  await requireAdmin("/admin/audit");

  const sp = flatten(await searchParams);
  const pageRaw = Number.parseInt(sp.page ?? "1", 10);
  const filters: AuditFiltersType = {
    source: isAuditSourceFilter(sp.source) ? sp.source : "all",
    period: isAuditPeriod(sp.period) ? sp.period : "30d",
    actor: sp.actor ? sp.actor.slice(0, 320) : null,
    target: sp.target && isUuid(sp.target) ? sp.target : null,
    page: Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1,
  };

  const now = new Date();
  const since = auditPeriodSince(filters.period, now);
  const offset = (filters.page - 1) * AUDIT_PAGE_SIZE;

  let events: ReturnType<typeof eventFromAuditRow>[] = [];
  let total = 0;
  let actors: string[] = [];
  let loadError: string | null = null;

  try {
    const admin = createAdminClient();

    // Pagination réelle EN BASE (UNION ALL des 3 journaux) : aucun plafond fixe,
    // aucune table entière chargée en mémoire. total_count fiabilise la pagination.
    const [eventsRes, actorsRes] = await Promise.all([
      admin.rpc("admin_list_audit_events", {
        p_source: filters.source === "all" ? null : filters.source,
        p_actor: filters.actor,
        p_target: filters.target,
        p_since: since ? since.toISOString() : null,
        p_limit: AUDIT_PAGE_SIZE,
        p_offset: offset,
      }),
      admin.rpc("admin_audit_actors"),
    ]);

    if (eventsRes.error) throw eventsRes.error;
    const rows = (eventsRes.data ?? []) as AdminAuditEventRow[];
    events = rows.map(eventFromAuditRow);
    total = Number(rows[0]?.total_count ?? 0);

    if (!actorsRes.error) {
      actors = (actorsRes.data ?? [])
        .map((r: { actor_email: string }) => r.actor_email)
        .filter((a): a is string => Boolean(a));
    }
  } catch (err) {
    loadError =
      err instanceof Error ? err.message : "Lecture du journal indisponible.";
  }

  const totalPages = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
  const currentPage = Math.min(filters.page, totalPages);
  const rangeStart = total === 0 ? 0 : offset + 1;
  const rangeEnd = Math.min(offset + events.length, total);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-champagne-600">
          Back-office
        </p>
        <h1 className="mt-2 font-serif text-3xl font-semibold text-choco-700 sm:text-4xl">
          Journal d’administration
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-700/70">
          Flux unifié et horodaté des actions de modération : vérification de
          profil, suspension/réactivation de compte et traitement des
          signalements. Chaque événement provient d’un journal immuable ; seuls
          les succès appliqués y figurent.
        </p>
      </header>

      {loadError ? (
        <div className="flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/5 px-5 py-4 text-sm text-red-800">
          <TriangleAlert size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Lecture admin indisponible</p>
            <p className="mt-1 text-red-800/80">
              Vérifiez <code>SUPABASE_SERVICE_ROLE_KEY</code> et l’application de
              la migration back-office. Détail : {loadError}
            </p>
          </div>
        </div>
      ) : (
        <>
          <AuditFilters filters={filters} actors={actors} />

          <p className="text-sm text-ink-700/70">
            {total === 0 ? (
              "Aucun événement pour ces filtres."
            ) : (
              <>
                <span className="font-semibold text-choco-700">{total}</span>{" "}
                événement{total > 1 ? "s" : ""} · affichage {rangeStart}–
                {rangeEnd}
              </>
            )}
          </p>

          {events.length > 0 ? (
            <ol className="flex flex-col gap-3">
              {events.map((e) => {
                const meta = SOURCE_META[e.source];
                return (
                  <li
                    key={e.key}
                    className="rounded-2xl border border-champagne-500/20 bg-cream-50/60 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium ${meta.className}`}
                        >
                          <meta.Icon size={13} />
                          {meta.label}
                        </span>
                        <span className="text-sm font-semibold text-choco-700">
                          {e.actionLabel}
                        </span>
                      </span>
                      <span className="text-[11px] text-ink-700/50">
                        {fmt(e.createdAt)}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-700/60">
                      <span>Acteur : {e.actorEmail ?? "—"}</span>
                      {e.previousStatus && e.newStatus ? (
                        <span>
                          {e.previousStatus} → {e.newStatus}
                        </span>
                      ) : null}
                      <span className="rounded-full bg-emerald-600/10 px-2 py-0.5 font-medium text-emerald-700">
                        {e.resultLabel}
                      </span>
                      {e.targetProfileId ? (
                        <Link
                          href={`/admin/members/${e.targetProfileId}`}
                          className="inline-flex items-center gap-1 font-medium text-champagne-600 hover:text-choco-700"
                        >
                          Voir le membre
                          <ArrowRight size={12} />
                        </Link>
                      ) : null}
                    </div>

                    {e.note?.trim() ? (
                      <p className="mt-2 rounded-lg bg-champagne-400/8 px-3 py-2 text-xs text-ink-700/80">
                        {e.note}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          ) : (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-champagne-500/25 bg-cream-100/40 px-6 py-14 text-center">
              <ScrollText size={26} className="text-ink-700/40" aria-hidden />
              <p className="text-sm text-ink-700/60">
                Aucune action administrative pour ces filtres.
              </p>
            </div>
          )}

          {totalPages > 1 ? (
            <nav className="flex items-center justify-between gap-3">
              {currentPage > 1 ? (
                <Link
                  href={buildAuditQuery(filters, { page: currentPage - 1 })}
                  className="inline-flex items-center gap-1.5 rounded-full border border-champagne-500/30 bg-cream-100/60 px-4 py-2 text-sm font-medium text-choco-700 transition-colors hover:bg-champagne-400/15"
                >
                  <ChevronLeft size={15} />
                  Précédent
                </Link>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-champagne-500/20 bg-cream-100/30 px-4 py-2 text-sm font-medium text-ink-700/35">
                  <ChevronLeft size={15} />
                  Précédent
                </span>
              )}

              <span className="text-sm text-ink-700/60">
                Page {currentPage} / {totalPages}
              </span>

              {currentPage < totalPages ? (
                <Link
                  href={buildAuditQuery(filters, { page: currentPage + 1 })}
                  className="inline-flex items-center gap-1.5 rounded-full border border-champagne-500/30 bg-cream-100/60 px-4 py-2 text-sm font-medium text-choco-700 transition-colors hover:bg-champagne-400/15"
                >
                  Suivant
                  <ChevronRight size={15} />
                </Link>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-champagne-500/20 bg-cream-100/30 px-4 py-2 text-sm font-medium text-ink-700/35">
                  Suivant
                  <ChevronRight size={15} />
                </span>
              )}
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}
