import {
  HeartHandshake,
  MessagesSquare,
  Sparkles,
  Target,
  UserPlus,
} from "lucide-react";
import { SectionHeading } from "./section-heading";
import { Reveal } from "./reveal";

const STEPS = [
  {
    icon: UserPlus,
    title: "Crée ton profil matrimonial",
    description:
      "Renseigne ton parcours, tes valeurs et ce que tu recherches vraiment chez un futur conjoint.",
  },
  {
    icon: Target,
    title: "Définis ton projet de mariage",
    description:
      "Précise tes attentes : délais, vision du foyer, situation familiale. La clarté attire le sérieux.",
  },
  {
    icon: Sparkles,
    title: "Découvre des profils compatibles",
    description:
      "Notre système te propose des personnes alignées avec tes critères et ton projet de vie.",
  },
  {
    icon: MessagesSquare,
    title: "Échange dans un cadre respectueux",
    description:
      "Discute via une messagerie sécurisée, à ton rythme, en gardant le contrôle de ta confidentialité.",
  },
  {
    icon: HeartHandshake,
    title: "Avance vers une rencontre sérieuse",
    description:
      "Quand la confiance est là, construisez ensemble les prochaines étapes vers un vrai engagement.",
  },
];

export function HowItWorks() {
  return (
    <section id="comment" className="relative py-20 sm:py-24">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-10 h-72 w-72 -translate-x-1/2 rounded-full bg-champagne-400/15 blur-3xl" />
      </div>

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="Comment ça marche"
          title="Cinq étapes vers une rencontre sincère"
          description="Un parcours simple et balisé, conçu pour des personnes qui savent ce qu'elles veulent : un foyer."
        />

        <div className="relative mt-16">
          {/* Ligne de progression verticale */}
          <div className="absolute left-[1.65rem] top-2 bottom-2 hidden w-px bg-gradient-to-b from-champagne-500/50 via-champagne-500/30 to-transparent sm:block" />

          <ol className="flex flex-col gap-5">
            {STEPS.map((step, i) => (
              <Reveal key={step.title} delay={i * 0.08}>
                <li className="group relative flex items-start gap-5 rounded-3xl border border-champagne-500/20 bg-cream-100/50 p-5 transition-all duration-300 hover:border-champagne-500/40 hover:bg-cream-100 sm:p-6">
                  <div className="relative z-10 flex shrink-0 flex-col items-center">
                    <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-choco-600 to-choco-800 text-cream-50 shadow-[0_14px_30px_-16px_rgba(43,26,18,0.9)] ring-1 ring-inset ring-champagne-400/30">
                      <step.icon size={22} />
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold uppercase tracking-[0.2em] text-champagne-600">
                      Étape {i + 1}
                    </span>
                    <h3 className="mt-1 font-serif text-xl text-choco-700">
                      {step.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-ink-700/80">
                      {step.description}
                    </p>
                  </div>
                </li>
              </Reveal>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
