import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Lock, ShieldCheck } from "lucide-react";

import { getPublicSharedProfile } from "@/lib/server/public-profile-share";
import { Logo } from "@/components/landing/logo";
import { SharedProfileCard } from "@/components/share/shared-profile-card";

/**
 * Partage PR3 — Page PUBLIQUE limitée d'un profil partagé.
 *
 * Server Component sans session : la route n'est dans aucun préfixe protégé du
 * middleware. La validité du lien est revérifiée à CHAQUE requête
 * (`force-dynamic`, aucune revalidation persistante) : révocation, expiration,
 * retrait de consentement ou suspension rendent immédiatement un 404 générique
 * UNIFORME, sans jamais révéler la cause. Aucun contact direct, aucune
 * coordonnée, aucune donnée technique n'est rendue ; le jeton n'est jamais
 * journalisé ni transmis à un composant client.
 */

export const dynamic = "force-dynamic";

// Métadonnées 100 % génériques : aucune donnée personnelle, aucun canonical
// (l'URL au jeton ne doit être ni indexée, ni archivée, ni référencée) ;
// referrer no-referrer : l'URL contenant le jeton ne doit jamais fuiter en
// en-tête Referer, même vers une page interne.
export const metadata: Metadata = {
  title: "Profil partagé — KASSALAFAM | Mariage à Tout Prix",
  description:
    "Présentation limitée d’un profil partagé avec le consentement de son titulaire sur KASSALAFAM, la plateforme de mariage sérieuse et confidentielle.",
  robots: { index: false, follow: false, noarchive: true },
  referrer: "no-referrer",
};

const LEGAL_LINKS = [
  { href: "/mentions-legales", label: "Mentions légales" },
  { href: "/confidentialite", label: "Confidentialité" },
  { href: "/conditions-utilisation", label: "Conditions d’utilisation" },
];

export default async function SharedProfilePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Refus immédiat des valeurs vides ; toute autre forme invalide est rejetée
  // par resolveShareToken (même 404 uniforme, sans requête inutile).
  if (!token) notFound();

  const profile = await getPublicSharedProfile(token);
  if (!profile) notFound();

  // Photo servie par l'endpoint interne de diffusion contrôlée : le chemin ne
  // contient QUE le jeton (déjà présent dans l'URL publique) — jamais d'UUID,
  // de storage_path ni d'URL Supabase.
  const photoSrc = profile.hasPublicPhoto
    ? `/p/${encodeURIComponent(token)}/photo`
    : null;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 py-8 sm:px-6 sm:py-12">
      {/* En-tête : identité KASSALAFAM + retour accueil (gabarit /partager) */}
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

      {/* Mention de consentement */}
      <p className="mt-8 inline-flex items-start gap-2 rounded-2xl border border-champagne-500/25 bg-cream-100/40 px-4 py-3 text-xs leading-relaxed text-ink-700/75 sm:mt-10">
        <ShieldCheck
          size={16}
          className="mt-0.5 shrink-0 text-emerald-700"
          aria-hidden
        />
        Profil partagé avec le consentement de son titulaire. KASSALAFAM
        n’affiche ici qu’une présentation limitée et vérifiée.
      </p>

      {/* Carte de présentation limitée */}
      <div className="mt-6">
        <SharedProfileCard profile={profile} photoSrc={photoSrc} />
      </div>

      {/* Rappel de confidentialité */}
      <p className="mt-4 inline-flex items-start gap-2 text-xs leading-relaxed text-ink-700/55">
        <Lock size={14} className="mt-0.5 shrink-0" aria-hidden />
        Aucune coordonnée personnelle n’est affichée. Pour faire connaissance,
        rejoignez KASSALAFAM : les échanges se font uniquement au sein de la
        plateforme, dans un cadre vérifié et confidentiel.
      </p>

      {/* CTA interne */}
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

      {/* Pied de page : liens juridiques internes uniquement */}
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
