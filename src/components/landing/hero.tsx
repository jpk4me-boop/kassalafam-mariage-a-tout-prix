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
      {/* Ambiance floutée (même image) : sert uniquement à fondre les bords
          autour du couple, à DROITE. Masquée côté gauche pour ne pas créer de
          bande grise derrière le texte (la gauche reste crème pur). */}
      <div
        className="absolute inset-0 z-0"
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

      {/* Image nette du couple, entière (dézoomée) et ancrée à droite :
          on voit le haut des têtes, le buste et le bouquet sans rognage. */}
      <div className="absolute inset-0 z-[1]">
        <Image
          src={heroCouple}
          alt="Couple africain heureux en tenue de mariage"
          priority
          fill
          sizes="100vw"
          className="object-contain object-right"
        />
      </div>

      {/* Voile crème à gauche : fondu large et très progressif vers transparent,
          sans arrêt net, pour que la zone texte se fonde dans le crème. */}
      <div
        className="pointer-events-none absolute inset-0 z-[2]"
        style={{
          backgroundImage:
            "linear-gradient(to right, var(--color-cream-50) 0%, var(--color-cream-50) 28%, color-mix(in srgb, var(--color-cream-50) 70%, transparent) 46%, transparent 80%)",
        }}
      />

      <div className="relative z-10 mx-auto flex min-h-[80vh] max-w-6xl items-center px-4 pt-32 pb-20 sm:px-6 sm:pt-36 sm:pb-28">
        {/* Colonne texte posée directement sur l'image */}
        <div className="flex max-w-xl flex-col items-start">
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
      </div>
    </section>
  );
}
