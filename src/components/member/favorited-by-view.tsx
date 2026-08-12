"use client";

import Link from "next/link";
import {
  BadgeCheck,
  Heart,
  Lock,
  MapPin,
  UserRound,
} from "lucide-react";

import { CandidateDetailsToggle } from "@/components/member/candidate-details";
import { InterestButton } from "@/components/member/interest-button";
import type {
  FavoritedByCandidateWithPhoto,
  MaritalStatus,
} from "@/lib/types/database";
import { UNIVERSE_LABEL } from "@/lib/discovery/universe";

/**
 * Lot B2 — « Ils vous ont ajouté » : favoris ENTRANTS (Client Component).
 *
 * Alimenté par la RPC premium `list_favorited_by` (favoris discrets exclus,
 * visibilité revalidée, règle pseudo appliquée). Ne reçoit QUE des champs sûrs.
 *
 * Différence essentielle avec FavoritesView : il n'y a AUCUN bouton de retrait.
 * Ces favoris appartiennent aux autres membres — on les consulte, on ne les
 * modifie pas.
 */

const MARITAL_LABEL: Record<MaritalStatus, string> = {
  celibataire: "Célibataire",
  divorce: "Divorcé(e)",
  veuf: "Veuf / Veuve",
  separe: "Séparé(e)",
};

const DATE_FMT = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });

export function FavoritedByView({
  admirers,
  initialStates,
}: {
  admirers: FavoritedByCandidateWithPhoto[];
  initialStates: Record<string, "sent" | "matched">;
}) {
  if (admirers.length === 0) {
    return (
      <section className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-champagne-500/40 bg-cream-100/30 p-8 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full border border-champagne-500/40 bg-champagne-400/15 text-choco-700">
          <Heart size={20} />
        </span>
        <h2 className="font-serif text-xl font-semibold text-choco-700">
          Personne ne vous a encore ajouté
        </h2>
        <p className="mx-auto max-w-xl text-sm text-ink-700/70">
          Lorsqu’un membre vous enregistrera dans ses favoris, vous le
          retrouverez ici — sauf s’il a choisi les favoris discrets.
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
      {admirers.map((c) => (
        <li
          key={c.id}
          className="flex flex-col overflow-hidden rounded-3xl border border-champagne-500/30 bg-cream-50/60 shadow-card"
        >
          {/* Média */}
          <div className="relative aspect-[4/5] bg-cream-100/50">
            {c.signedUrl ? (
              <div className="relative h-full w-full overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={c.signedUrl}
                  alt={`Photo de ${c.first_name ?? "ce membre"}`}
                  className={
                    c.is_blurred
                      ? "h-full w-full scale-110 object-cover blur-md"
                      : "h-full w-full object-cover"
                  }
                />
                {c.is_blurred ? (
                  <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-ink-900/55 px-2.5 py-1 text-[10px] font-medium text-cream-50">
                    <Lock size={10} />
                    Photo protégée
                  </span>
                ) : null}
              </div>
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
              <Heart size={13} className="shrink-0" />
              Vous a ajouté le {DATE_FMT.format(new Date(c.favorited_at))}
            </p>

            {/* Actions — consultation et intérêt uniquement. Aucun retrait :
                ce favori appartient à l'autre membre. */}
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
