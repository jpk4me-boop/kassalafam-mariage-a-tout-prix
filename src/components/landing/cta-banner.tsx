import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Reveal } from "./reveal";

/**
 * Bandeau CTA fin, pleine largeur — placé AVANT les tarifs (inspiration :
 * bande « Ta moitié t'attend » des plateformes concurrentes). Distinct du
 * grand bloc CTA de fin de page : ici une seule ligne, un seul bouton.
 */
export function CtaBanner() {
  return (
    <section aria-label="Créer votre profil" className="relative">
      <div className="bg-gradient-to-r from-choco-700 via-choco-700 to-choco-800">
        <Reveal>
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-5 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between md:py-12">
            <div>
              <h2 className="font-serif text-2xl leading-snug text-cream-50 sm:text-3xl">
                Votre moitié vous attend.{" "}
                <span className="text-gold-gradient">Qu&apos;attendez-vous ?</span>
              </h2>
              <p className="mt-2 text-sm text-cream-200/85 sm:text-base">
                Inscription gratuite · 5 minutes · zéro engagement.
              </p>
            </div>
            <Link
              href="/register"
              className="group inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-full bg-cream-50 px-7 py-3.5 text-sm font-semibold text-choco-700 shadow-[0_18px_40px_-16px_rgba(0,0,0,0.45)] transition-transform hover:-translate-y-0.5 md:w-auto"
            >
              Je me lance
              <ArrowRight
                size={16}
                className="transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
