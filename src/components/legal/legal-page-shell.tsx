import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Logo } from "@/components/landing/logo";

/**
 * Gabarit partagé des pages publiques d’aide et légales (liens du footer).
 *
 * Pages autonomes, volontairement SANS la navbar/footer de la landing : leurs
 * liens d’ancre (#concept, #faq…) ne résolvent que sur la page d’accueil.
 * En-tête calqué sur /partager (logo + retour accueil). Purement
 * présentationnel : aucune logique d’auth, aucune requête.
 */

/**
 * Adresse de contact unique, réutilisée par toutes les pages d’aide/légales
 * (boîte officielle hébergée chez Hostinger).
 */
export const CONTACT_EMAIL = "contact@kassalafam.com";

/** Téléphone professionnel de l’éditeur, tel qu’affiché sur les pages légales. */
export const CONTACT_PHONE = "+237 691 849 494";

/** Valeur du lien `tel:` correspondant à {@link CONTACT_PHONE}. */
export const CONTACT_PHONE_HREF = "tel:+237691849494";

/** Courriel officiel de l’éditeur (TITANEX SARL). */
export const EDITOR_EMAIL = "titanex.cm@gmail.com";

/** Classe des liens texte des pages légales (celle de {@link ContactEmailLink}). */
export const LEGAL_LINK_CLASS =
  "font-medium text-choco-600 underline decoration-champagne-500/50 underline-offset-2 transition-colors hover:text-choco-800";

export function LegalPageShell({
  title,
  intro,
  updatedAt,
  children,
}: {
  title: string;
  intro?: string;
  /** Date de dernière mise à jour affichée sous le titre. */
  updatedAt?: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 py-8 sm:px-6 sm:py-12">
      {/* En-tête : logo + retour accueil (même gabarit que /partager) */}
      <div className="flex items-center justify-between gap-4">
        <Link href="/" aria-label="Retour à l’accueil KASSALAFAM">
          <Logo className="[&_span]:text-base" />
        </Link>
        <Link
          href="/"
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-champagne-500/30 bg-cream-100/60 px-4 py-2 text-sm font-medium text-choco-700 transition-colors hover:bg-champagne-400/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-champagne-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-cream-50"
        >
          <ArrowLeft size={16} />
          <span className="hidden sm:inline">Accueil</span>
        </Link>
      </div>

      <header className="mt-8 sm:mt-10">
        <h1 className="font-serif text-3xl font-semibold text-choco-700 sm:text-4xl">
          {title}
        </h1>
        {updatedAt ? (
          <p className="mt-2 text-xs text-ink-700/55">
            Dernière mise à jour : {updatedAt}
          </p>
        ) : null}
        {intro ? (
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-700/75 sm:text-base">
            {intro}
          </p>
        ) : null}
      </header>

      <div className="mt-8 flex flex-col gap-6 sm:mt-10">{children}</div>

      <footer className="mt-12 border-t border-champagne-500/20 pt-6 text-xs text-ink-700/55">
        © {new Date().getFullYear()} KASSALAFAM — Mariage à Tout Prix. Tous
        droits réservés.
      </footer>
    </main>
  );
}

/** Section encadrée, ancrable (id) pour les liens directs type /aide#contact. */
export function LegalSection({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-24 rounded-3xl border border-champagne-500/25 bg-cream-100/40 p-5 sm:p-7"
    >
      <h2 className="font-serif text-lg font-semibold text-choco-700">
        {title}
      </h2>
      <div className="mt-3 flex flex-col gap-3 text-sm leading-relaxed text-ink-700/80">
        {children}
      </div>
    </section>
  );
}

/**
 * Adresse de contact stylée. Tant que la valeur est un placeholder
 * « [À …] », rend un simple texte mis en évidence (pas de lien mailto vers
 * une adresse inexistante) ; avec une vraie adresse, rend le lien mailto.
 */
export function ContactEmailLink() {
  if (CONTACT_EMAIL.startsWith("[")) {
    return (
      <span className="rounded bg-champagne-400/20 px-1.5 py-0.5 font-medium text-choco-700">
        {CONTACT_EMAIL}
      </span>
    );
  }
  return (
    <a href={`mailto:${CONTACT_EMAIL}`} className={LEGAL_LINK_CLASS}>
      {CONTACT_EMAIL}
    </a>
  );
}
