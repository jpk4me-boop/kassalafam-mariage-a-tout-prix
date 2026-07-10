import Link from "next/link";
import { ArrowRight, BadgeCheck, Heart, ShieldCheck } from "lucide-react";
import { Reveal } from "./reveal";

export function Cta() {
  return (
    <section className="relative py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-choco-700 via-choco-700 to-choco-800 px-6 py-14 text-center shadow-[0_40px_90px_-40px_rgba(43,26,18,0.9)] sm:px-12 sm:py-20">
            {/* Halos */}
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute -top-20 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-champagne-400/25 blur-3xl" />
              <div className="absolute -bottom-24 right-10 h-64 w-64 rounded-full bg-champagne-500/20 blur-3xl" />
              <div
                className="absolute inset-0 opacity-[0.07]"
                style={{
                  backgroundImage:
                    "radial-gradient(circle at 1px 1px, var(--color-champagne-300) 1px, transparent 0)",
                  backgroundSize: "26px 26px",
                }}
              />
            </div>

            <div className="relative">
              <span className="inline-flex items-center gap-2 rounded-full border border-champagne-400/40 bg-champagne-400/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-champagne-300">
                <Heart size={13} /> Votre projet de foyer commence ici
              </span>
              <h2 className="mx-auto mt-6 max-w-2xl font-serif text-3xl leading-tight text-cream-50 sm:text-4xl md:text-[2.75rem]">
                Prêt à rencontrer une personne{" "}
                <span className="text-gold-gradient">sérieuse</span> ?
              </h2>
              <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-cream-200/85">
                Créez votre profil matrimonial gratuitement et rejoignez une
                communauté qui partage la même ambition : construire un vrai
                foyer.
              </p>

              <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link
                  href="/register"
                  className="group inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-champagne-500 to-champagne-300 px-8 py-3.5 text-sm font-semibold text-choco-800 shadow-[0_18px_40px_-16px_rgba(214,168,90,0.9)] transition-transform hover:-translate-y-0.5"
                >
                  Créer mon profil
                  <ArrowRight
                    size={17}
                    className="transition-transform group-hover:translate-x-0.5"
                  />
                </Link>
                <a
                  href="#concept"
                  className="inline-flex items-center justify-center rounded-full border border-cream-200/25 px-8 py-3.5 text-sm font-semibold text-cream-100 transition-colors hover:border-champagne-400/50"
                >
                  Découvrir le concept
                </a>
              </div>

              <ul className="mt-9 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm text-cream-200/80">
                <li className="inline-flex items-center gap-2">
                  <BadgeCheck size={15} className="text-champagne-300" />{" "}
                  Profils vérifiés
                </li>
                <li className="inline-flex items-center gap-2">
                  <ShieldCheck size={15} className="text-champagne-300" />{" "}
                  Confidentialité protégée
                </li>
                <li className="inline-flex items-center gap-2">
                  <Heart size={15} className="text-champagne-300" /> Objectif
                  mariage
                </li>
              </ul>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
