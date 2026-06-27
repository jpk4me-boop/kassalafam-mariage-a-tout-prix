import { ArrowRight, BadgeCheck, Heart, ShieldCheck, Sparkles } from "lucide-react";
import { Reveal } from "./reveal";
import { FloatingProfileCard } from "./floating-profile-card";

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

        {/* Colonne visuelle : cartes de profils flottantes */}
        <Reveal delay={0.2} className="relative hidden h-[30rem] lg:block">
          <div className="absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-champagne-400/30 to-choco-500/20 blur-2xl" />

          <div className="absolute left-2 top-6 animate-float [animation-delay:-1s]">
            <FloatingProfileCard
              initial="A"
              age={28}
              city="Dakar"
              matched={92}
              gradient="bg-gradient-to-br from-choco-400 to-choco-700"
            />
          </div>

          <div className="absolute right-0 top-28 animate-float-slow [animation-delay:-3s]">
            <FloatingProfileCard
              initial="M"
              age={31}
              city="Abidjan"
              matched={87}
              gradient="bg-gradient-to-br from-champagne-500 to-choco-500"
            />
          </div>

          <div className="absolute bottom-2 left-10 animate-float [animation-delay:-5s]">
            <FloatingProfileCard
              initial="F"
              age={26}
              city="Bamako"
              matched={95}
              gradient="bg-gradient-to-br from-ink-700 to-choco-600"
            />
          </div>

          {/* Pastille de confiance flottante */}
          <div className="absolute right-6 bottom-12 animate-float-slow [animation-delay:-2s]">
            <div className="flex items-center gap-3 rounded-2xl glass px-4 py-3 shadow-card">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-choco-600 text-cream-50">
                <ShieldCheck size={18} />
              </span>
              <div className="flex flex-col leading-tight">
                <span className="text-sm font-semibold text-choco-700">
                  Vérifié à la main
                </span>
                <span className="text-xs text-ink-700/70">
                  Modération humaine
                </span>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
