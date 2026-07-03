import Image from "next/image";
import { ArrowRight, BadgeCheck, Heart, ShieldCheck, Sparkles } from "lucide-react";
import { Reveal } from "./reveal";
import heroCouple from "./kassalafam-hero-couple.png";

const BADGES = [
  { icon: BadgeCheck, label: "Profils vérifiés" },
  { icon: ShieldCheck, label: "Confidentialité protégée" },
  { icon: Heart, label: "Objectif mariage" },
];

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden bg-cream-50">
      {/* Calques image du couple — DESKTOP uniquement (md+). Sur mobile le hero
          devient un flux vertical avec une image DÉDIÉE dans la colonne : ces
          overlays absolus (ambiance floutée + image nette + voile crème) sont
          donc masqués sous md pour éliminer tout chevauchement texte/image. */}
      <div
        className="absolute inset-0 z-0 hidden md:block"
        style={{
          maskImage:
            "linear-gradient(to right, transparent 0%, transparent 50%, black 85%)",
          WebkitMaskImage:
            "linear-gradient(to right, transparent 0%, transparent 50%, black 85%)",
        }}
      >
        <Image
          src={heroCouple}
          alt=""
          aria-hidden
          fill
          sizes="100vw"
          className="scale-110 object-cover object-center blur-2xl opacity-40"
        />
      </div>

      {/* Image nette du couple, entière (dézoomée) et ancrée à droite (desktop). */}
      <div className="absolute inset-0 z-[1] hidden md:block">
        <Image
          src={heroCouple}
          alt="Couple africain heureux en tenue de mariage"
          priority
          fill
          sizes="100vw"
          className="object-contain object-right"
        />
      </div>

      {/* Voile crème à gauche (desktop) : fondu large vers transparent. */}
      <div
        className="pointer-events-none absolute inset-0 z-[2] hidden md:block"
        style={{
          backgroundImage:
            "linear-gradient(to right, var(--color-cream-50) 0%, var(--color-cream-50) 28%, color-mix(in srgb, var(--color-cream-50) 70%, transparent) 46%, transparent 80%)",
        }}
      />

      <div className="relative z-10 mx-auto flex max-w-6xl flex-col px-4 pt-28 pb-14 sm:px-6 md:min-h-[80vh] md:flex-row md:items-center md:pt-36 md:pb-28">
        {/* Colonne texte : flux vertical naturel sur mobile ; superposée à
            l'image absolue sur desktop (md:max-w-xl). */}
        <div className="flex w-full flex-col items-start md:max-w-xl">
          <Reveal>
            <span className="inline-flex items-start gap-2.5 rounded-2xl border border-champagne-500/40 bg-cream-100/80 px-4 py-2 text-left text-xs font-semibold leading-snug text-choco-600 shadow-sm sm:items-center sm:rounded-full">
              <Sparkles
                size={14}
                className="mt-0.5 shrink-0 text-champagne-600 sm:mt-0"
              />
              La plateforme de mariage sérieuse pour les Africains
            </span>
          </Reveal>

          <Reveal delay={0.08}>
            <h1 className="mt-6 font-serif text-[clamp(2.7rem,11vw,3.3rem)] leading-[1.0] text-choco-700 md:text-6xl md:leading-[1.08]">
              Trouvez une personne{" "}
              <span className="text-gold-gradient">sérieuse</span>, prête pour le
              mariage.
            </h1>
          </Reveal>

          {/* Image du couple — MOBILE uniquement, DANS le flux (entre le titre et
              le paragraphe) : jamais de texte par-dessus l'image. Masquée sur
              desktop où l'overlay absolu ci-dessus prend le relais. */}
          <Reveal delay={0.12} className="mt-7 w-full md:hidden">
            <div className="relative aspect-[5/6] w-full overflow-hidden rounded-3xl border border-champagne-500/30 shadow-[0_24px_60px_-30px_rgba(43,26,18,0.5)]">
              <Image
                src={heroCouple}
                alt="Couple africain heureux en tenue de mariage"
                priority
                fill
                sizes="100vw"
                className="object-cover object-top"
              />
            </div>
          </Reveal>

          <Reveal delay={0.16}>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-700/80">
              <span className="font-semibold text-choco-600">
                KASSALAFAM — MARIAGE À TOUT PRIX
              </span>{" "}
              aide les Africains à faire des rencontres sincères, vérifiées et
              orientées vers un vrai projet de foyer.
            </p>
          </Reveal>

          <Reveal delay={0.24}>
            <div className="mt-8 flex w-full flex-col gap-3 md:w-auto md:flex-row md:items-center">
              <a
                href="#"
                className="group inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-br from-choco-600 to-choco-800 px-7 py-4 text-sm font-semibold text-cream-50 shadow-[0_18px_40px_-16px_rgba(43,26,18,0.9)] ring-1 ring-inset ring-champagne-400/30 transition-transform hover:-translate-y-0.5 md:w-auto md:py-3.5"
              >
                Créer mon profil
                <ArrowRight
                  size={17}
                  className="transition-transform group-hover:translate-x-0.5"
                />
              </a>
              <a
                href="#concept"
                className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-choco-600/20 bg-cream-100/70 px-7 py-4 text-sm font-semibold text-choco-700 transition-colors hover:border-champagne-500/50 hover:bg-cream-100 md:w-auto md:py-3.5"
              >
                Découvrir le concept
              </a>
            </div>
          </Reveal>

          <Reveal delay={0.32}>
            <ul className="mt-9 flex flex-wrap items-center gap-x-5 gap-y-3">
              {BADGES.map((badge) => (
                <li
                  key={badge.label}
                  className="inline-flex items-center gap-2 text-sm font-medium text-ink-700/80"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-champagne-400/20 text-champagne-600">
                    <badge.icon size={15} />
                  </span>
                  {badge.label}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
