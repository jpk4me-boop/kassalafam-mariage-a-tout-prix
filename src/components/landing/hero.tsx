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
    <section className="relative overflow-hidden pt-32 pb-20 sm:pt-36 sm:pb-28">
      {/* Halos lumineux d'arrière-plan */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-24 left-1/2 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-champagne-400/25 blur-3xl" />
        <div className="absolute right-[-6rem] top-32 h-80 w-80 rounded-full bg-choco-500/15 blur-3xl" />
        <div className="absolute bottom-0 left-[-4rem] h-72 w-72 rounded-full bg-champagne-500/15 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, var(--color-choco-700) 1px, transparent 0)",
            backgroundSize: "28px 28px",
          }}
        />
      </div>

      <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-[1.05fr_0.95fr]">
        {/* Colonne texte */}
        <div className="flex flex-col items-start">
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-champagne-500/40 bg-cream-100/80 px-4 py-1.5 text-xs font-semibold text-choco-600 shadow-sm">
              <Sparkles size={14} className="text-champagne-600" />
              La plateforme de mariage sérieuse pour les Africains
            </span>
          </Reveal>

          <Reveal delay={0.08}>
            <h1 className="mt-6 font-serif text-4xl leading-[1.08] text-choco-700 sm:text-5xl md:text-6xl">
              Trouvez une personne{" "}
              <span className="text-gold-gradient">sérieuse</span>, prête pour le
              mariage.
            </h1>
          </Reveal>

          <Reveal delay={0.16}>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-ink-700/80 sm:text-lg">
              <span className="font-semibold text-choco-600">
                KASSALAFAM — MARIAGE À TOUT PRIX
              </span>{" "}
              aide les Africains à faire des rencontres sincères, vérifiées et
              orientées vers un vrai projet de foyer.
            </p>
          </Reveal>

          <Reveal delay={0.24}>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <a
                href="#"
                className="group inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-br from-choco-600 to-choco-800 px-7 py-3.5 text-sm font-semibold text-cream-50 shadow-[0_18px_40px_-16px_rgba(43,26,18,0.9)] ring-1 ring-inset ring-champagne-400/30 transition-transform hover:-translate-y-0.5"
              >
                Créer mon profil
                <ArrowRight
                  size={17}
                  className="transition-transform group-hover:translate-x-0.5"
                />
              </a>
              <a
                href="#concept"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-choco-600/20 bg-cream-100/70 px-7 py-3.5 text-sm font-semibold text-choco-700 transition-colors hover:border-champagne-500/50 hover:bg-cream-100"
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

        {/* Colonne visuelle : couple en tenue de mariage */}
        <Reveal delay={0.2} className="relative mt-2 lg:mt-0">
          {/* Glow doux fondu dans le crème/doré de la landing */}
          <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[2.5rem] bg-gradient-to-br from-champagne-400/30 via-cream-200/25 to-choco-500/15 blur-3xl" />

          <div className="relative overflow-hidden rounded-[2rem] shadow-card ring-1 ring-inset ring-champagne-500/25">
            <Image
              src={heroCouple}
              alt="Couple africain heureux en tenue de mariage"
              priority
              placeholder="blur"
              sizes="(max-width: 1024px) 100vw, 45vw"
              className="h-auto w-full object-cover"
            />
            {/* Fondu doux vers le crème pour harmoniser l'image au fond */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-cream-50/70 to-transparent" />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
