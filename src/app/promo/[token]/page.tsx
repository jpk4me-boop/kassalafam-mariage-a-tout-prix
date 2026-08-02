import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Lock, ShieldCheck, Sparkles } from "lucide-react";

import { Logo } from "@/components/landing/logo";
import { SharedProfileCard } from "@/components/share/shared-profile-card";
import { getPublicPromotedProfile } from "@/lib/server/public-profile-promotion";

export const dynamic = "force-dynamic";

const SITE_URL = "https://kassalafam.com";

const LEGAL_LINKS = [
  { href: "/mentions-legales", label: "Mentions légales" },
  { href: "/confidentialite", label: "Confidentialité" },
  { href: "/conditions-utilisation", label: "Conditions d’utilisation" },
];

function metadataDescription(input: {
  firstName: string | null;
  age: number | null;
  city: string | null;
}): string {
  const name = input.firstName ?? "un membre vérifié";
  const age = input.age != null ? `, ${input.age} ans` : "";
  const city = input.city ? ` à ${input.city}` : "";

  return `Découvrez ${name}${age}${city}, présenté avec son autorisation sur KASSALAFAM, la plateforme de mariage sérieuse et confidentielle.`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const profile = token ? await getPublicPromotedProfile(token) : null;

  const title = profile?.firstName
    ? `${profile.firstName}, profil mariage sérieux — KASSALAFAM`
    : "Profil présenté — KASSALAFAM | Mariage à Tout Prix";

  const description = profile
    ? metadataDescription(profile)
    : "Présentation limitée d’un profil autorisé sur KASSALAFAM, la plateforme de mariage sérieuse et confidentielle.";

  const pageUrl = `${SITE_URL}/promo/${encodeURIComponent(token ?? "")}`;
  const photoUrl = `${pageUrl}/photo`;

  return {
    title,
    description,
    robots: { index: false, follow: false, noarchive: true },
    referrer: "no-referrer",
    openGraph: {
      title,
      description,
      url: pageUrl,
      siteName: "KASSALAFAM — Mariage à Tout Prix",
      locale: "fr_FR",
      type: "website",
      // Dimensions déclarées : sans elles, le robot social doit télécharger
      // puis mesurer l'image et renonce fréquemment, laissant une URL nue.
      images: profile
        ? [
            {
              url: photoUrl,
              width: 1200,
              height: 630,
              alt: `Photo de ${profile.firstName ?? "membre KASSALAFAM"}`,
            },
          ]
        : [],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: profile ? [photoUrl] : [],
    },
  };
}

export default async function PublicPromotionProfilePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!token) notFound();

  const profile = await getPublicPromotedProfile(token);
  if (!profile) notFound();

  const photoSrc = `/promo/${encodeURIComponent(token)}/photo`;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex items-center justify-between gap-4">
        <Link href="/" aria-label="Retour à l’accueil KASSALAFAM">
          <Logo className="[&_span]:text-base" />
        </Link>
        <Link
          href="/"
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-champagne-500/30 bg-cream-100/60 px-4 py-2 text-sm font-medium text-choco-700 transition-colors hover:bg-champagne-400/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-champagne-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-cream-50"
        >
          <span className="hidden sm:inline">Accueil</span>
          <ArrowRight size={16} />
        </Link>
      </div>

      <section className="mt-8 rounded-3xl border border-champagne-500/30 bg-gradient-to-br from-cream-100/70 to-champagne-400/10 px-5 py-5 sm:mt-10 sm:px-6">
        <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-champagne-700">
          <Sparkles size={15} aria-hidden />
          Présentation autorisée
        </p>
        <h1 className="mt-3 font-serif text-2xl font-semibold leading-tight text-choco-800 sm:text-3xl">
          Une rencontre sérieuse peut commencer ici.
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-700/75">
          Ce membre a choisi la photo, les réseaux autorisés et la durée de cette
          présentation. KASSALAFAM ne publie aucun profil automatiquement.
        </p>
      </section>

      <p className="mt-5 inline-flex items-start gap-2 rounded-2xl border border-champagne-500/25 bg-cream-100/40 px-4 py-3 text-xs leading-relaxed text-ink-700/75">
        <ShieldCheck
          size={16}
          className="mt-0.5 shrink-0 text-emerald-700"
          aria-hidden
        />
        Profil vérifié et présenté avec l’autorisation promotionnelle de son
        titulaire. Les conditions sont revérifiées à chaque ouverture du lien.
      </p>

      <div className="mt-6">
        <SharedProfileCard profile={profile} photoSrc={photoSrc} />
      </div>

      <p className="mt-4 inline-flex items-start gap-2 text-xs leading-relaxed text-ink-700/55">
        <Lock size={14} className="mt-0.5 shrink-0" aria-hidden />
        Aucune coordonnée personnelle n’est affichée. Les échanges et les prises
        de contact se font uniquement dans l’espace sécurisé KASSALAFAM.
      </p>

      <div className="mt-8 flex flex-col items-center gap-3">
        <Link
          href="/register"
          className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full bg-gradient-to-br from-choco-600 to-choco-800 px-6 py-3 text-sm font-semibold text-cream-50 shadow-[0_12px_30px_-12px_rgba(43,26,18,0.8)] ring-1 ring-inset ring-champagne-400/30 transition-transform hover:-translate-y-0.5"
        >
          Créer mon profil
          <ArrowRight size={16} />
        </Link>
        <Link
          href="/"
          className="text-sm font-medium text-choco-600 underline decoration-champagne-500/50 underline-offset-2 transition-colors hover:text-choco-800"
        >
          Découvrir KASSALAFAM
        </Link>
      </div>

      <footer className="mt-12 border-t border-champagne-500/20 pt-6 text-xs text-ink-700/55">
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
    </main>
  );
}