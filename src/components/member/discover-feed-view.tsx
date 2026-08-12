"use client";

import { useState } from "react";
import Link from "next/link";
import {
  BadgeCheck,
  Lock,
  MapPin,
  UserRound,
  X,
} from "lucide-react";

import { CandidateDetailsToggle } from "@/components/member/candidate-details";
import { FavoriteButton } from "@/components/member/favorite-button";
import { GuidedTour, type TourStep } from "@/components/member/guided-tour";
import { InterestButton } from "@/components/member/interest-button";
import type {
  DiscoverCandidateWithPhoto,
  DiscoveryUniverse,
  MaritalStatus,
} from "@/lib/types/database";
import { UNIVERSE_LABEL } from "@/lib/discovery/universe";

/**
 * L3D-B PR2/PR3 — Affichage des cartes de découverte (Client Component).
 *
 * Ne reçoit QUE des données sûres (10 champs + `signedUrl`).
 *   - « Exprimer un intérêt » (PR3) : SEULE écriture, via la RPC contrôlée
 *     `express_interest` (aucun insert/update direct de `matches`) ;
 *   - « Passer ce profil » masque la carte LOCALEMENT (aucune persistance) ;
 *   - photo affichée seulement si `signedUrl` ; sinon placeholder « Photo protégée »
 *     (`is_blurred`) ou neutre (pas de photo). `storage_path` n'existe pas ici.
 *
 * `initialStates` ne révèle QUE les intérêts sortants du viewer (`sent`) et les
 * intérêts mutuels (`matched`) ; jamais un intérêt entrant en attente.
 */

/**
 * Visite guidée du premier passage (Lot E) — six bulles ancrées sur les vrais
 * boutons de la PREMIÈRE carte. Chaque texte décrit une fonction RÉELLEMENT
 * livrée : rien n'est annoncé ici qui n'existe pas déjà dans l'écran.
 */
const ETAPES_VISITE: TourStep[] = [
  {
    title: "Bienvenue dans la découverte",
    body:
      "Voici les profils vérifiés compatibles avec votre univers. Six repères rapides pour savoir quoi faire — vous pouvez passer à tout moment.",
  },
  {
    anchor: "photo",
    title: "Des photos protégées",
    body:
      "Les photos restent floutées tant que leur propriétaire ne les ouvre pas. Les vôtres suivent la même règle : c'est vous qui décidez, dans votre profil.",
  },
  {
    anchor: "voir-plus",
    title: "Voir plus",
    body:
      "Ouvre la présentation du membre et ses attentes. À savoir : cette consultation compte comme une visite, et la personne peut la voir. Vos visites peuvent rester discrètes — le réglage est dans votre profil.",
  },
  {
    anchor: "interet",
    title: "Exprimer un intérêt",
    body:
      "C'est votre première main tendue. La personne reste seule décisionnaire : la conversation ne s'ouvre que si l'intérêt devient mutuel.",
  },
  {
    anchor: "favori",
    title: "Mettre de côté",
    body:
      "Gardez un profil sous la main pour y revenir. Vous pouvez rendre vos favoris discrets dans votre profil : personne ne saura que vous l'avez enregistré.",
  },
  {
    title: "Vous êtes prêt",
    body:
      "« Passer ce profil » masque simplement une carte pour cette session, sans rien enregistrer. Prenez votre temps : ici, on cherche un foyer, pas un défilement.",
  },
];

const MARITAL_LABEL: Record<MaritalStatus, string> = {
  celibataire: "Célibataire",
  divorce: "Divorcé(e)",
  veuf: "Veuf / Veuve",
  separe: "Séparé(e)",
};

export function DiscoverFeedView({
  candidates,
  universe,
  initialStates,
  favoriteIds = [],
  tourCompleted = true,
}: {
  candidates: DiscoverCandidateWithPhoto[];
  universe: DiscoveryUniverse;
  initialStates: Record<string, "sent" | "matched">;
  favoriteIds?: string[];
  /**
   * Témoin `profiles.tour_completed_at` (migration 65). Par défaut TRUE : en
   * cas de doute, on ne dérange personne avec une visite déjà vue.
   */
  tourCompleted?: boolean;
}) {
  const [passed, setPassed] = useState<Set<string>>(new Set());

  function skip(id: string) {
    setPassed((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }

  const visible = candidates.filter((c) => !passed.has(c.id));

  // État vide initial (aucun candidat compatible).
  if (candidates.length === 0) {
    return (
      <section className="flex flex-col items-start gap-3 rounded-3xl border border-dashed border-champagne-500/40 bg-cream-100/30 p-6 text-center sm:p-8">
        <div className="w-full">
          <h2 className="font-serif text-xl font-semibold text-choco-700">
            Aucun profil compatible pour le moment.
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-ink-700/70">
            De nouveaux membres rejoignent Kassalafam régulièrement. Revenez
            bientôt — et soignez votre profil pour de meilleures rencontres.
          </p>
          <Link
            href="/profile"
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-choco-600 to-choco-800 px-5 py-2.5 text-sm font-semibold text-cream-50 shadow-[0_12px_30px_-12px_rgba(43,26,18,0.8)] ring-1 ring-inset ring-champagne-400/30 transition-transform hover:-translate-y-0.5"
          >
            <UserRound size={16} />
            Compléter mon profil
          </Link>
        </div>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Visite guidée du premier passage. Elle remplace l'ancien bandeau
          « mini-tuto » : même intention, mais ancrée sur les vrais boutons et
          mémorisée par PERSONNE (base) et non par navigateur. */}
      <GuidedTour steps={ETAPES_VISITE} active={!tourCompleted} />

      {visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-champagne-500/40 bg-cream-100/30 p-6 text-center text-sm text-ink-700/60">
          Vous avez parcouru tous les profils proposés pour le moment.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {visible.map((c, i) => (
            <li
              key={c.id}
              className="flex flex-col overflow-hidden rounded-3xl border border-champagne-500/30 bg-cream-50/60 shadow-card"
            >
              {/* Média. La PREMIÈRE carte porte les ancres de la visite guidée
                  (data-tour) : une seule carte est mise en avant, jamais
                  plusieurs à la fois. */}
              <div
                data-tour={i === 0 ? "photo" : undefined}
                className="relative aspect-[4/5] bg-cream-100/50"
              >
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
                  // Le membre a des photos mais a choisi de les garder privées.
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
                  // Aucune photo encore ajoutée — placeholder neutre.
                  <div className="flex h-full w-full items-center justify-center text-ink-700/30">
                    <UserRound size={32} />
                  </div>
                )}

                {/* Badge univers */}
                <span className="absolute left-2 top-2 inline-flex items-center rounded-full bg-choco-700/85 px-2.5 py-1 text-xs font-medium text-cream-50">
                  {UNIVERSE_LABEL[universe]}
                </span>
                {/* Badge vérifié */}
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

                {/* Actions */}
                <div className="mt-auto flex flex-col gap-2 pt-2">
                  {/* `flex flex-col` sur les enveloppes : sans lui, un bouton
                      `inline-flex` cesse d'être étiré par la colonne parente et
                      la carte se déforme. L'enveloppe existe uniquement pour
                      porter l'ancre `data-tour` (un `display:contents` n'aurait
                      aucune boîte à mesurer). */}
                  <div
                    data-tour={i === 0 ? "voir-plus" : undefined}
                    className="flex flex-col"
                  >
                    <CandidateDetailsToggle targetId={c.id} />
                  </div>
                  <div
                    data-tour={i === 0 ? "interet" : undefined}
                    className="flex flex-col"
                  >
                    <InterestButton
                      targetId={c.id}
                      universe={universe}
                      initial={initialStates[c.id]}
                    />
                  </div>
                  <div
                    data-tour={i === 0 ? "favori" : undefined}
                    className="flex flex-col"
                  >
                    <FavoriteButton
                      targetId={c.id}
                      initialFavorited={favoriteIds.includes(c.id)}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => skip(c.id)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium text-ink-700/60 transition-colors hover:bg-cream-100/60 hover:text-ink-800"
                  >
                    <X size={14} />
                    Passer ce profil
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
