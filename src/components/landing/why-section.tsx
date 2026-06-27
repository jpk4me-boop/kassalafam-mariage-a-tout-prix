import { Compass, Gem, HeartHandshake, Home, ShieldCheck } from "lucide-react";
import { Reveal } from "./reveal";

const REASONS = [
  {
    icon: Home,
    title: "Orientée foyer et famille",
    description:
      "Ici, on ne cherche pas une aventure. On construit un foyer. Chaque profil partage cette même ambition.",
  },
  {
    icon: ShieldCheck,
    title: "Sérieux et sécurité",
    description:
      "Vérification manuelle, modération active et confidentialité : un environnement digne de votre projet de vie.",
  },
  {
    icon: Compass,
    title: "Pensée pour l'Afrique",
    description:
      "Une plateforme qui comprend nos valeurs, nos réalités et l'importance de la famille dans le mariage.",
  },
  {
    icon: Gem,
    title: "Une expérience premium",
    description:
      "Une interface soignée, sobre et respectueuse, à la hauteur de la décision la plus importante de votre vie.",
  },
];

export function WhySection() {
  return (
    <section className="relative py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <Reveal>
              <span className="inline-flex items-center gap-2 rounded-full border border-champagne-500/40 bg-champagne-400/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-choco-600">
                <span className="h-1.5 w-1.5 rounded-full bg-champagne-500" />
                Pourquoi KASSALAFAM ?
              </span>
            </Reveal>
            <Reveal delay={0.08}>
              <h2 className="mt-5 font-serif text-3xl leading-tight text-choco-700 sm:text-4xl">
                Parce que le mariage mérite mieux qu&apos;une simple application
                de rencontre
              </h2>
            </Reveal>
            <Reveal delay={0.16}>
              <p className="mt-5 text-base leading-relaxed text-ink-700/80 sm:text-lg">
                Nous avons créé KASSALAFAM pour celles et ceux qui prennent le
                mariage au sérieux. Pas de superficialité, pas de pression :
                juste un cadre respectueux pour rencontrer une personne
                réellement prête à s&apos;engager.
              </p>
            </Reveal>

            <Reveal delay={0.24}>
              <div className="mt-8 flex items-center gap-4 rounded-2xl glass p-5 shadow-card">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-choco-600 text-cream-50">
                  <HeartHandshake size={22} />
                </span>
                <p className="text-sm leading-relaxed text-ink-700/85">
                  <span className="font-semibold text-choco-700">
                    Notre promesse :
                  </span>{" "}
                  vous offrir les meilleures conditions pour faire une rencontre
                  sincère. Le reste, c&apos;est votre histoire.
                </p>
              </div>
            </Reveal>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            {REASONS.map((reason, i) => (
              <Reveal key={reason.title} delay={i * 0.1}>
                <article className="h-full rounded-3xl border border-champagne-500/20 bg-cream-100/60 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-champagne-500/45 hover:shadow-card">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-champagne-400/20 text-champagne-600">
                    <reason.icon size={20} />
                  </span>
                  <h3 className="mt-4 font-serif text-lg text-choco-700">
                    {reason.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-700/80">
                    {reason.description}
                  </p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
