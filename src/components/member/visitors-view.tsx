"use client";

import Link from "next/link";
import {
  BadgeCheck,
  Eye,
  Lock,
  MapPin,
  UserRound,
} from "lucide-react";

import { CandidateDetailsToggle } from "@/components/member/candidate-details";
import { InterestButton } from "@/components/member/interest-button";
import type {
  MaritalStatus,
  ProfileVisitorWithPhoto,
} from "@/lib/types/database";
import { UNIVERSE_LABEL } from "@/lib/discovery/universe";

/**
 * Visites (Lot 3) — affichage des membres ayant consulté le profil du viewer.
 *
 * Ne reçoit QUE des données sûres (champs carte + last_visited_at + signedUrl),
 * issues de la RPC `list_profile_visitors` (mode discret exclu, visibilité
 * revalidée). Écritures possibles : expression d'intérêt (RPC) et visite en
 * retour via le volet « Voir plus » (RPC).
 */

const MARITAL_LABEL: Record<MaritalStatus, string> = {
  celibataire: "Célibataire",
  divorce: "Divorcé(e)",
  veuf: "Veuf / Veuve",
  separe: "Séparé(e)",
};

const DATE_FMT = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function VisitorsView({
  visitors,
  initialStates,
}: {
  visitors: ProfileVisitorWithPhoto[];
  initialStates: Record<string, "sent" | "matched">;
}) {
  if (visitors.length === 0) {
    return (
      <section className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-champagne-500/40 bg-cream-100/30 p-8 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full border border-champagne-500/40 bg-champagne-400/15 text-choco-700">
          <Eye size={20} />
        </span>
        <h2 className="font-serif text-xl font-semibold text-choco-700">
          Aucune visite pour le moment
        </h2>
        <p className="mx-auto max-w-xl text-sm text-ink-700/70">
          Lorsqu’un membre consultera le détail de votre profil, vous le
          retrouverez ici. Un profil complet avec photo attire plus de
          visites.
        </p>
        <Link
          href="/profile"
          className="mt-1 inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-choco-600 to-choco-800 px-5 py-2.5 text-sm font-semibold text-cream-50 shadow-[0_12px_30px_-12px_rgba(43,26,18,0.8)] ring-1 ring-inset ring-champagne-400/30 transition-transform hover:-translate-y-0.5"
        >
          <UserRound size={16} />
          Améliorer mon profil
        </Link>
      </section>
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2">
      {visitors.map((c) => (
        <li
          key={c.id}
          className="flex flex-col overflow-hidden rounded-3xl border border-champagne-500/30 bg-cream-50/60 shadow-card"
        >
          {/* Média */}
          <div className="relative aspect-[4/5] bg-cream-100/50">
            {c.signedUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={c.signedUrl}
                alt={`Photo de ${c.first_name ?? "ce membre"}`}
                className="h-full w-full object-cover"
              />
            ) : c.is_blurred ? (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-center text-ink-700/45">
                <Lock size={26} />
                <span className="text-sm font-medium text-ink-700/70">
                  Photo protégée
                </span>
                <span className="text-xs text-ink-700/55">
                  Ce membre a choisi de garder ses photos privées pour
                  l’instant.
                </span>
              </div>
            ) : (
              <div className="flex h-full w-full items-center justify-center text-ink-700/30">
                <UserRound size={32} />
              </div>
            )}

            {c.discovery_universe ? (
              <span className="absolute left-2 top-2 inline-flex items-center rounded-full bg-choco-700/85 px-2.5 py-1 text-xs font-medium text-cream-50">
                {UNIVERSE_LABEL[c.discovery_universe]}
              </span>
            ) : null}
            <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full border border-emerald-600/30 bg-emerald-600/15 px-2.5 py-1 text-xs font-medium text-emerald-800 backdrop-blur">
              <BadgeCheck size={12} />
              Profil vérifié
            </span>
          </div>

          {/* Corps */}
          <div className="flex flex-1 flex-col gap-2 p-4">
            <h3 className="font-serif text-lg font-semibold text-choco-700">
              {c.first_name ?? "Membre"}
              {typeof c.age === "number" ? `, ${c.age}` : ""}
            </h3>

            {c.city || c.country ? (
              <p className="flex items-center gap-1.5 text-sm text-ink-700/70">
                <MapPin size={14} className="shrink-0 text-choco-600" />
                {[c.city, c.country].filter(Boolean).join(" · ")}
              </p>
            ) : null}

            {c.marital_status ? (
              <span className="inline-flex w-fit items-center rounded-full border border-champagne-500/40 bg-cream-100/50 px-2.5 py-1 text-xs font-medium text-choco-700">
                {MARITAL_LABEL[c.marital_status]}
              </span>
            ) : null}

            <p className="flex items-center gap-1.5 text-xs text-ink-700/50">
              <Eye size={13} className="shrink-0" />
              Dernière visite le {DATE_FMT.format(new Date(c.last_visited_at))}
            </p>

            {/* Actions */}
            <div className="mt-auto flex flex-col gap-2 pt-2">
              <CandidateDetailsToggle targetId={c.id} />
              {c.discovery_universe ? (
                <InterestButton
                  targetId={c.id}
                  universe={c.discovery_universe}
                  initial={initialStates[c.id]}
                />
              ) : null}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
