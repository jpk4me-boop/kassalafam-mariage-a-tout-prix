"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, Bell, Clock, Pause, TriangleAlert } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import type {
  MemberNotificationRow,
  ProfileVerificationStatus,
} from "@/lib/types/database";

const DATE_FMT = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });

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

type PanelState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; items: MemberNotificationRow[] };

/**
 * Notifications membre (L3-C) — LECTURE SEULE via RLS (le membre ne voit que
 * ses propres lignes, `auth.uid() = user_id`). Aucune écriture côté client.
 *
 * États distincts (un seul rendu "vide" silencieux masquait auparavant les
 * trois cas) :
 *   - loading : message discret de chargement,
 *   - error   : message non sensible (jamais de secret), détail loggé en console,
 *   - ready   : liste si >0, sinon rien (pas de gros bloc vide).
 */
export function MemberNotificationsPanel() {
  const [state, setState] = useState<PanelState>({ status: "loading" });

  useEffect(() => {
    let active = true;

    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        // Pas de session côté client : rien à afficher (le middleware redirige
        // normalement déjà les non-connectés hors de /dashboard).
        if (active) setState({ status: "ready", items: [] });
        return;
      }

      const { data, error } = await supabase
        .from("member_notifications")
        .select("*")
        .eq("user_id", user.id) // RLS le garantit déjà ; explicite et lisible.
        .order("created_at", { ascending: false })
        .limit(5);

      if (!active) return;

      if (error) {
        // Log non sensible (message Supabase uniquement, jamais de clé/JWT).
        console.error("[notifications] lecture échouée:", error.message);
        setState({ status: "error" });
        return;
      }

      const items = (data as MemberNotificationRow[] | null) ?? [];
      // Diagnostic non sensible : l'UUID auth n'est pas un secret. Permet de
      // confirmer que la session correspond bien au membre attendu.
      console.info(
        `[notifications] user=${user.id} count=${items.length}`,
      );
      setState({ status: "ready", items });
    }

    load();
    return () => {
      active = false;
    };
  }, []);

  if (state.status === "loading") {
    return (
      <p className="text-sm text-ink-700/55">Chargement des notifications…</p>
    );
  }

  if (state.status === "error") {
    return (
      <p className="text-sm text-ink-700/55">
        Notifications indisponibles pour le moment.
      </p>
    );
  }

  const items = state.items;
  // Pas de gros bloc vide : rien s'il n'y a aucune notification.
  if (items.length === 0) return null;

  return (
    <section className="rounded-3xl border border-champagne-500/30 bg-cream-50/60 p-6 shadow-card sm:p-8">
      <div className="flex items-center gap-2">
        <Bell size={18} className="text-choco-600" />
        <h2 className="font-serif text-xl font-semibold text-choco-700">
          Notifications
        </h2>
      </div>

      <ul className="mt-4 flex flex-col gap-3">
        {items.map((n) => {
          const accent = n.verification_status
            ? STATUS_ACCENT[n.verification_status]
            : null;
          const Icon = accent?.Icon ?? Bell;
          return (
            <li
              key={n.id}
              className="rounded-2xl border border-champagne-500/25 bg-cream-100/40 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <span
                    className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${
                      accent?.className ??
                      "border-champagne-500/40 bg-champagne-400/15 text-choco-700"
                    }`}
                  >
                    <Icon size={14} />
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-choco-700">{n.title}</p>
                    <p className="mt-0.5 whitespace-pre-line text-sm text-ink-700/75">
                      {n.body}
                    </p>
                  </div>
                </div>
                <span className="shrink-0 whitespace-nowrap text-xs text-ink-700/50">
                  {DATE_FMT.format(new Date(n.created_at))}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
