import Link from "next/link";
import { TriangleAlert } from "lucide-react";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin-guard";
import type { ProfileVerificationStatus } from "@/lib/types/database";
import {
  ProfileVerificationList,
  type AdminProfileRow,
} from "@/components/admin/profile-verification-list";

// Rendu dynamique : dépend de la session (cookies), des searchParams et de
// variables d'env serveur. Jamais pré-rendu statiquement.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Vérification des profils — Administration",
};

type FilterKey = "all" | ProfileVerificationStatus;

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "Tous" },
  { key: "pending", label: "En attente" },
  { key: "approved", label: "Approuvés" },
  { key: "rejected", label: "Rejetés" },
  { key: "paused", label: "En pause" },
];

function isFilterKey(value: string | undefined): value is ProfileVerificationStatus {
  return (
    value === "pending" ||
    value === "approved" ||
    value === "rejected" ||
    value === "paused"
  );
}

export default async function AdminVerificationPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  // 1. Authentification + contrôle admin — 100% côté serveur (garde centralisée).
  await requireAdmin("/admin/verification");

  const { status } = await searchParams;
  const activeFilter: FilterKey = isFilterKey(status) ? status : "all";

  // 2. Lecture privilégiée (service_role, SERVEUR uniquement). READ-ONLY.
  let rows: AdminProfileRow[] = [];
  const emailById = new Map<string, string>();
  let loadError: string | null = null;

  try {
    const admin = createAdminClient();

    const { data, error } = await admin
      .from("profiles")
      .select(
        "id, first_name, verification_status, verification_rejection_reason, created_at, updated_at",
      )
      .order("created_at", { ascending: false });

    if (error) throw error;
    rows = (data ?? []) as AdminProfileRow[];

    // Emails best-effort via l'API admin (auth.users). Échec non bloquant.
    try {
      const { data: usersPage } = await admin.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });
      for (const u of usersPage?.users ?? []) {
        if (u.email) emailById.set(u.id, u.email);
      }
    } catch {
      // Liste d'emails indisponible : repli sur « — » dans l'affichage.
    }
  } catch (err) {
    loadError =
      err instanceof Error
        ? err.message
        : "Lecture des profils indisponible.";
  }

  const counts = {
    all: rows.length,
    pending: rows.filter((r) => r.verification_status === "pending").length,
    approved: rows.filter((r) => r.verification_status === "approved").length,
    rejected: rows.filter((r) => r.verification_status === "rejected").length,
    paused: rows.filter((r) => r.verification_status === "paused").length,
  };

  const visibleRows =
    activeFilter === "all"
      ? rows
      : rows.filter((r) => r.verification_status === activeFilter);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-champagne-600">
          Modération
        </p>
        <h1 className="mt-2 font-serif text-3xl font-semibold text-choco-700 sm:text-4xl">
          Vérification des profils
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-700/70">
          Profils membres et statut de vérification. L’approbation et le rejet
          (motif obligatoire) sont actifs via un chemin serveur sécurisé. La
          mise en pause arrivera après migration (L3-B2B).
        </p>
      </header>

      {loadError ? (
        <div className="flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/5 px-5 py-4 text-sm text-red-800">
          <TriangleAlert size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Lecture admin indisponible</p>
            <p className="mt-1 text-red-800/80">
              Vérifiez que <code>SUPABASE_SERVICE_ROLE_KEY</code> est définie
              côté serveur. Détail : {loadError}
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Filtres */}
          <nav className="flex flex-wrap gap-2">
            {FILTERS.map((filter) => {
              const isActive = filter.key === activeFilter;
              const href =
                filter.key === "all"
                  ? "/admin/verification"
                  : `/admin/verification?status=${filter.key}`;
              return (
                <Link
                  key={filter.key}
                  href={href}
                  className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? "border-choco-600/30 bg-choco-600/10 text-choco-700"
                      : "border-champagne-500/30 bg-cream-100/50 text-ink-700/70 hover:text-choco-600"
                  }`}
                >
                  {filter.label}
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      isActive
                        ? "bg-choco-600/15 text-choco-700"
                        : "bg-champagne-400/20 text-ink-700/60"
                    }`}
                  >
                    {counts[filter.key]}
                  </span>
                </Link>
              );
            })}
          </nav>

          <ProfileVerificationList rows={visibleRows} emailById={emailById} />
        </>
      )}
    </div>
  );
}
