import { Quote } from "lucide-react";
import { SectionHeading } from "./section-heading";
import { Reveal } from "./reveal";

const TESTIMONIALS = [
  {
    quote:
      "Ce que j'apprécie, c'est le sérieux. On sent que les gens sont là pour les bonnes raisons, pas pour passer le temps.",
    initial: "A",
    meta: "Membre, 29 ans · Dakar",
  },
  {
    quote:
      "Le fait que les photos soient protégées m'a mise en confiance. J'ai pu avancer à mon rythme, sans pression.",
    initial: "K",
    meta: "Membre, 33 ans · Abidjan",
  },
  {
    quote:
      "La vérification des profils change tout. Je discute avec des personnes réelles et respectueuses.",
    initial: "S",
    meta: "Membre, 27 ans · Bamako",
  },
];

export function Testimonials() {
  return (
    <section className="relative py-20 sm:py-24">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute right-1/4 top-10 h-64 w-64 rounded-full bg-champagne-400/15 blur-3xl" />
      </div>

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="Ils nous font confiance"
          title="Des membres qui apprécient le cadre"
          description="Des retours sincères sur l'expérience. Chaque histoire reste unique : nous offrons les conditions, pas des promesses."
        />

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {TESTIMONIALS.map((t, i) => (
            <Reveal key={t.initial} delay={i * 0.1}>
              <figure className="flex h-full flex-col rounded-3xl border border-champagne-500/20 bg-cream-100/60 p-7 shadow-[0_24px_60px_-46px_rgba(43,26,18,0.6)]">
                <Quote className="text-champagne-500" size={26} />
                <blockquote className="mt-4 flex-1 text-sm leading-relaxed text-ink-700/85">
                  « {t.quote} »
                </blockquote>
                <figcaption className="mt-6 flex items-center gap-3 border-t border-champagne-500/20 pt-5">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-choco-600 to-choco-800 font-serif text-base font-semibold text-cream-50">
                    {t.initial}
                  </span>
                  <span className="text-sm font-medium text-choco-700">
                    {t.meta}
                  </span>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.2}>
          <p className="mx-auto mt-8 max-w-xl text-center text-xs text-ink-700/60">
            Témoignages illustratifs de membres. KASSALAFAM facilite des
            rencontres sérieuses mais ne garantit pas de résultat : votre
            histoire vous appartient.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
