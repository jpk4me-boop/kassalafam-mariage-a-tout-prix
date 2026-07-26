import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Lock } from "lucide-react";

import { Logo } from "@/components/landing/logo";
import { PublicCandidateProfile } from "@/components/showcase/public-candidate-profile";
import { candidateUniverseLabel } from "@/lib/showcase/labels";
import {
  getPublicCandidateShowcase,
  isPublicCandidateSlug,
} from "@/lib/server/public-candidate-showcase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type CandidatePageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: CandidatePageProps): Promise<Metadata> {
  const { slug } = await params;
  if (!isPublicCandidateSlug(slug)) {
    return {
      title: "Profil indisponible | KASSALAFAM",
      robots: { index: false, follow: false, noarchive: true },
    };
  }

  const candidate = await getPublicCandidateShowcase(slug);
  if (!candidate) {
    return {
      title: "Profil indisponible | KASSALAFAM",
      description: "Cette présentation publique n’est plus disponible.",
      robots: { index: false, follow: false, noarchive: true },
    };
  }

  const title = `${candidate.firstName}, ${candidate.age} ans — Profil vérifié | KASSALAFAM`;
  const description = `${candidate.firstName}, ${candidate.age} ans, à ${candidate.city}. ${candidateUniverseLabel(candidate.universe)} et projet de mariage sérieux sur KASSALAFAM.`;
  const canonical = `/candidats/${candidate.slug}`;
  const photo = `${canonical}/photo`;

  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description,
      type: "website",
      url: canonical,
      siteName: "KASSALAFAM",
      locale: "fr_FR",
      images: [
        {
          url: photo,
          alt: `Photo publique choisie par ${candidate.firstName}`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [photo],
    },
  };
}

const LEGAL_LINKS = [
  { href: "/mentions-legales", label: "Mentions légales" },
  { href: "/confidentialite", label: "Confidentialité" },
  { href: "/conditions-utilisation", label: "Conditions d’utilisation" },
];

export default async function CandidatePage({ params }: CandidatePageProps) {
  const { slug } = await params;
  if (!isPublicCandidateSlug(slug)) notFound();

  const candidate = await getPublicCandidateShowcase(slug);
  if (!candidate) notFound();

  return (
    <main className="min-h-dvh bg-[radial-gradient(circle_at_top,rgba(230,196,132,0.16),transparent_36%)] px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-6xl">
        <header className="flex items-center justify-between gap-4">
          <Link href="/" aria-label="Retour à l’accueil KASSALAFAM">
            <Logo />
          </Link>
          <Link
            href="/candidats"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-champagne-500/30 bg-cream-100/65 px-4 py-2 text-sm font-medium text-choco-700 transition-colors hover:bg-champagne-400/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-champagne-500/60"
          >
            <ArrowLeft size={16} aria-hidden />
            Tous les candidats
          </Link>
        </header>

        <div className="mt-10 sm:mt-14">
          <PublicCandidateProfile candidate={candidate} />
        </div>

        <section className="mx-auto mt-8 flex max-w-3xl flex-col items-center rounded-[2rem] border border-champagne-500/25 bg-cream-50/75 px-6 py-9 text-center shadow-[0_22px_60px_-42px_rgba(43,26,18,0.5)] sm:px-10">
          <p className="inline-flex items-start gap-2 text-sm leading-7 text-ink-700/70">
            <Lock size={16} className="mt-1 shrink-0 text-champagne-600" aria-hidden />
            Aucune prise de contact directe n’est possible depuis cette page. Les
            échanges se déroulent uniquement dans KASSALAFAM, après accord mutuel.
          </p>
          <Link
            href="/register"
            className="mt-6 inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full bg-gradient-to-br from-choco-600 to-choco-800 px-6 py-3 text-sm font-semibold text-cream-50 shadow-[0_12px_30px_-12px_rgba(43,26,18,0.8)] ring-1 ring-inset ring-champagne-400/30 transition-transform hover:-translate-y-0.5"
          >
            Créer mon profil
            <ArrowRight size={16} aria-hidden />
          </Link>
        </section>

        <footer className="mt-14 border-t border-champagne-500/20 pt-6 text-xs text-ink-700/55">
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
