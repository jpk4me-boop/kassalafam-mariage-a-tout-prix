"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Download } from "lucide-react";

import { getSiteUrl } from "@/lib/site-url";
import { Logo } from "@/components/landing/logo";
import { ShareActions } from "@/components/share/share-actions";

const APP_SHARE_TEXT =
  "Découvrez KASSALAFAM — Mariage à tout prix, la plateforme dédiée aux rencontres sérieuses en vue du mariage.";
const REGISTER_SHARE_TEXT =
  "Inscrivez-vous sur KASSALAFAM pour faire une rencontre sérieuse en vue du mariage.";

// L'origine est résolue côté client (via getSiteUrl) après hydratation : URL
// correcte en local, Preview Vercel et Production, sans jamais coder en dur
// d'URL et sans divergence d'hydratation (le serveur renvoie une chaîne vide).
const noopSubscribe = () => () => {};

export default function PartagerPage() {
  const origin = useSyncExternalStore(
    noopSubscribe,
    () => getSiteUrl(),
    () => "",
  );

  const appUrl = origin;
  const registerUrl = origin ? `${origin}/register` : "";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 py-8 sm:px-6 sm:py-12">
      {/* En-tête */}
      <div className="flex items-center justify-between gap-4">
        <Link href="/" aria-label="Retour à l'accueil KASSALAFAM">
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

      <header className="mt-8 text-center sm:mt-10">
        <h1 className="font-serif text-3xl font-semibold text-choco-700 sm:text-4xl">
          Partagez KASSALAFAM
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-ink-700/75 sm:text-base">
          Invitez une personne qui recherche une relation sérieuse en vue du
          mariage. Un simple partage peut faire naître une belle rencontre.
        </p>
      </header>

      {/* Bloc 1 — Partager l'application */}
      <section className="mt-8 rounded-3xl border border-champagne-500/25 bg-cream-100/40 p-5 sm:mt-10 sm:p-7">
        <h2 className="font-serif text-lg font-semibold text-choco-700">
          Partager l&apos;application
        </h2>
        <p className="mt-1 text-sm text-ink-700/70">
          Envoyez le lien de KASSALAFAM par le moyen de votre choix.
        </p>
        <ShareActions
          className="mt-5"
          variant="panel"
          url={appUrl}
          title="KASSALAFAM — Mariage à tout prix"
          text={APP_SHARE_TEXT}
        />
      </section>

      {/* Bloc 2 — QR d'inscription */}
      <section className="mt-6 rounded-3xl border border-champagne-500/25 bg-cream-100/40 p-5 sm:p-7">
        <h2 className="font-serif text-lg font-semibold text-choco-700">
          QR code d&apos;inscription
        </h2>
        <p className="mt-1 text-sm text-ink-700/70">
          Scannez ce QR code pour accéder à l&apos;inscription KASSALAFAM.
        </p>

        <div className="mt-5 flex flex-col items-center">
          <div className="rounded-2xl border border-champagne-500/30 bg-white p-4 shadow-[0_18px_40px_-28px_rgba(43,26,18,0.5)]">
            <Image
              src="/kassalafam-qr-inscription-small.png"
              alt="QR code menant à la page d'inscription de KASSALAFAM"
              width={490}
              height={490}
              // QR code : on sert le PNG d'origine sans optimisation, pour
              // garantir des modules nets (un rééchantillonnage rendrait le
              // code flou et potentiellement illisible au scan).
              unoptimized
              className="h-auto w-[200px] max-w-full sm:w-[240px]"
            />
          </div>

          <ShareActions
            className="mt-5"
            variant="compact"
            url={registerUrl}
            title="Inscription KASSALAFAM"
            text={REGISTER_SHARE_TEXT}
            leadingAction={
              <a
                href="/kassalafam-qr-inscription.png"
                download="kassalafam-qr-inscription.png"
                className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full border border-champagne-500/30 bg-cream-100/60 px-5 py-2.5 text-sm font-semibold text-choco-700 transition-colors hover:bg-champagne-400/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-champagne-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-cream-50"
              >
                <Download size={16} />
                Télécharger
              </a>
            }
          />
        </div>
      </section>

      <p className="mt-8 text-center text-xs leading-relaxed text-ink-700/55">
        Le lien de partage pointe toujours vers la version publique de
        KASSALAFAM.
      </p>
    </main>
  );
}
