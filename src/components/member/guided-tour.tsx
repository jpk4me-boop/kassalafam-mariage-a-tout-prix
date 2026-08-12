"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { ArrowRight, Check, Sparkles } from "lucide-react";

import { createClient } from "@/lib/supabase/client";

/**
 * Visite guidée du premier passage (Lot E).
 *
 * Des bulles ancrées sur les VRAIS boutons de l'écran, avec un halo qui découpe
 * un trou dans le voile sombre : le membre voit ce dont on lui parle, à sa
 * place, pas une capture d'écran.
 *
 * RÈGLES TENUES ICI :
 *   · une seule fois par PERSONNE — le témoin vit dans `profiles.tour_completed_at`
 *     (migration 65), pas dans le navigateur. Le localStorage n'est qu'un filet
 *     pour éviter un clignotement si l'écriture échoue ou tarde ;
 *   · « Passer la visite » est visible à CHAQUE étape et compte comme vue :
 *     personne n'est retenu prisonnier d'un tutoriel ;
 *   · une ancre absente n'est jamais bloquante : la bulle se recentre et la
 *     visite continue. Un écran vide ou une carte manquante ne doit pas figer
 *     la découverte ;
 *   · aucun texte ne promet une fonction non livrée (règle d'honnêteté).
 */

export type TourStep = {
  /** Valeur de l'attribut `data-tour` à mettre en avant. Absent = bulle centrée. */
  anchor?: string;
  title: string;
  body: string;
};

/** Filet local — le témoin qui fait autorité reste en base. */
const REPLI_KEY = "kassalafam_tour_decouverte_vue";

type Spot = { top: number; left: number; width: number; height: number };

const MARGE = 10;

export function GuidedTour({
  steps,
  active,
}: {
  steps: TourStep[];
  active: boolean;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [index, setIndex] = useState(0);
  const [spot, setSpot] = useState<Spot | null>(null);
  const boutonRef = useRef<HTMLButtonElement | null>(null);

  const etape = steps[index];
  const derniere = index === steps.length - 1;

  // Ouverture différée au montage : on ne lit le repli local qu'ensuite, pour
  // ne créer aucun décalage d'hydratation.
  useEffect(() => {
    if (!active || steps.length === 0) return;

    let dejaVue = false;
    try {
      dejaVue = window.localStorage.getItem(REPLI_KEY) !== null;
    } catch {
      // localStorage indisponible : la base fait foi, on ouvre.
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!dejaVue) setOuvert(true);
  }, [active, steps.length]);

  // Mesure de l'ancre de l'étape courante.
  const mesurer = useCallback(() => {
    if (!ouvert || !etape) return;

    if (!etape.anchor) {
      setSpot(null);
      return;
    }

    const cible = document.querySelector<HTMLElement>(
      `[data-tour="${etape.anchor}"]`,
    );

    // Ancre absente : on ne bloque pas, la bulle se recentre.
    if (!cible) {
      setSpot(null);
      return;
    }

    const r = cible.getBoundingClientRect();
    const vh = window.innerHeight;
    const vw = window.innerWidth;

    // Le halo est BORNÉ À L'ÉCRAN, et à la moitié de sa hauteur.
    //
    // Constaté en production le 12/08 : la photo d'une carte de découverte
    // mesure 596 × 1059 px dans une fenêtre de 855 px de haut. Sans borne, le
    // trou déborde de tous les côtés : le voile n'apparaît plus, la bulle se
    // pose sur la photo, et la mise en avant ne montre plus rien. Mieux vaut
    // encadrer le HAUT d'un grand élément que prétendre l'entourer en entier.
    const hauteurMax = Math.round(vh * 0.5);

    const hauteurVoulue = r.height + MARGE * 2;
    const height = Math.max(48, Math.min(hauteurVoulue, hauteurMax));

    const largeurVoulue = r.width + MARGE * 2;
    const width = Math.max(48, Math.min(largeurVoulue, vw - MARGE * 2));

    const top = Math.max(
      MARGE,
      Math.min(r.top - MARGE, vh - MARGE - height),
    );
    const left = Math.max(
      MARGE,
      Math.min(r.left - MARGE, vw - MARGE - width),
    );

    setSpot({ top, left, width, height });
  }, [ouvert, etape]);

  // Amener l'ancre dans le champ de vision, puis mesurer.
  useEffect(() => {
    if (!ouvert || !etape) return;

    const cible = etape.anchor
      ? document.querySelector<HTMLElement>(`[data-tour="${etape.anchor}"]`)
      : null;

    if (cible) {
      // Un élément plus haut que l'écran ne se « centre » pas : on l'amène par
      // le haut, sinon son sommet part hors champ et le halo semble flotter.
      const grand =
        cible.getBoundingClientRect().height > window.innerHeight * 0.6;

      cible.scrollIntoView({
        block: grand ? "start" : "center",
        behavior: "smooth",
      });
    }

    // Le défilement doux dure plus longtemps qu'une mesure unique — et sa durée
    // dépend de la distance, donc d'aucun délai devinable. On suit le mouvement
    // IMAGE PAR IMAGE jusqu'à ce que l'ancre s'immobilise, avec un plafond de
    // sécurité pour ne jamais tourner en boucle.
    let annule = false;
    let precedent = Number.NaN;
    let stables = 0;
    const debut = performance.now();

    function suivre() {
      if (annule) return;

      mesurer();

      const actuel = cible?.getBoundingClientRect().top ?? 0;
      stables = actuel === precedent ? stables + 1 : 0;
      precedent = actuel;

      // Trois images identiques = la page ne bouge plus. Plafond : 2 secondes.
      if (stables < 3 && performance.now() - debut < 2000) {
        window.requestAnimationFrame(suivre);
      }
    }

    window.requestAnimationFrame(suivre);

    return () => {
      annule = true;
    };
  }, [ouvert, etape, mesurer]);

  // `scrollend` là où il existe : la mesure définitive, sans deviner un délai.
  useEffect(() => {
    if (!ouvert) return;
    if (!("onscrollend" in window)) return;

    window.addEventListener("scrollend", mesurer);
    return () => window.removeEventListener("scrollend", mesurer);
  }, [ouvert, mesurer]);

  useEffect(() => {
    if (!ouvert) return;

    window.addEventListener("resize", mesurer);
    window.addEventListener("scroll", mesurer, true);
    return () => {
      window.removeEventListener("resize", mesurer);
      window.removeEventListener("scroll", mesurer, true);
    };
  }, [ouvert, mesurer]);

  useEffect(() => {
    if (ouvert) boutonRef.current?.focus();
  }, [ouvert, index]);

  const terminer = useCallback(async () => {
    setOuvert(false);

    // Repli local d'abord : même si le réseau tombe, la visite ne revient pas
    // dans la seconde qui suit.
    try {
      window.localStorage.setItem(REPLI_KEY, "1");
    } catch {
      // ignore
    }

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { error } = await supabase
        .from("profiles")
        .update({ tour_completed_at: new Date().toISOString() })
        .eq("id", user.id);

      if (error) {
        // Non bloquant : le membre a fini sa visite, on ne lui montre rien.
        console.error("[visite guidée] témoin non enregistré:", error.message);
      }
    } catch (e) {
      console.error("[visite guidée] témoin non enregistré:", e);
    }
  }, []);

  // Échap = passer. Une visite dont on ne peut pas sortir est une nuisance.
  useEffect(() => {
    if (!ouvert) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        void terminer();
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ouvert, terminer]);

  if (!ouvert || !etape) return null;

  // La bulle va dans la plus grande bande LIBRE : sous le halo, au-dessus, ou
  // centrée s'il n'y a pas d'ancre. Elle ne doit jamais recouvrir ce qu'elle
  // désigne — sinon la mise en avant ne sert à rien.
  const hauteurEstimee = 230;
  const hauteurFenetre =
    typeof window === "undefined" ? 0 : window.innerHeight;

  const placeDessous =
    spot !== null &&
    hauteurFenetre - (spot.top + spot.height) >= hauteurEstimee + 24;
  const placeDessus = spot !== null && spot.top >= hauteurEstimee + 24;

  const styleBulle: CSSProperties =
    spot === null
      ? { top: "50%", left: "50%", transform: "translate(-50%, -50%)" }
      : placeDessous
        ? {
            top: spot.top + spot.height + 12,
            left: "50%",
            transform: "translateX(-50%)",
          }
        : placeDessus
          ? {
              top: spot.top - hauteurEstimee - 12,
              left: "50%",
              transform: "translateX(-50%)",
            }
          : // Écran trop court des deux côtés : on ancre la bulle en bas, là où
            // le pouce l'atteint, plutôt que de la centrer sur le halo.
            {
              bottom: 16,
              left: "50%",
              transform: "translateX(-50%)",
            };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="visite-guidee-titre"
      className="fixed inset-0 z-[70]"
    >
      {/* Voile. Sans ancre, il couvre tout ; avec ancre, le halo perce le trou. */}
      {spot === null ? (
        <div className="absolute inset-0 bg-ink-900/70" aria-hidden="true" />
      ) : (
        <div
          aria-hidden="true"
          /* AUCUNE transition sur la position : constaté en production le
             12/08, un `transition-all duration-300` fait poursuivre la cible au
             halo avec un temps de retard — pendant un défilement, il reste
             visiblement décalé (302 px mesurés). Le halo doit être PUNAISÉ sur
             son ancre, pas l'animer. */
          className="pointer-events-none absolute rounded-3xl ring-4 ring-champagne-300/90"
          style={{
            top: spot.top,
            left: spot.left,
            width: spot.width,
            height: spot.height,
            boxShadow: "0 0 0 9999px rgba(43, 26, 18, 0.72)",
          }}
        />
      )}

      {/* Bulle */}
      <div
        className="absolute w-[min(22rem,calc(100vw-2rem))] rounded-3xl border border-champagne-500/30 bg-cream-50 p-5 text-center shadow-[0_30px_80px_-30px_rgba(43,26,18,0.9)]"
        style={styleBulle}
      >
        <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-champagne-400/20 text-choco-600">
          <Sparkles size={18} />
        </span>

        <h2
          id="visite-guidee-titre"
          className="mt-3 font-serif text-xl font-semibold text-choco-700"
        >
          {etape.title}
        </h2>

        <p className="mt-2 text-sm leading-6 text-ink-700/75">{etape.body}</p>

        {/* Progression */}
        <ul className="mt-4 flex items-center justify-center gap-1.5" aria-hidden="true">
          {steps.map((s, i) => (
            <li
              key={s.title}
              className={
                i === index
                  ? "h-1.5 w-5 rounded-full bg-choco-600"
                  : "h-1.5 w-1.5 rounded-full bg-champagne-500/40"
              }
            />
          ))}
        </ul>

        <p className="sr-only">
          Étape {index + 1} sur {steps.length}
        </p>

        <div className="mt-4 flex flex-col gap-2">
          <button
            ref={boutonRef}
            type="button"
            onClick={() => (derniere ? void terminer() : setIndex(index + 1))}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-br from-choco-600 to-choco-800 px-5 py-2.5 text-sm font-semibold text-cream-50 shadow-[0_12px_30px_-12px_rgba(43,26,18,0.8)] ring-1 ring-inset ring-champagne-400/30 transition-transform hover:-translate-y-0.5"
          >
            {derniere ? (
              <>
                <Check size={16} />
                C’est parti
              </>
            ) : (
              <>
                Suivant
                <ArrowRight size={16} />
              </>
            )}
          </button>

          {derniere ? null : (
            <button
              type="button"
              onClick={() => void terminer()}
              className="text-xs font-medium text-ink-700/55 underline-offset-4 transition-colors hover:text-ink-800 hover:underline"
            >
              Passer la visite
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
