import { Suspense } from "react";
import Link from "next/link";
import { Compass, Sparkles } from "lucide-react";

import { DiscoverFeedSkeleton } from "@/components/member/discover-feed-skeleton";
import { ExplorerFeed } from "@/components/member/explorer-feed";
import { PageBackNav } from "@/components/member/page-back-nav";

/**
 * Explorer (Lot F) — parcours des profils un par un.
 *
 * Deuxième façon de parcourir, à côté de la grille par univers : mêmes
 * profils, mêmes gardes, mêmes écritures. La grille n'est pas remplacée — un
 * membre habitué à balayer une liste ne doit rien perdre.
 *
 * Accès protégé par le proxy (préfixe « /explorer ») au même titre que
 * « /discover », et soumis à la même garde d'onboarding.
 */
export const metadata = {
  title: "Explorer — KASSALAFAM",
};

export default function ExplorerPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageBackNav />

      <section>
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-champagne-600">
          Espace membre
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-serif text-3xl font-semibold text-choco-700 sm:text-4xl">
            Explorer
          </h1>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-champagne-500/40 bg-champagne-400/15 px-3 py-1 text-xs font-medium text-choco-700">
            <Sparkles size={13} />
            Un profil à la fois
          </span>
        </div>
        <p className="mt-3 max-w-2xl text-ink-700/75">
          Les profils vérifiés de votre univers, présentés un par un. Faire
          défiler n’enregistre rien : seule l’ouverture du détail compte comme
          une visite.
        </p>
      </section>

      <Suspense fallback={<DiscoverFeedSkeleton />}>
        <ExplorerFeed />
      </Suspense>

      <section className="flex flex-col gap-3 sm:flex-row">
        <Link
          href="/discover"
          className="inline-flex items-center justify-center gap-2 rounded-full border border-champagne-500/40 bg-cream-50/60 px-5 py-2.5 text-sm font-semibold text-choco-700 transition-colors hover:bg-champagne-400/15"
        >
          <Compass size={16} />
          Retour à la découverte
        </Link>
      </section>
    </div>
  );
}
