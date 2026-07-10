import Link from "next/link";
import { Check, Crown, Sparkles } from "lucide-react";
import { SectionHeading } from "./section-heading";
import { Reveal } from "./reveal";
import { cn } from "@/lib/utils";

const PLANS = [
  {
    name: "Gratuit",
    icon: Sparkles,
    price: "0",
    period: "pour toujours",
    description: "Pour découvrir la plateforme et créer votre profil sérieux.",
    cta: "Commencer gratuitement",
    highlighted: false,
    features: [
      "Création du profil matrimonial",
      "Vérification manuelle du profil",
      "Photos floutées par défaut",
      "Découverte de profils compatibles",
      "Messagerie limitée",
    ],
  },
  {
    name: "Premium",
    icon: Crown,
    price: "À venir",
    period: "paiement Mobile Money",
    description:
      "Pour mettre toutes les chances de votre côté dans votre recherche.",
    cta: "Être informé du lancement",
    highlighted: true,
    features: [
      "Tout ce qui est inclus dans Gratuit",
      "Messagerie illimitée",
      "Compatibilité avancée par critères",
      "Mise en avant de votre profil",
      "Gestion fine de la confidentialité des photos",
      "Support prioritaire",
    ],
  },
];

export function Pricing() {
  return (
    <section id="tarifs" className="relative py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="Tarifs"
          title="Des offres simples et transparentes"
          description="Commencez gratuitement. Passez au Premium quand vous serez prêt à accélérer votre recherche."
        />

        <div className="mx-auto mt-14 grid max-w-4xl gap-6 md:grid-cols-2">
          {PLANS.map((plan, i) => (
            <Reveal key={plan.name} delay={i * 0.1}>
              <article
                className={cn(
                  "relative flex h-full flex-col rounded-3xl p-7 sm:p-8",
                  plan.highlighted
                    ? "bg-gradient-to-br from-choco-700 to-choco-800 text-cream-50 shadow-[0_30px_70px_-30px_rgba(43,26,18,0.85)] ring-1 ring-inset ring-champagne-400/35"
                    : "border border-champagne-500/25 bg-cream-100/60 text-ink-800",
                )}
              >
                {plan.highlighted ? (
                  <span className="absolute -top-3 right-6 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-champagne-500 to-champagne-300 px-3 py-1 text-xs font-semibold text-choco-800 shadow-sm">
                    <Crown size={12} /> Recommandé
                  </span>
                ) : null}

                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      "flex h-11 w-11 items-center justify-center rounded-2xl",
                      plan.highlighted
                        ? "bg-champagne-400/20 text-champagne-300"
                        : "bg-champagne-400/20 text-champagne-600",
                    )}
                  >
                    <plan.icon size={20} />
                  </span>
                  <h3 className="font-serif text-2xl">{plan.name}</h3>
                </div>

                <p
                  className={cn(
                    "mt-4 text-sm leading-relaxed",
                    plan.highlighted ? "text-cream-200/85" : "text-ink-700/80",
                  )}
                >
                  {plan.description}
                </p>

                <div className="mt-6 flex items-end gap-2">
                  <span
                    className={cn(
                      "font-serif text-4xl",
                      plan.highlighted
                        ? "text-gold-gradient"
                        : "text-choco-700",
                    )}
                  >
                    {plan.price}
                  </span>
                  <span
                    className={cn(
                      "pb-1.5 text-sm",
                      plan.highlighted
                        ? "text-cream-200/70"
                        : "text-ink-700/60",
                    )}
                  >
                    {plan.period}
                  </span>
                </div>

                <ul className="mt-6 flex flex-1 flex-col gap-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3 text-sm">
                      <span
                        className={cn(
                          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                          plan.highlighted
                            ? "bg-champagne-400/25 text-champagne-300"
                            : "bg-champagne-400/20 text-champagne-600",
                        )}
                      >
                        <Check size={12} strokeWidth={3} />
                      </span>
                      <span
                        className={
                          plan.highlighted
                            ? "text-cream-100/90"
                            : "text-ink-700/85"
                        }
                      >
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>

                <Link
                  href="/register"
                  className={cn(
                    "mt-8 inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold transition-transform hover:-translate-y-0.5",
                    plan.highlighted
                      ? "bg-gradient-to-r from-champagne-500 to-champagne-300 text-choco-800 shadow-[0_16px_36px_-18px_rgba(214,168,90,0.9)]"
                      : "bg-gradient-to-br from-choco-600 to-choco-800 text-cream-50 ring-1 ring-inset ring-champagne-400/30",
                  )}
                >
                  {plan.cta}
                </Link>
              </article>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.2}>
          <p className="mx-auto mt-8 max-w-xl text-center text-xs text-ink-700/60">
            Les paiements Mobile Money seront disponibles prochainement. Aucune
            information de paiement n&apos;est demandée pour le moment.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
