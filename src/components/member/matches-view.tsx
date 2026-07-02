"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  BadgeCheck,
  Check,
  CircleAlert,
  Heart,
  HeartHandshake,
  Loader2,
  Lock,
  MapPin,
  MessageCircle,
  Send,
  UserRound,
  X,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import type {
  MaritalStatus,
  RelationshipItemWithPhoto,
  RelationshipKind,
  RespondInterestResult,
} from "@/lib/types/database";

/**
 * L3D-C — Vue « Mes relations » (Client Component).
 *
 * Reçoit UNIQUEMENT des données sûres (champs non sensibles + `signedUrl`).
 *   - Onglets : Intérêts reçus / Intérêts envoyés / Matches acceptés ;
 *   - « Accepter » / « Refuser » (SEULE écriture) : via la RPC contrôlée
 *     `respond_to_interest` (aucun update direct de `matches`), disponibles
 *     UNIQUEMENT sur les intérêts reçus en attente ;
 *   - respect strict de la confidentialité photo : image affichée seulement si
 *     `signedUrl` ; sinon placeholder « Photo protégée » (`is_blurred`) ou neutre.
 *
 * Idempotence UX : une carte reçue quitte la liste dès qu'on y a répondu ; il
 * est donc impossible d'accepter/refuser deux fois le même intérêt.
 */

const MARITAL_LABEL: Record<MaritalStatus, string> = {
  celibataire: "Célibataire",
  divorce: "Divorcé(e)",
  veuf: "Veuf / Veuve",
  separe: "Séparé(e)",
};

function intentionLabel(intention: string): string {
  if (intention === "mariage_serieux") return "Mariage sérieux";
  return intention;
}

type TabKey = RelationshipKind;

type Toast = { id: number; tone: "success" | "error"; message: string };

// --- Carte profil (partagée par les trois onglets) --------------------------

function ProfileMedia({ item }: { item: RelationshipItemWithPhoto }) {
  return (
    <div className="relative aspect-[4/5] bg-cream-100/50">
      {item.signedUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.signedUrl}
          alt={`Photo de ${item.first_name ?? "ce membre"}`}
          className="h-full w-full object-cover"
        />
      ) : item.is_blurred ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-center text-ink-700/45">
          <Lock size={26} />
          <span className="text-sm font-medium text-ink-700/70">
            Photo protégée
          </span>
          <span className="text-xs text-ink-700/55">
            Ce membre a choisi de garder ses photos privées pour l’instant.
          </span>
        </div>
      ) : (
        <div className="flex h-full w-full items-center justify-center text-ink-700/30">
          <UserRound size={32} />
        </div>
      )}

      <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full border border-emerald-600/30 bg-emerald-600/15 px-2.5 py-1 text-xs font-medium text-emerald-800 backdrop-blur">
        <BadgeCheck size={12} />
        Profil vérifié
      </span>
    </div>
  );
}

function ProfileBody({ item }: { item: RelationshipItemWithPhoto }) {
  return (
    <div className="flex flex-1 flex-col gap-2 p-4">
      <h3 className="font-serif text-lg font-semibold text-choco-700">
        {item.first_name ?? "Membre"}
        {typeof item.age === "number" ? `, ${item.age}` : ""}
      </h3>

      {item.city || item.country ? (
        <p className="flex items-center gap-1.5 text-sm text-ink-700/70">
          <MapPin size={14} className="shrink-0 text-choco-600" />
          {[item.city, item.country].filter(Boolean).join(" · ")}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <span className="inline-flex w-fit items-center rounded-full border border-champagne-500/40 bg-cream-100/50 px-2.5 py-1 text-xs font-medium text-choco-700">
          {intentionLabel(item.intention)}
        </span>
        {item.marital_status ? (
          <span className="inline-flex w-fit items-center rounded-full border border-champagne-500/40 bg-cream-100/50 px-2.5 py-1 text-xs font-medium text-choco-700">
            {MARITAL_LABEL[item.marital_status]}
          </span>
        ) : null}
      </div>
    </div>
  );
}

// --- Vue principale ---------------------------------------------------------

export function MatchesView({
  received: initialReceived,
  sent: initialSent,
  matched: initialMatched,
}: {
  received: RelationshipItemWithPhoto[];
  sent: RelationshipItemWithPhoto[];
  matched: RelationshipItemWithPhoto[];
}) {
  const [tab, setTab] = useState<TabKey>("received");
  const [received, setReceived] =
    useState<RelationshipItemWithPhoto[]>(initialReceived);
  const [sent] = useState<RelationshipItemWithPhoto[]>(initialSent);
  const [matched, setMatched] =
    useState<RelationshipItemWithPhoto[]>(initialMatched);

  // match_id en cours de traitement (bloque toute double-action sur la carte).
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const showToast = useCallback((tone: Toast["tone"], message: string) => {
    // id dérivé du contenu (pas de Date.now) : suffisant pour re-déclencher l'effet.
    setToast((prev) => ({ id: (prev?.id ?? 0) + 1, tone, message }));
  }, []);

  const respond = useCallback(
    async (item: RelationshipItemWithPhoto, decision: RespondInterestResult) => {
      if (pending.has(item.match_id)) return;
      setPending((prev) => new Set(prev).add(item.match_id));

      const supabase = createClient();
      const { data, error } = await supabase.rpc("respond_to_interest", {
        p_match: item.match_id,
        p_decision: decision,
      });

      setPending((prev) => {
        const next = new Set(prev);
        next.delete(item.match_id);
        return next;
      });

      if (error) {
        console.error("[matches] respond_to_interest échoué:", error.message);
        showToast("error", "Impossible d’enregistrer votre réponse pour le moment.");
        return;
      }

      // La carte quitte les « reçus » quoi qu'il arrive (réponse enregistrée).
      setReceived((prev) => prev.filter((r) => r.match_id !== item.match_id));

      const result = (data as RespondInterestResult) ?? decision;
      if (result === "accepted") {
        setMatched((prev) => [
          { ...item, kind: "matched", status: "accepted" },
          ...prev,
        ]);
        showToast("success", "Intérêt accepté — c’est une mise en relation !");
      } else {
        showToast("success", "Intérêt décliné avec respect.");
      }
    },
    [pending, showToast],
  );

  const TABS: { key: TabKey; label: string; count: number }[] = [
    { key: "received", label: "Intérêts reçus", count: received.length },
    { key: "sent", label: "Intérêts envoyés", count: sent.length },
    { key: "matched", label: "Matches acceptés", count: matched.length },
  ];

  const current =
    tab === "received" ? received : tab === "sent" ? sent : matched;

  return (
    <div className="flex flex-col gap-5">
      {/* Onglets */}
      <div
        role="tablist"
        aria-label="Filtrer mes relations"
        className="flex flex-wrap gap-1.5 rounded-full border border-champagne-500/30 bg-cream-100/40 p-1"
      >
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={active}
              type="button"
              onClick={() => setTab(t.key)}
              className={
                active
                  ? "inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-gradient-to-br from-choco-600 to-choco-800 px-3 py-2 text-sm font-semibold text-cream-50 shadow-[0_10px_24px_-14px_rgba(43,26,18,0.8)]"
                  : "inline-flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-ink-700/70 transition-colors hover:text-choco-700"
              }
            >
              <span className="whitespace-nowrap">{t.label}</span>
              <span
                className={
                  active
                    ? "rounded-full bg-cream-50/25 px-1.5 text-xs"
                    : "rounded-full bg-champagne-400/25 px-1.5 text-xs text-choco-700"
                }
              >
                {t.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Contenu de l'onglet */}
      {current.length === 0 ? (
        <EmptyState tab={tab} />
      ) : (
        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {current.map((item) => {
            const isPending = pending.has(item.match_id);
            return (
              <li
                key={item.match_id}
                className="flex flex-col overflow-hidden rounded-3xl border border-champagne-500/30 bg-cream-50/60 shadow-card"
              >
                <ProfileMedia item={item} />
                <ProfileBody item={item} />

                {/* Actions selon l'onglet */}
                <div className="flex flex-col gap-2 px-4 pb-4">
                  {tab === "received" ? (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => respond(item, "accepted")}
                        disabled={isPending}
                        aria-busy={isPending}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-gradient-to-br from-choco-600 to-choco-800 px-4 py-2 text-sm font-semibold text-cream-50 shadow-[0_12px_30px_-12px_rgba(43,26,18,0.8)] ring-1 ring-inset ring-champagne-400/30 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
                      >
                        {isPending ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Check size={14} />
                        )}
                        Accepter
                      </button>
                      <button
                        type="button"
                        onClick={() => respond(item, "rejected")}
                        disabled={isPending}
                        aria-busy={isPending}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-champagne-500/40 bg-cream-50/60 px-4 py-2 text-sm font-medium text-ink-700/70 transition-colors hover:bg-champagne-400/15 hover:text-choco-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <X size={14} />
                        Refuser
                      </button>
                    </div>
                  ) : tab === "sent" ? (
                    <span className="inline-flex items-center justify-center gap-1.5 rounded-full border border-champagne-500/40 bg-cream-100/40 px-4 py-2 text-sm font-medium text-ink-700/60">
                      <Send size={14} />
                      En attente de réponse
                    </span>
                  ) : (
                    <>
                      {item.last_message_content ? (
                        <p className="line-clamp-2 rounded-2xl bg-cream-100/50 px-3 py-2 text-sm text-ink-700/75">
                          {item.last_message_content}
                        </p>
                      ) : (
                        <span className="inline-flex items-center justify-center gap-1.5 rounded-full border border-emerald-600/30 bg-emerald-600/10 px-4 py-2 text-sm font-medium text-emerald-700">
                          <HeartHandshake size={14} />
                          Intérêt mutuel
                        </span>
                      )}
                      <Link
                        href={`/matches/${item.match_id}`}
                        className="inline-flex items-center justify-center gap-1.5 rounded-full bg-gradient-to-br from-choco-600 to-choco-800 px-4 py-2 text-sm font-semibold text-cream-50 shadow-[0_12px_30px_-12px_rgba(43,26,18,0.8)] ring-1 ring-inset ring-champagne-400/30 transition-transform hover:-translate-y-0.5"
                      >
                        <MessageCircle size={14} />
                        {item.last_message_content
                          ? "Ouvrir la conversation"
                          : "Envoyer un message"}
                        {item.unread_count > 0 ? (
                          <span
                            aria-label={`${item.unread_count} message${item.unread_count > 1 ? "s" : ""} non lu${item.unread_count > 1 ? "s" : ""}`}
                            className="ml-1 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-cream-50 px-1.5 text-xs font-bold text-choco-800"
                          >
                            {item.unread_count}
                          </span>
                        ) : null}
                      </Link>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Toast */}
      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4"
        >
          <div
            className={
              toast.tone === "success"
                ? "pointer-events-auto flex items-center gap-2 rounded-full border border-emerald-600/30 bg-emerald-700 px-4 py-2.5 text-sm font-medium text-cream-50 shadow-lg"
                : "pointer-events-auto flex items-center gap-2 rounded-full border border-red-600/30 bg-red-700 px-4 py-2.5 text-sm font-medium text-cream-50 shadow-lg"
            }
          >
            {toast.tone === "success" ? (
              <Heart size={15} />
            ) : (
              <CircleAlert size={15} />
            )}
            {toast.message}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function EmptyState({ tab }: { tab: TabKey }) {
  const copy: Record<TabKey, { title: string; text: string; cta?: { href: string; label: string } }> =
    {
      received: {
        title: "Aucun intérêt reçu pour le moment.",
        text: "Lorsqu’un membre exprimera un intérêt pour votre profil, il apparaîtra ici. Soignez votre profil pour de meilleures rencontres.",
        cta: { href: "/profile", label: "Compléter mon profil" },
      },
      sent: {
        title: "Vous n’avez pas encore exprimé d’intérêt.",
        text: "Parcourez les profils compatibles de votre univers et exprimez un intérêt sincère.",
        cta: { href: "/discover", label: "Découvrir des profils" },
      },
      matched: {
        title: "Aucune mise en relation pour le moment.",
        text: "Dès qu’un intérêt sera mutuel, la mise en relation apparaîtra ici.",
        cta: { href: "/discover", label: "Découvrir des profils" },
      },
    };

  const c = copy[tab];
  return (
    <section className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-champagne-500/40 bg-cream-100/30 p-8 text-center">
      <h2 className="font-serif text-xl font-semibold text-choco-700">
        {c.title}
      </h2>
      <p className="mx-auto max-w-xl text-sm text-ink-700/70">{c.text}</p>
      {c.cta ? (
        <Link
          href={c.cta.href}
          className="mt-1 inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-choco-600 to-choco-800 px-5 py-2.5 text-sm font-semibold text-cream-50 shadow-[0_12px_30px_-12px_rgba(43,26,18,0.8)] ring-1 ring-inset ring-champagne-400/30 transition-transform hover:-translate-y-0.5"
        >
          <UserRound size={16} />
          {c.cta.label}
        </Link>
      ) : null}
    </section>
  );
}
