import { Suspense } from "react";
import Link from "next/link";
import { ArrowRight, Compass, UserRound } from "lucide-react";

import { PageBackNav } from "@/components/member/page-back-nav";
import { DiscoverFeed } from "@/components/member/discover-feed";
import { DiscoverFeedSkeleton } from "@/components/member/discover-feed-skeleton";
import type { DiscoveryUniverse } from "@/lib/types/database";

/**
 * Page d'univers de découverte (L3D-B PR2).
 *
 * Affiche désormais un FLUX RÉEL de profils compatibles (read-only) via
 * <DiscoverFeed>, dans le respect strict de la confidentialité (RPC sécurisée
 * + signature serveur des photos, voir DiscoverFeed). Le rendu des candidats est
 * encapsulé dans un <Suspense> avec squelette de chargement.
 *
 * Accès protégé par le middleware (préfixe « /discover »).
 */

const PRINCIPLES = [
  "Confidentialité",
  "Profils vérifiés",
  "Démarche de mariage sérieux",
];

export function DiscoverUniversePage({
  title,
  subtitle,
  description,
  universe,
}: {
  title: string;
  subtitle?: string;
  description: string;
  universe: DiscoveryUniverse;
}) {
  return (
    <div className="flex flex-col gap-8">
      <PageBackNav />

      <section>
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-champagne-600">
          Espace membre
        </p>
        <h1 className="mt-2 font-serif text-3xl font-semibold text-choco-700 sm:text-4xl">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1 text-sm font-medium uppercase tracking-wide text-champagne-600">
            {subtitle}
          </p>
        ) : null}
        <p className="mt-3 max-w-2xl text-ink-700/75">{description}</p>
      </section>

      {/* Rappel des principes */}
      <section className="rounded-3xl border border-champagne-500/30 bg-cream-100/50 p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {PRINCIPLES.map((principle, i) => (
            <span key={principle} className="flex items-center gap-2">
              {i > 0 ? (
                <span className="hidden text-champagne-500/70 sm:inline">•</span>
              ) : null}
              <span className="text-sm font-medium text-ink-800">
                {principle}
              </span>
            </span>
          ))}
        </div>
      </section>

      {/* Flux réel de profils compatibles */}
      <Suspense fallback={<DiscoverFeedSkeleton />}>
        <DiscoverFeed universe={universe} />
      </Suspense>

      {/* Liens utiles */}
      <section className="flex flex-col gap-3 sm:flex-row">
        <Link
          href="/discover"
          className="inline-flex items-center justify-center gap-2 rounded-full border border-champagne-500/40 bg-cream-50/60 px-5 py-2.5 text-sm font-semibold text-choco-700 transition-colors hover:bg-champagne-400/15"
        >
          <Compass size={16} />
          Modifier mon univers
        </Link>
        <Link
          href="/profile"
          className="inline-flex items-center justify-center gap-2 rounded-full border border-champagne-500/40 bg-cream-50/60 px-5 py-2.5 text-sm font-semibold text-choco-700 transition-colors hover:bg-champagne-400/15"
        >
          <UserRound size={16} />
          Compléter mon profil
          <ArrowRight size={16} />
        </Link>
      </section>
    </div>
  );
}
