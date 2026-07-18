import Link from "next/link";
import { TriangleAlert, ChevronLeft, ChevronRight } from "lucide-react";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin-guard";
import type { AdminMemberListItem } from "@/lib/types/database";
import {
  parseMembersFilters,
  buildMembersQuery,
  MEMBERS_PAGE_SIZE,
} from "@/lib/admin/members";
import { presenceInfo, type PresenceInfo } from "@/lib/admin/presence";
import { MembersFilters } from "@/components/admin/members-filters";
import { MembersList } from "@/components/admin/members-list";

// Rendu dynamique : dépend de la session (cookies), des searchParams et d'env
// serveur. Jamais pré-rendu statiquement.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Membres — Administration",
};

const BUCKET = "profile-photos";
const SIGNED_URL_TTL = 300; // 5 min

/** Aplati les searchParams (string | string[]) en Record<string,string>. */
function flatten(
  sp: Record<string, string | string[] | undefined>,
): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(sp)) {
    out[k] = Array.isArray(v) ? v[0] : v;
  }
  return out;
}

export default async function AdminMembersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // 1. Authentification + contrôle admin — 100 % côté serveur (garde centralisée).
  await requireAdmin("/admin/members");

  const filters = parseMembersFilters(flatten(await searchParams));
  const offset = (filters.page - 1) * MEMBERS_PAGE_SIZE;

  let items: AdminMemberListItem[] = [];
  let total = 0;
  const avatarById = new Map<string, string | null>();
  let loadError: string | null = null;

  try {
    const admin = createAdminClient();

    // 2. Lecture paginée EN BASE (service_role) : filtres, tri, agrégats et
    //    total_count sont calculés par la RPC. Aucune table entière chargée.
    const { data, error } = await admin.rpc("admin_list_members", {
      p_search: filters.search || null,
      p_account_status: filters.account,
      p_verification_status: filters.verification,
      p_completeness: filters.completeness,
      p_has_photo: filters.photo,
      p_country: filters.country,
      p_city: filters.city,
      p_sort: filters.sort,
      p_limit: MEMBERS_PAGE_SIZE,
      p_offset: offset,
    });

    if (error) throw error;
    items = (data ?? []) as AdminMemberListItem[];
    total = Number(items[0]?.total_count ?? 0);

    // 3. Avatars : chemins des photos principales de la PAGE uniquement, signés
    //    côté serveur (TTL court). storage_path n'est jamais exposé au client.
    const ids = items.filter((m) => m.has_photo).map((m) => m.id);
    if (ids.length > 0) {
      const { data: photoRows } = await admin
        .from("photos")
        .select("profile_id, storage_path")
        .in("profile_id", ids)
        .eq("is_primary", true);

      const pathByProfile = new Map<string, string>();
      const profileByPath = new Map<string, string>();
      for (const r of photoRows ?? []) {
        pathByProfile.set(r.profile_id, r.storage_path);
        profileByPath.set(r.storage_path, r.profile_id);
      }
      const paths = [...pathByProfile.values()];
      if (paths.length > 0) {
        const { data: signed } = await admin.storage
          .from(BUCKET)
          .createSignedUrls(paths, SIGNED_URL_TTL);
        for (const s of signed ?? []) {
          const pid = s.path ? profileByPath.get(s.path) : undefined;
          if (pid && s.signedUrl) avatarById.set(pid, s.signedUrl);
        }
      }
    }
  } catch (err) {
    loadError =
      err instanceof Error ? err.message : "Lecture des membres indisponible.";
  }

  const now = new Date();

  // 4. Activité : UN SEUL appel RPC pour les IDs de la page (jamais un appel
  //    par membre). Dernière connexion = auth.users.last_sign_in_at ; dernière
  //    activité = member_activity.last_seen_at (heartbeat). Échec NON bloquant.
  const presenceById = new Map<string, PresenceInfo>();
  if (items.length > 0) {
    try {
      const admin = createAdminClient();
      const { data: activity } = await admin.rpc("admin_get_member_activity", {
        p_profile_ids: items.map((m) => m.id),
      });
      for (const row of activity ?? []) {
        presenceById.set(row.profile_id, presenceInfo(row.last_seen_at, now));
      }
    } catch {
      // Migration analytics pas encore appliquée : la liste reste utilisable.
    }
  }
  const totalPages = Math.max(1, Math.ceil(total / MEMBERS_PAGE_SIZE));
  const currentPage = Math.min(filters.page, totalPages);
  const rangeStart = total === 0 ? 0 : offset + 1;
  const rangeEnd = Math.min(offset + items.length, total);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-champagne-600">
          Back-office
        </p>
        <h1 className="mt-2 font-serif text-3xl font-semibold text-choco-700 sm:text-4xl">
          Membres
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-700/70">
          Recherche, filtres et fiche détaillée des membres. Lecture privilégiée
          côté serveur ; aucune donnée sensible n’atteint le navigateur.
        </p>
      </header>

      {loadError ? (
        <div className="flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/5 px-5 py-4 text-sm text-red-800">
          <TriangleAlert size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Lecture admin indisponible</p>
            <p className="mt-1 text-red-800/80">
              Vérifiez que <code>SUPABASE_SERVICE_ROLE_KEY</code> est définie côté
              serveur et que la migration back-office est appliquée. Détail :{" "}
              {loadError}
            </p>
          </div>
        </div>
      ) : (
        <>
          <MembersFilters filters={filters} />

          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-ink-700/70">
              {total === 0 ? (
                "Aucun résultat"
              ) : (
                <>
                  <span className="font-semibold text-choco-700">{total}</span>{" "}
                  membre{total > 1 ? "s" : ""} · affichage {rangeStart}–{rangeEnd}
                </>
              )}
            </p>
          </div>

          <MembersList
            items={items}
            avatarById={avatarById}
            presenceById={presenceById}
            now={now}
          />

          {totalPages > 1 ? (
            <nav className="flex items-center justify-between gap-3">
              {currentPage > 1 ? (
                <Link
                  href={buildMembersQuery(filters, { page: currentPage - 1 })}
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
                  href={buildMembersQuery(filters, { page: currentPage + 1 })}
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
