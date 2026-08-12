"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  BadgeCheck,
  LayoutDashboard,
  LayoutGrid,
  Lock,
  MapPin,
  RotateCcw,
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
 * Explorer (Lot F) — un profil à la fois, plein cadre.
 *
 * Même source, mêmes gardes, mêmes écritures que le flux en grille : la RPC
 * `discover_candidates` côté serveur, `express_interest` pour l'intérêt,
 * `add_favorite` pour les favoris, `view_candidate_details` pour le détail.
 * L'Explorer n'est qu'une AUTRE FAÇON DE PARCOURIR, jamais un autre modèle de
 * données ni un autre modèle de permissions.
 *
 * DÉCISIONS DE CONCEPTION, prises exprès :
 *
 *   · **La visite reste un geste volontaire.** Faire défiler une carte
 *     n'enregistre rien. Seul « Voir plus » appelle `view_candidate_details`,
 *     donc enregistre une visite visible par l'autre membre — exactement comme
 *     dans la grille. Un deck qui compterait une visite par carte affichée
 *     transformerait le compteur de visiteurs en compteur de défilement, et
 *     viderait de son sens l'avantage Premium « découvre qui visite ton
 *     profil ».
 *
 *   · **On n'avance que vers l'avant.** Revenir sur un profil déjà passé n'est
 *     pas offert ici : c'est un candidat naturel pour le Premium (Lot C), et le
 *     livrer gratuitement aujourd'hui reviendrait à le brûler. Le membre peut
 *     toujours tout reprendre depuis le début, et la grille reste accessible.
 *
 *   · **Aucun écran de rétention, aucun compteur d'essais.** Rien ici ne
 *     retient le membre ni ne vend une fonction non livrée (règle d'honnêteté).
 */

const MARITAL_LABEL: Record<MaritalStatus, string> = {
  celibataire: "Célibataire",
  divorce: "Divorcé(e)",
  veuf: "Veuf / Veuve",
  separe: "Séparé(e)",
};

/** Visite guidée propre à l'Explorer — même témoin en base que celle du flux. */
const ETAPES_EXPLORER: TourStep[] = [
  {
    title: "Un profil à la fois",
    body:
      "L'Explorer présente les profils vérifiés un par un, en grand. Quatre repères rapides — vous pouvez passer à tout moment.",
  },
  {
    anchor: "explorer-photo",
    title: "Des photos protégées",
    body:
      "Les photos restent floutées tant que leur propriétaire ne les ouvre pas. Les vôtres suivent la même règle, réglable dans votre profil.",
  },
  {
    anchor: "explorer-detail",
    title: "Voir plus",
    body:
      "Ouvre la présentation et les attentes du membre. Faire défiler n'enregistre rien : c'est ce bouton, et lui seul, qui compte comme une visite — et la personne peut la voir. Vos visites peuvent rester discrètes depuis votre profil.",
  },
  {
    anchor: "explorer-actions",
    title: "Vos trois gestes",
    body:
      "Passer au profil suivant, exprimer un intérêt — la personne reste seule décisionnaire — ou garder le profil en favori pour y revenir.",
  },
  {
    title: "Bonne découverte",
    body:
      "Un profil passé ne revient pas dans cette session, mais rien n'est enregistré : vous pouvez tout reprendre depuis le début. Au bout du parcours, votre tableau de bord rassemble visiteurs, demandes et conversations.",
  },
];

export function ExplorerDeck({
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
  tourCompleted?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const hautRef = useRef<HTMLDivElement | null>(null);

  const total = candidates.length;
  const courant = index < total ? candidates[index] : null;

  const suivant = useCallback(() => {
    setIndex((i) => Math.min(i + 1, total));
  }, [total]);

  // Chaque changement de profil ramène en haut de la carte : sans cela, on
  // arrive au milieu du profil suivant, à l'endroit où on avait laissé le
  // précédent.
  useEffect(() => {
    hautRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [index]);

  // Flèches droite et bas : profil suivant. Rien pour revenir en arrière (voir
  // l'en-tête du fichier).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const cible = e.target as HTMLElement | null;
      const dansUnChamp =
        cible?.tagName === "INPUT" ||
        cible?.tagName === "TEXTAREA" ||
        cible?.isContentEditable;

      if (dansUnChamp) return;

      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        suivant();
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [suivant]);

  if (total === 0) {
    return (
      <section className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-champagne-500/40 bg-cream-100/30 p-8 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full border border-champagne-500/40 bg-champagne-400/15 text-choco-700">
          <UserRound size={20} />
        </span>
        <h2 className="font-serif text-xl font-semibold text-choco-700">
          Aucun profil compatible pour le moment.
        </h2>
        <p className="mx-auto max-w-md text-sm text-ink-700/70">
          De nouveaux membres rejoignent Kassalafam régulièrement. Revenez
          bientôt — et soignez votre profil pour de meilleures rencontres.
        </p>
        <Link
          href="/profile"
          className="mt-1 inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-choco-600 to-choco-800 px-5 py-2.5 text-sm font-semibold text-cream-50 shadow-[0_12px_30px_-12px_rgba(43,26,18,0.8)] ring-1 ring-inset ring-champagne-400/30 transition-transform hover:-translate-y-0.5"
        >
          <UserRound size={16} />
          Compléter mon profil
        </Link>
      </section>
    );
  }

  return (
    <div
      ref={hautRef}
      className="mx-auto flex w-full max-w-md scroll-mt-24 flex-col gap-4"
    >
      <GuidedTour steps={ETAPES_EXPLORER} active={!tourCompleted} />

      {/* Repère de progression + porte de sortie vers la grille. */}
      <div className="flex items-center justify-between gap-3 px-1">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-champagne-700">
          {courant ? `Profil ${index + 1} sur ${total}` : `${total} profils vus`}
        </p>
        <Link
          href="/discover"
          className="inline-flex items-center gap-1.5 rounded-full border border-champagne-500/40 bg-cream-50/70 px-3 py-1.5 text-xs font-medium text-choco-700 transition-colors hover:bg-champagne-400/15"
        >
          <LayoutGrid size={13} />
          Vue en grille
        </Link>
      </div>

      {courant === null ? (
        <section className="flex flex-col items-center gap-3 rounded-[2rem] border border-champagne-500/30 bg-cream-50/60 p-8 text-center shadow-card">
          <span className="flex h-12 w-12 items-center justify-center rounded-full border border-champagne-500/40 bg-champagne-400/15 text-choco-700">
            <BadgeCheck size={20} />
          </span>
          <h2 className="font-serif text-xl font-semibold text-choco-700">
            Vous avez parcouru tous les profils proposés
          </h2>
          <p className="mx-auto max-w-md text-sm text-ink-700/70">
            Rien n’a été enregistré. Votre tableau de bord rassemble la suite :
            vos visiteurs, vos demandes et vos conversations. De nouveaux profils
            apparaîtront au fil des vérifications.
          </p>

          {/* ATTERRISSAGE (Lot G) : au bout du parcours, l'action principale
              ramène le membre à sa base. Le faire reboucler sur le même deck
              serait un tapis roulant — pas une démarche de mariage. */}
          <div className="mt-1 flex flex-col gap-2 sm:flex-row">
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-br from-choco-600 to-choco-800 px-5 py-2.5 text-sm font-semibold text-cream-50 shadow-[0_12px_30px_-12px_rgba(43,26,18,0.8)] ring-1 ring-inset ring-champagne-400/30 transition-transform hover:-translate-y-0.5"
            >
              <LayoutDashboard size={16} />
              Aller à mon tableau de bord
            </Link>
            <button
              type="button"
              onClick={() => setIndex(0)}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-champagne-500/40 bg-cream-50/60 px-5 py-2.5 text-sm font-semibold text-choco-700 transition-colors hover:bg-champagne-400/15"
            >
              <RotateCcw size={16} />
              Reprendre depuis le début
            </button>
            <Link
              href="/discover"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-champagne-500/40 bg-cream-50/60 px-5 py-2.5 text-sm font-semibold text-choco-700 transition-colors hover:bg-champagne-400/15"
            >
              <LayoutGrid size={16} />
              Vue en grille
            </Link>
          </div>
        </section>
      ) : (
        <>
          <article className="overflow-hidden rounded-[2rem] border border-champagne-500/30 bg-cream-50/60 shadow-card">
            {/* Média */}
            <div
              data-tour="explorer-photo"
              className="relative aspect-[4/5] bg-cream-100/50"
            >
              {courant.signedUrl ? (
                <div className="relative h-full w-full overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={courant.signedUrl}
                    alt={`Photo de ${courant.first_name ?? "ce membre"}`}
                    className={
                      courant.is_blurred
                        ? "h-full w-full scale-110 object-cover blur-md"
                        : "h-full w-full object-cover"
                    }
                  />
                  {courant.is_blurred ? (
                    <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-ink-900/55 px-2.5 py-1 text-[10px] font-medium text-cream-50">
                      <Lock size={10} />
                      Photo protégée
                    </span>
                  ) : null}
                </div>
              ) : courant.is_blurred ? (
                <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-6 text-center text-ink-700/45">
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
                  <UserRound size={36} />
                </div>
              )}

              <span className="absolute left-3 top-3 inline-flex items-center rounded-full bg-choco-700/85 px-2.5 py-1 text-xs font-medium text-cream-50">
                {UNIVERSE_LABEL[universe]}
              </span>
              <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full border border-emerald-600/30 bg-emerald-600/15 px-2.5 py-1 text-xs font-medium text-emerald-800 backdrop-blur">
                <BadgeCheck size={12} />
                Profil vérifié
              </span>
            </div>

            {/* Corps */}
            <div className="flex flex-col gap-3 p-5">
              <h2 className="font-serif text-2xl font-semibold text-choco-700">
                {courant.first_name ?? "Membre"}
                {typeof courant.age === "number" ? `, ${courant.age}` : ""}
              </h2>

              {courant.city || courant.country ? (
                <p className="flex items-center gap-1.5 text-sm text-ink-700/70">
                  <MapPin size={14} className="shrink-0 text-choco-600" />
                  {[courant.city, courant.country].filter(Boolean).join(" · ")}
                </p>
              ) : null}

              {courant.marital_status ? (
                <span className="inline-flex w-fit items-center rounded-full border border-champagne-500/40 bg-cream-100/50 px-2.5 py-1 text-xs font-medium text-choco-700">
                  {MARITAL_LABEL[courant.marital_status]}
                </span>
              ) : null}

              {/* Détail : SEUL point d'entrée d'une visite. La clé force un
                  composant neuf à chaque profil — sans elle, le détail du
                  précédent resterait ouvert sur le suivant. */}
              <div data-tour="explorer-detail" className="flex flex-col">
                <CandidateDetailsToggle
                  key={courant.id}
                  targetId={courant.id}
                />
              </div>
            </div>
          </article>

          {/* Barre d'actions */}
          <div
            data-tour="explorer-actions"
            className="sticky bottom-4 z-10 flex items-center gap-2 rounded-full border border-champagne-500/30 bg-cream-50/95 p-2 shadow-card backdrop-blur"
          >
            <button
              type="button"
              onClick={suivant}
              aria-label="Passer au profil suivant"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-champagne-500/40 bg-cream-50 text-ink-700/60 transition-colors hover:bg-champagne-400/15 hover:text-choco-700"
            >
              <X size={18} />
            </button>

            <div className="flex min-w-0 flex-1 flex-col">
              <InterestButton
                key={`interet-${courant.id}`}
                targetId={courant.id}
                universe={universe}
                initial={initialStates[courant.id]}
              />
            </div>

            <div className="flex flex-col">
              <FavoriteButton
                key={`favori-${courant.id}`}
                targetId={courant.id}
                initialFavorited={favoriteIds.includes(courant.id)}
              />
            </div>
          </div>

          <p className="px-1 text-center text-xs text-ink-700/50">
            Astuce : les flèches → et ↓ passent au profil suivant.
          </p>
        </>
      )}
    </div>
  );
}
