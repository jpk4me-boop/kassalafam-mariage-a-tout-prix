"use client";

import { useMemo, useState } from "react";
import {
  BadgeCheck,
  Bell,
  CheckCheck,
  Clock,
  Pause,
  TriangleAlert,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import type {
  MemberNotificationRow,
  ProfileVerificationStatus,
} from "@/lib/types/database";
import { cn } from "@/lib/utils";

const DATE_FMT = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeStyle: "short",
});

const STATUS_ACCENT: Record<
  ProfileVerificationStatus,
  { Icon: typeof BadgeCheck; className: string }
> = {
  pending: {
    Icon: Clock,
    className: "border-champagne-500/40 bg-champagne-400/15 text-choco-700",
  },
  approved: {
    Icon: BadgeCheck,
    className: "border-emerald-600/30 bg-emerald-600/10 text-emerald-700",
  },
  rejected: {
    Icon: TriangleAlert,
    className: "border-red-500/30 bg-red-500/10 text-red-800",
  },
  paused: {
    Icon: Pause,
    className: "border-amber-500/35 bg-amber-400/12 text-amber-800",
  },
};

type NotificationsListProps = Readonly<{
  initialItems: MemberNotificationRow[];
}>;

/**
 * Page Notifications — liste complète avec marquage lu/non lu.
 *
 * Écriture limitée par construction : la migration 20260804070000 n'accorde à
 * `authenticated` que UPDATE (read_at), et la policy restreint aux lignes du
 * membre (auth.uid() = user_id). Aucune autre écriture n'est possible ici.
 */
export function NotificationsList({ initialItems }: NotificationsListProps) {
  const [items, setItems] = useState(initialItems);
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const unreadCount = useMemo(
    () => items.filter((n) => n.read_at === null).length,
    [items],
  );

  async function markRead(ids: string[]) {
    if (ids.length === 0) return;

    setErrorMessage(null);
    setPendingIds(new Set(ids));

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setPendingIds(new Set());
      setErrorMessage("Session introuvable. Rechargez la page.");
      return;
    }

    const nowIso = new Date().toISOString();

    const { error } = await supabase
      .from("member_notifications")
      .update({ read_at: nowIso })
      .eq("user_id", user.id) // RLS le garantit déjà ; explicite et lisible.
      .is("read_at", null)
      .in("id", ids);

    setPendingIds(new Set());

    if (error) {
      // Log non sensible (message Supabase uniquement, jamais de clé/JWT).
      console.error("[notifications] marquage échoué:", error.message);
      setErrorMessage("Le marquage a échoué. Réessayez dans un instant.");
      return;
    }

    setItems((prev) =>
      prev.map((n) =>
        ids.includes(n.id) && n.read_at === null
          ? { ...n, read_at: nowIso }
          : n,
      ),
    );
  }

  if (items.length === 0) {
    return (
      <section className="rounded-3xl border border-champagne-500/30 bg-cream-50/60 p-8 text-center shadow-card">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-champagne-500/40 bg-champagne-400/15 text-choco-700">
          <Bell size={20} />
        </span>
        <p className="mt-4 font-serif text-lg font-semibold text-choco-700">
          Aucune notification pour le moment
        </p>
        <p className="mt-2 text-sm text-ink-700/65">
          Vos informations importantes apparaîtront ici : vérification,
          demandes, mises en relation et activité Premium.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-champagne-500/30 bg-cream-50/60 p-6 shadow-card sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Bell size={18} className="text-choco-600" />
          <h2 className="font-serif text-xl font-semibold text-choco-700">
            {unreadCount > 0
              ? `${unreadCount} non lue${unreadCount > 1 ? "s" : ""}`
              : "Tout est lu"}
          </h2>
        </div>

        {unreadCount > 0 ? (
          <button
            type="button"
            onClick={() =>
              markRead(
                items.filter((n) => n.read_at === null).map((n) => n.id),
              )
            }
            disabled={pendingIds.size > 0}
            className="inline-flex items-center gap-2 rounded-full border border-champagne-500/40 bg-cream-50 px-4 py-2 text-xs font-semibold text-choco-700 transition-colors hover:bg-champagne-400/15 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <CheckCheck size={15} />
            Tout marquer comme lu
          </button>
        ) : null}
      </div>

      {errorMessage ? (
        <p className="mt-3 rounded-xl border border-red-500/25 bg-red-500/5 px-3 py-2 text-sm text-red-800">
          {errorMessage}
        </p>
      ) : null}

      <ul className="mt-5 flex flex-col gap-3">
        {items.map((n) => {
          const unread = n.read_at === null;
          const accent = n.verification_status
            ? STATUS_ACCENT[n.verification_status]
            : null;
          const Icon = accent?.Icon ?? Bell;

          return (
            <li
              key={n.id}
              className={cn(
                "rounded-2xl border p-4 transition-colors",
                unread
                  ? "border-champagne-500/45 bg-champagne-400/10"
                  : "border-champagne-500/20 bg-cream-100/40",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <span
                    className={cn(
                      "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border",
                      accent?.className ??
                        "border-champagne-500/40 bg-champagne-400/15 text-choco-700",
                    )}
                  >
                    <Icon size={14} />
                  </span>
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium text-choco-700">
                      {n.title}
                      {unread ? (
                        <span
                          aria-label="Non lue"
                          className="h-2 w-2 shrink-0 rounded-full bg-champagne-600"
                        />
                      ) : null}
                    </p>
                    <p className="mt-0.5 whitespace-pre-line text-sm text-ink-700/75">
                      {n.body}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span className="whitespace-nowrap text-xs text-ink-700/50">
                    {DATE_FMT.format(new Date(n.created_at))}
                  </span>
                  {unread ? (
                    <button
                      type="button"
                      onClick={() => markRead([n.id])}
                      disabled={pendingIds.has(n.id)}
                      className="text-xs font-semibold text-choco-600 underline-offset-2 transition-colors hover:text-choco-800 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Marquer comme lu
                    </button>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
