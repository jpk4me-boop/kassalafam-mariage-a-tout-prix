import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ShieldCheck, UsersRound } from "lucide-react";

import { Logo } from "@/components/landing/logo";
import { PublicCandidateCard } from "@/components/showcase/public-candidate-card";
import { listPublicCandidateShowcases } from "@/lib/server/public-candidate-showcase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Candidats au mariage vérifiés | KASSALAFAM",
  description:
    "Découvrez gratuitement les présentations publiques de candidats vérifiés qui recherchent un projet de mariage sérieux sur KASSALAFAM.",
  alternates: { canonical: "/candidats" },
  openGraph: {
    title: "Candidats au mariage vérifiés | KASSALAFAM",
    description:
      "Parcourez gratuitement des profils publics, vérifiés et publiés avec le consentement de leurs titulaires.",
    type: "website",
    url: "/candidats",
    siteName: "KASSALAFAM",
    locale: "fr_FR",
  },
  twitter: {
    card: "summary_large_image",
    title: "Candidats au mariage vérifiés | KASSALAFAM",
    description:
      "Parcourez gratuitement des profils publics et vérifiés orientés vers un mariage sérieux.",
  },
};

const LEGAL_LINKS = [
  { href: "/mentions-legales", label: "Mentions légales" },
  { href: "/confidentialite", label: "Confidentialité" },
  { href: "/conditions-utilisation", label: "Conditions d’utilisation" },
];

export default async function CandidatesPage() {
  const candidates = await listPublicCandidateShowcases({ limit: 24, offset: 0 });

  return (
    <main className="min-h-dvh bg-[radial-gradient(circle_at_top,rgba(230,196,132,0.16),transparent_36%)] px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-6xl">
        <header className="flex items-center justify-between gap-4">
          <Link href="/" aria-label="Retour à l’accueil KASSALAFAM">
            <Logo />
          </Link>
          <Link
            href="/"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-champagne-500/30 bg-cream-100/65 px-4 py-2 text-sm font-medium text-choco-700 transition-colors hover:bg-champagne-400/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-champagne-500/60"
          >
            <ArrowLeft size={16} aria-hidden />
            Accueil
          </Link>
        </header>

        <section className="mx-auto mt-12 max-w-3xl text-center sm:mt-16">
          <p className="inline-flex items-center gap-2 rounded-full border border-champagne-500/25 bg-cream-100/55 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-choco-700">
            <ShieldCheck size={15} className="text-emerald-700" aria-hidden />
            Profils vérifiés et consentis
          </p>
          <h1 className="mt-5 font-serif text-4xl font-semibold text-choco-700 sm:text-5xl lg:text-6xl">
            Des candidats engagés dans un projet de mariage sérieux
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-8 text-ink-700/75 sm:text-lg">
            La consultation est gratuite. Chaque présentation est limitée aux
            informations choisies pour la vitrine publique et disparaît dès que
            son titulaire retire son consentement.
          </p>
        </section>

        {candidates.length > 0 ? (
          <section
            aria-label="Candidats publiés"
            className="mt-12 grid gap-6 sm:grid-cols-2 lg:mt-16 lg:grid-cols-3"
          >
            {candidates.map((candidate) => (
              <PublicCandidateCard key={candidate.slug} candidate={candidate} />
            ))}
          </section>
        ) : (
          <section className="mx-auto mt-14 max-w-xl rounded-[2rem] border border-champagne-500/25 bg-cream-50/75 px-6 py-12 text-center shadow-[0_22px_60px_-42px_rgba(43,26,18,0.5)]">
            <UsersRound
              size={48}
              strokeWidth={1.35}
              className="mx-auto text-champagne-600"
              aria-hidden
            />
            <h2 className="mt-5 font-serif text-2xl font-semibold text-choco-700">
              Les premières présentations arrivent bientôt
            </h2>
            <p className="mt-3 text-sm leading-7 text-ink-700/70">
              Aucun profil n’est rendu public automatiquement. Les candidats
              apparaissent ici uniquement après avoir donné leur consentement et
              choisi leur photo publique.
            </p>
          </section>
        )}

        <section className="mx-auto mt-14 flex max-w-3xl flex-col items-center rounded-[2rem] border border-champagne-500/25 bg-gradient-to-br from-cream-100/80 to-champagne-400/10 px-6 py-10 text-center sm:px-10">
          <h2 className="font-serif text-3xl font-semibold text-choco-700">
            Vous recherchez aussi un mariage sérieux ?
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-7 text-ink-700/70">
            Créez votre profil vérifié. Les échanges restent privés dans
            KASSALAFAM et ne s’ouvrent qu’après accord mutuel.
          </p>
          <Link
            href="/register"
            className="mt-6 inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full bg-gradient-to-br from-choco-600 to-choco-800 px-6 py-3 text-sm font-semibold text-cream-50 shadow-[0_12px_30px_-12px_rgba(43,26,18,0.8)] ring-1 ring-inset ring-champagne-400/30 transition-transform hover:-translate-y-0.5"
          >
            Créer mon profil
            <ArrowRight size={16} aria-hidden />
          </Link>
        </section>

        <footer className="mt-16 border-t border-champagne-500/20 pt-6 text-xs text-ink-700/55">
          <nav className="flex flex-wrap gap-x-4 gap-y-2">
            {LEGAL_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="transition-colors hover:text-choco-700"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <p className="mt-4">
            © {new Date().getFullYear()} KASSALAFAM — Mariage à Tout Prix. Tous
            droits réservés.
          </p>
        </footer>
      </div>
    </main>
  );
}
