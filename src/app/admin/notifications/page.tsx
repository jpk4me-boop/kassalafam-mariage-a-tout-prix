import Link from "next/link";
import {
  ChevronRight,
  MessageCircle,
  TriangleAlert,
  UserRound,
} from "lucide-react";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin-guard";
import {
  buildQuickSendMessage,
  buildQuickSendUrl,
  quickSendEventLabel,
  QUICK_SEND_EVENT_LABELS,
} from "@/lib/admin/whatsapp-quick-send";

// Rendu dynamique : dépend de la session (cookies) et d'env serveur.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "À prévenir — Administration",
};

const DATE_FMT = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeStyle: "short",
});

function fmt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : DATE_FMT.format(d);
}

type PendingMember = {
  profileId: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  /** Types d'événements non lus, du plus ancien au plus récent. */
  eventTypes: string[];
  oldestAt: string;
  total: number;
};

export default async function AdminNotificationsPage() {
  // Authentification + contrôle admin — 100 % côté serveur (garde centralisée).
  await requireAdmin("/admin/notifications");

  let members: PendingMember[] = [];
  let loadError: string | null = null;

  try {
    const admin = createAdminClient();

    // 1. Notifications NON LUES des types couverts, du plus ancien au plus
    //    récent. Volume marginal aujourd'hui ; borné par sécurité.
    const { data: notifications, error } = await admin
      .from("member_notifications")
      .select("user_id, type, created_at")
      .is("read_at", null)
      .in("type", Object.keys(QUICK_SEND_EVENT_LABELS))
      .order("created_at", { ascending: true })
      .limit(500);

    if (error) throw error;

    const rows = notifications ?? [];
    const ids = Array.from(new Set(rows.map((r) => r.user_id)));

    if (ids.length > 0) {
      // 2. Profils des membres concernés : UN SEUL SELECT. Seuls les comptes
      //    actifs sont proposés (on ne relance jamais un compte suspendu).
      const { data: profiles } = await admin
        .from("profiles")
        .select("id, first_name, last_name, whatsapp_phone, account_status")
        .in("id", ids)
        .eq("account_status", "active");

      const byId = new Map(
        (profiles ?? []).map((p) => [p.id as string, p] as const),
      );

      const grouped = new Map<string, PendingMember>();
      for (const row of rows) {
        const profile = byId.get(row.user_id);
        if (!profile) continue; // compte suspendu ou introuvable : ignoré.

        const existing = grouped.get(row.user_id);
        if (existing) {
          existing.total += 1;
          if (!existing.eventTypes.includes(row.type)) {
            existing.eventTypes.push(row.type);
          }
        } else {
          grouped.set(row.user_id, {
            profileId: row.user_id,
            firstName: profile.first_name,
            lastName: profile.last_name,
            phone: profile.whatsapp_phone,
            eventTypes: [row.type],
            oldestAt: row.created_at,
            total: 1,
          });
        }
      }

      // Les plus anciennes attentes d'abord.
      members = [...grouped.values()].sort((a, b) =>
        a.oldestAt.localeCompare(b.oldestAt),
      );
    }
  } catch (err) {
    loadError =
      err instanceof Error ? err.message : "Lecture des notifications indisponible.";
  }

  const withPhone = members.filter((m) => m.phone?.trim());

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-champagne-600">
          Back-office
        </p>
        <h1 className="mt-2 font-serif text-3xl font-semibold text-choco-700 sm:text-4xl">
          À prévenir
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-700/70">
          Membres qui ont du nouveau sans l’avoir encore vu. Le bouton ouvre
          WhatsApp avec le message déjà rédigé : vous relisez et vous envoyez.
          Aucun envoi automatique, aucun message n’est expédié depuis cette page.
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
      ) : members.length === 0 ? (
        <p className="rounded-2xl border border-champagne-500/25 bg-cream-50/60 px-5 py-6 text-sm text-ink-700/70">
          Personne à prévenir : tous les membres actifs ont vu leurs
          notifications.
        </p>
      ) : (
        <>
          <p className="text-sm text-ink-700/70">
            <span className="font-semibold text-choco-700">
              {members.length}
            </span>{" "}
            membre{members.length > 1 ? "s" : ""} à prévenir ·{" "}
            {withPhone.length} joignable{withPhone.length > 1 ? "s" : ""} sur
            WhatsApp
          </p>

          <ul className="flex flex-col gap-4">
            {members.map((member) => {
              const displayName =
                [member.firstName?.trim(), member.lastName?.trim()]
                  .filter(Boolean)
                  .join(" ") || "Sans prénom";
              const message = buildQuickSendMessage(
                member.firstName,
                member.eventTypes,
              );
              const url = buildQuickSendUrl(member.phone, message);

              return (
                <li
                  key={member.profileId}
                  className="rounded-2xl border border-champagne-500/25 bg-cream-50/60 p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="inline-flex items-center gap-2 font-serif text-lg font-semibold text-choco-700">
                        <UserRound
                          size={17}
                          className="text-champagne-600"
                          aria-hidden
                        />
                        {displayName}
                      </p>
                      <p className="mt-1 text-[12px] text-ink-700/60">
                        En attente depuis le {fmt(member.oldestAt)}
                      </p>
                    </div>
                    <Link
                      href={`/admin/members/${member.profileId}`}
                      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-champagne-500/30 bg-cream-100/60 px-3 py-1.5 text-xs font-medium text-choco-700 transition-colors hover:bg-champagne-400/15"
                    >
                      Fiche membre
                      <ChevronRight size={14} aria-hidden />
                    </Link>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {member.eventTypes.map((type) => (
                      <span
                        key={type}
                        className="inline-flex items-center rounded-full bg-champagne-400/15 px-2.5 py-1 text-xs font-medium text-ink-700/70"
                      >
                        {quickSendEventLabel(type)}
                      </span>
                    ))}
                    {member.total > member.eventTypes.length ? (
                      <span className="text-xs text-ink-700/50">
                        {member.total} notifications non lues
                      </span>
                    ) : null}
                  </div>

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
                          Prévenir sur WhatsApp
                        </a>
                        <p className="mt-2 text-xs italic text-ink-700/55">
                          « {message} »
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-ink-700/50">
                        Aucun numéro WhatsApp enregistré pour ce membre.
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
