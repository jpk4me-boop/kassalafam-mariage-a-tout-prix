import Link from "next/link";
import {
  ChevronRight,
  MessageCircle,
  Sparkles,
  TriangleAlert,
  UserRound,
} from "lucide-react";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin-guard";
import type { AdminShowcaseCandidateRow } from "@/lib/types/database";
import {
  buildShowcaseMessage,
  buildShowcaseWhatsappUrl,
  showcaseGroupOf,
  SHOWCASE_GROUP_HINTS,
  SHOWCASE_GROUP_LABELS,
  SHOWCASE_GROUP_ORDER,
  type ShowcaseGroupKey,
} from "@/lib/admin/showcase-todo";

// Rendu dynamique : dépend de la session (cookies) et d'env serveur.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Vitrine — Administration",
};

type Member = AdminShowcaseCandidateRow & { group: ShowcaseGroupKey };

export default async function AdminVitrinePage() {
  // Authentification + contrôle admin — 100 % côté serveur (garde centralisée).
  await requireAdmin("/admin/vitrine");

  let members: Member[] = [];
  let loadError: string | null = null;

  try {
    const admin = createAdminClient();

    // UN SEUL appel : la base calcule l'éligibilité (règle unique, jamais
    // recalculée ici) et renvoie l'état de chaque membre finalisé.
    const { data, error } = await admin.rpc("admin_list_showcase_candidates");
    if (error) throw error;

    members = ((data ?? []) as AdminShowcaseCandidateRow[]).map((row) => ({
      ...row,
      group: showcaseGroupOf(row.eligibility_reason, row.is_published),
    }));
  } catch (err) {
    loadError =
      err instanceof Error ? err.message : "Lecture de la vitrine indisponible.";
  }

  const byGroup = new Map<ShowcaseGroupKey, Member[]>();
  for (const member of members) {
    const list = byGroup.get(member.group);
    if (list) list.push(member);
    else byGroup.set(member.group, [member]);
  }

  const publishedCount = byGroup.get("published")?.length ?? 0;
  const actionable = members.length - publishedCount;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-champagne-600">
          Back-office
        </p>
        <h1 className="mt-2 font-serif text-3xl font-semibold text-choco-700 sm:text-4xl">
          Vitrine
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-700/70">
          Qui figure sur <code>/candidats</code>, et surtout qui pourrait y
          figurer. Chaque groupe indique ce qui manque et propose un message
          adapté : un clic ouvre WhatsApp, vous relisez et vous envoyez.
        </p>
      </header>

      {loadError ? (
        <div className="flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/5 px-5 py-4 text-sm text-red-800">
          <TriangleAlert size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Lecture admin indisponible</p>
            <p className="mt-1 text-red-800/80">
              Vérifiez que <code>SUPABASE_SERVICE_ROLE_KEY</code> est définie et
              que la migration vitrine est appliquée. Détail : {loadError}
            </p>
          </div>
        </div>
      ) : members.length === 0 ? (
        <p className="rounded-2xl border border-champagne-500/25 bg-cream-50/60 px-5 py-6 text-sm text-ink-700/70">
          Aucun membre n’a encore terminé son inscription.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-champagne-500/25 bg-cream-50/60 px-5 py-4 text-sm">
            <span className="inline-flex items-center gap-1.5 font-medium text-choco-700">
              <Sparkles size={16} className="text-champagne-600" aria-hidden />
              {publishedCount} profil{publishedCount > 1 ? "s" : ""} sur la
              vitrine
            </span>
            {actionable > 0 ? (
              <span className="text-ink-700/70">
                · {actionable} pourrai{actionable > 1 ? "ent" : "t"} s’y
                ajouter
              </span>
            ) : null}
          </div>

          {SHOWCASE_GROUP_ORDER.map((groupKey) => {
            const group = byGroup.get(groupKey);
            if (!group || group.length === 0) return null;

            return (
              <section key={groupKey} className="flex flex-col gap-3">
                <div>
                  <h2 className="font-serif text-xl font-semibold text-choco-700">
                    {SHOWCASE_GROUP_LABELS[groupKey]}{" "}
                    <span className="text-base font-normal text-ink-700/55">
                      ({group.length})
                    </span>
                  </h2>
                  <p className="mt-1 max-w-2xl text-sm text-ink-700/65">
                    {SHOWCASE_GROUP_HINTS[groupKey]}
                  </p>
                </div>

                <ul className="flex flex-col gap-3">
                  {group.map((member) => {
                    const displayName =
                      [member.first_name?.trim(), member.last_name?.trim()]
                        .filter(Boolean)
                        .join(" ") || "Sans prénom";
                    const message = buildShowcaseMessage(
                      member.first_name,
                      member.group,
                    );
                    const url = buildShowcaseWhatsappUrl(
                      member.whatsapp_phone,
                      message,
                    );

                    return (
                      <li
                        key={member.profile_id}
                        className="rounded-2xl border border-champagne-500/25 bg-cream-50/60 p-5"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <p className="inline-flex items-center gap-2 font-serif text-lg font-semibold text-choco-700">
                            <UserRound
                              size={17}
                              className="text-champagne-600"
                              aria-hidden
                            />
                            {displayName}
                          </p>
                          <Link
                            href={`/admin/members/${member.profile_id}`}
                            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-champagne-500/30 bg-cream-100/60 px-3 py-1.5 text-xs font-medium text-choco-700 transition-colors hover:bg-champagne-400/15"
                          >
                            Fiche membre
                            <ChevronRight size={14} aria-hidden />
                          </Link>
                        </div>

                        {groupKey === "published" ? null : (
                          <div className="mt-4 border-t border-champagne-500/15 pt-4">
                            {url ? (
                              <>
                                <a
                                  href={url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-2 rounded-full bg-emerald-700 px-4 py-2 text-sm font-semibold text-cream-50 transition-colors hover:bg-emerald-800"
                                >
                                  <MessageCircle size={15} aria-hidden />
                                  Écrire sur WhatsApp
                                </a>
                                <p className="mt-2 text-xs italic text-ink-700/55">
                                  « {message} »
                                </p>
                              </>
                            ) : (
                              <p className="text-sm text-ink-700/50">
                                Aucun numéro WhatsApp enregistré — contactez ce
                                membre par email depuis sa fiche.
                              </p>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
