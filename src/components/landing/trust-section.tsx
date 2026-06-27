import { EyeOff, ShieldCheck, UserCheck } from "lucide-react";
import { Reveal } from "./reveal";

const PILLARS = [
  {
    icon: UserCheck,
    title: "Profils vérifiés manuellement",
    description:
      "Chaque inscription est contrôlée par notre équipe avant d'être visible. Pas de faux comptes, pas de profils douteux.",
  },
  {
    icon: EyeOff,
    title: "Photos protégées ou floutées",
    description:
      "Vous gardez la maîtrise de votre image. Vos photos restent floutées tant que vous n'accordez pas votre confiance.",
  },
  {
    icon: ShieldCheck,
    title: "Modération stricte",
    description:
      "Comportements déplacés, arnaques et profils suspects sont signalés et retirés. Un espace sain, pour des intentions sérieuses.",
  },
];

export function TrustSection() {
  return (
    <section id="concept" className="relative py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-champagne-500/40 bg-champagne-400/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-choco-600">
            <span className="h-1.5 w-1.5 rounded-full bg-champagne-500" />
            La confiance avant tout
          </span>
          <h2 className="mt-5 font-serif text-3xl leading-tight text-choco-700 sm:text-4xl">
            Un cadre sérieux, pensé pour vous protéger
          </h2>
          <p className="mt-4 text-base leading-relaxed text-ink-700/80 sm:text-lg">
            KASSALAFAM n&apos;est pas un site de drague. C&apos;est une
            plateforme confidentielle et orientée foyer, où chaque détail est
            conçu pour respecter votre intimité et vos intentions.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {PILLARS.map((pillar, i) => (
            <Reveal key={pillar.title} delay={i * 0.1}>
              <article className="group h-full rounded-3xl border border-champagne-500/20 bg-cream-100/60 p-7 shadow-[0_24px_60px_-44px_rgba(43,26,18,0.6)] transition-all duration-300 hover:-translate-y-1 hover:border-champagne-500/45 hover:bg-cream-100">
                <span className="flex h-13 w-13 items-center justify-center rounded-2xl bg-gradient-to-br from-choco-600 to-choco-800 p-3 text-cream-50 shadow-[0_14px_30px_-16px_rgba(43,26,18,0.9)] ring-1 ring-inset ring-champagne-400/30">
                  <pillar.icon size={22} />
                </span>
                <h3 className="mt-5 font-serif text-xl text-choco-700">
                  {pillar.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-ink-700/80">
                  {pillar.description}
                </p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
