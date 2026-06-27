import {
  ClipboardList,
  Lock,
  MessageCircleHeart,
  ShieldAlert,
  SlidersHorizontal,
  UserCheck,
} from "lucide-react";
import { SectionHeading } from "./section-heading";
import { Reveal } from "./reveal";

const FEATURES = [
  {
    icon: ClipboardList,
    title: "Profil matrimonial détaillé",
    description:
      "Décrivez votre parcours, vos valeurs et votre projet de foyer pour des mises en relation justes.",
  },
  {
    icon: Lock,
    title: "Confidentialité des photos",
    description:
      "Vos photos restent floutées par défaut. Vous décidez qui peut les voir, et quand.",
  },
  {
    icon: UserCheck,
    title: "Validation admin",
    description:
      "Chaque profil est examiné par notre équipe avant publication pour garantir le sérieux.",
  },
  {
    icon: MessageCircleHeart,
    title: "Messagerie sécurisée",
    description:
      "Échangez dans un espace privé et respectueux, sans partage de coordonnées prématuré.",
  },
  {
    icon: SlidersHorizontal,
    title: "Compatibilité par critères",
    description:
      "Filtrez selon ce qui compte vraiment : valeurs, projet familial, localisation et attentes.",
  },
  {
    icon: ShieldAlert,
    title: "Signalement des profils suspects",
    description:
      "Un signalement en un clic. Notre équipe agit rapidement pour préserver la communauté.",
  },
];

export function Features() {
  return (
    <section id="fonctionnalites" className="relative py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="Fonctionnalités"
          title="Tout ce qu'il faut pour avancer sereinement"
          description="Des outils pensés pour la confiance, la confidentialité et la qualité des rencontres."
        />

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature, i) => (
            <Reveal key={feature.title} delay={(i % 3) * 0.08}>
              <article className="group relative h-full overflow-hidden rounded-3xl border border-champagne-500/20 bg-cream-100/60 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-champagne-500/45 hover:bg-cream-100 hover:shadow-card">
                <div className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full bg-champagne-400/15 blur-2xl transition-opacity duration-300 group-hover:opacity-100" />
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-choco-600 to-choco-800 text-cream-50 shadow-[0_14px_30px_-18px_rgba(43,26,18,0.9)] ring-1 ring-inset ring-champagne-400/30">
                  <feature.icon size={20} />
                </span>
                <h3 className="mt-5 font-serif text-lg text-choco-700">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-700/80">
                  {feature.description}
                </p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
