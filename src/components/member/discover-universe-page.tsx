import Link from "next/link";
import { ArrowRight, Clock, Compass, UserRound } from "lucide-react";

import { PageBackNav } from "@/components/member/page-back-nav";

/**
 * Gabarit présentationnel d'une page d'univers de découverte (L3C-C).
 *
 * Page STATIQUE et sobre, toujours « en préparation ». Elle n'affiche AUCUN
 * profil membre, n'effectue aucune requête, et n'active ni matching, ni swipe,
 * ni chat. Elle rappelle le cadre (confidentialité, profils vérifiés, mariage
 * sérieux) et renvoie vers /discover (modifier le choix) et /profile.
 *
 * Accès protégé par le middleware (préfixe « /discover » dans
 * PROTECTED_PREFIXES couvre les sous-routes /discover/...).
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
}: {
  title: string;
  subtitle?: string;
  description: string;
}) {
  return (
    <div className="flex flex-col gap-8">
      <PageBackNav />

      <section>
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-champagne-600">
          Espace membre
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-serif text-3xl font-semibold text-choco-700 sm:text-4xl">
            {title}
          </h1>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-champagne-500/40 bg-champagne-400/15 px-3 py-1 text-xs font-medium text-choco-700">
            <Clock size={13} />
            En préparation
          </span>
        </div>
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

      {/* Note préparation */}
      <section className="rounded-3xl border border-champagne-500/30 bg-cream-50/60 p-6 shadow-card sm:p-8">
        <p className="text-sm text-ink-700/75">
          Cet espace ouvrira progressivement. Aucune mise en relation n’est
          encore active et aucun profil n’est affiché pour le moment. Vous pouvez
          ajuster votre univers ou compléter votre profil en attendant.
        </p>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/discover"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-br from-choco-600 to-choco-800 px-5 py-2.5 text-sm font-semibold text-cream-50 shadow-[0_12px_30px_-12px_rgba(43,26,18,0.8)] ring-1 ring-inset ring-champagne-400/30 transition-transform hover:-translate-y-0.5"
          >
            <Compass size={16} />
            Modifier mon univers
            <ArrowRight size={16} />
          </Link>
          <Link
            href="/profile"
            className="inline-flex items-center justify-center gap-2 rounded-full border border-champagne-500/40 bg-cream-50/60 px-5 py-2.5 text-sm font-semibold text-choco-700 transition-colors hover:bg-champagne-400/15"
          >
            <UserRound size={16} />
            Compléter mon profil
          </Link>
        </div>
      </section>
    </div>
  );
}
