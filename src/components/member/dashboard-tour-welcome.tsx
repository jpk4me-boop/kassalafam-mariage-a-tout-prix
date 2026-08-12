"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Compass, PartyPopper, X } from "lucide-react";

/**
 * Bandeau d'atterrissage (Lot G) — le point d'arrivée du nouveau membre.
 *
 * Il n'apparaît qu'une fois : dans les 24 heures qui suivent la FIN de la
 * visite guidée (`profiles.tour_completed_at`, migration 65), et se ferme
 * définitivement dès que le membre l'écarte.
 *
 * Pourquoi une fenêtre de 24 h et pas une colonne de plus en base : le témoin
 * de visite suffit à savoir qu'on est juste après le premier tour. Ajouter une
 * colonne « bandeau vu » ferait une migration pour un bandeau — trop cher pour
 * ce que ça rend. Le repli local ferme le cas du membre qui l'écarte tout de
 * suite.
 */

const CLE_REPLI = "kassalafam_bandeau_atterrissage_ferme";

const FENETRE_MS = 24 * 60 * 60 * 1000;

export function DashboardTourWelcome({
  tourCompletedAt,
  firstName,
}: {
  tourCompletedAt: string | null;
  firstName: string | null;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!tourCompletedAt) return;

    const fin = new Date(tourCompletedAt).getTime();

    if (!Number.isFinite(fin)) return;
    if (Date.now() - fin > FENETRE_MS) return;

    let ferme = false;
    try {
      ferme = window.localStorage.getItem(CLE_REPLI) !== null;
    } catch {
      // localStorage indisponible : on affiche, ce n'est pas bloquant.
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!ferme) setVisible(true);
  }, [tourCompletedAt]);

  if (!visible) return null;

  function fermer() {
    setVisible(false);
    try {
      window.localStorage.setItem(CLE_REPLI, "1");
    } catch {
      // ignore
    }
  }

  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-champagne-500/30 bg-gradient-to-br from-choco-700 via-choco-800 to-choco-900 p-6 text-cream-50 shadow-card sm:p-8">
      <button
        type="button"
        onClick={fermer}
        aria-label="Fermer ce message"
        className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-cream-100/60 transition-colors hover:bg-cream-50/10 hover:text-cream-50"
      >
        <X size={16} />
      </button>

      <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-champagne-400/20 text-champagne-300 ring-1 ring-inset ring-champagne-300/25">
        <PartyPopper size={20} />
      </span>

      <h2 className="mt-4 font-serif text-2xl font-semibold sm:text-3xl">
        {firstName ? `${firstName}, vous avez fait le tour.` : "Vous avez fait le tour."}
      </h2>

      <p className="mt-2 max-w-2xl text-sm leading-7 text-cream-100/80">
        Ce tableau de bord est votre base : l’état de votre profil, vos visiteurs,
        vos demandes et vos conversations s’y retrouvent. La découverte, elle,
        reste à un clic.
      </p>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Link
          href="/explorer"
          className="inline-flex items-center justify-center gap-2 rounded-full bg-champagne-400/20 px-5 py-2.5 text-sm font-semibold text-cream-50 ring-1 ring-inset ring-champagne-300/40 transition-transform hover:-translate-y-0.5"
        >
          <Compass size={16} />
          Reprendre l’Explorer
          <ArrowRight size={16} />
        </Link>
        <Link
          href="/profile"
          className="inline-flex items-center justify-center gap-2 rounded-full border border-cream-100/25 px-5 py-2.5 text-sm font-semibold text-cream-50 transition-colors hover:bg-cream-50/10"
        >
          Compléter mon profil
        </Link>
      </div>
    </section>
  );
}
