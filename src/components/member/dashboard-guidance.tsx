"use client";

import {
  useEffect,
  useState,
} from "react";
import Link from "next/link";
import {
  ArrowRight,
  Bell,
  Compass,
  HeartHandshake,
  Lightbulb,
  MessageCircle,
  UserRound,
} from "lucide-react";

type DailyAdvice = Readonly<{
  title: string;
  text: string;
  href: string;
  label: string;
}>;

const DAILY_ADVICES: DailyAdvice[] = [
  {
    title: "Relisez votre présentation",
    text: "Quelques phrases sincères et précises permettent aux autres membres de mieux comprendre votre personnalité et votre projet de foyer.",
    href: "/profile",
    label: "Voir mon profil",
  },
  {
    title: "Privilégiez la qualité des échanges",
    text: "Prenez le temps de lire chaque profil avant dexprimer un intérêt. Une démarche attentive favorise des rencontres plus sérieuses.",
    href: "/discover",
    label: "Ouvrir Découverte",
  },
  {
    title: "Répondez avec clarté et respect",
    text: "Lorsquune demande vous parvient, une réponse claire aide chacun à avancer sereinement dans sa recherche.",
    href: "/matches?tab=received",
    label: "Voir mes demandes",
  },
  {
    title: "Gardez vos informations à jour",
    text: "Une évolution de votre ville, de votre situation ou de vos attentes mérite dêtre reflétée dans votre profil matrimonial.",
    href: "/profile",
    label: "Mettre à jour mon profil",
  },
  {
    title: "Prenez le temps de découvrir",
    text: "La compatibilité ne repose pas uniquement sur une photo. Lâge, la localisation, les valeurs et le projet matrimonial comptent aussi.",
    href: "/discover",
    label: "Découvrir les profils",
  },
  {
    title: "Soignez votre photo principale",
    text: "Une photo récente, nette et respectueuse inspire davantage confiance tout en restant soumise à vos choix de confidentialité.",
    href: "/profile",
    label: "Gérer mes photos",
  },
  {
    title: "La courtoisie construit la confiance",
    text: "Dans chaque conversation, avancez progressivement et ne partagez jamais dinformation sensible avant davoir établi une confiance réelle.",
    href: "/matches?tab=matched",
    label: "Voir mes connexions",
  },
];

const SHORTCUTS = [
  {
    href: "/profile",
    label: "Mon profil",
    description: "Informations, attentes et photos",
    icon: UserRound,
  },
  {
    href: "/discover",
    label: "Découverte",
    description: "Parcourir les profils compatibles",
    icon: Compass,
  },
  {
    href: "/matches?tab=received",
    label: "Mes demandes",
    description: "Consulter les intérêts reçus",
    icon: HeartHandshake,
  },
  {
    href: "/matches?tab=matched",
    label: "Mes messages",
    description: "Retrouver mes connexions mutuelles",
    icon: MessageCircle,
  },
  {
    href: "/notifications",
    label: "Notifications",
    description: "Consulter les informations récentes",
    icon: Bell,
  },
] as const;

function getAdviceIndex(date: Date): number {
  const localCalendarDay = Math.floor(
    Date.UTC(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
    ) / 86_400_000,
  );

  return (
    Math.abs(localCalendarDay) %
    DAILY_ADVICES.length
  );
}

export function DashboardGuidance() {
  const [adviceIndex, setAdviceIndex] =
    useState<number | null>(null);

  useEffect(() => {
    // Calcul après hydratation : évite tout décalage de date serveur/client.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAdviceIndex(getAdviceIndex(new Date()));
  }, []);

  const advice =
    adviceIndex == null
      ? null
      : DAILY_ADVICES[adviceIndex];

  return (
    <section className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <article className="flex flex-col rounded-[2rem] border border-champagne-500/30 bg-cream-100/45 p-6 shadow-card sm:p-7">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-champagne-400/20 text-choco-600">
          <Lightbulb size={21} />
        </span>

        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.22em] text-champagne-600">
          Conseil du jour
        </p>

        {advice ? (
          <>
            <h2 className="mt-2 font-serif text-2xl font-semibold text-choco-700">
              {advice.title}
            </h2>

            <p className="mt-3 text-sm leading-6 text-ink-700/72">
              {advice.text}
            </p>

            <Link
              href={advice.href}
              className="mt-5 inline-flex w-fit items-center gap-2 text-sm font-semibold text-choco-700 transition-colors hover:text-choco-800"
            >
              {advice.label}
              <ArrowRight size={16} />
            </Link>
          </>
        ) : (
          <div
            aria-label="Préparation du conseil du jour"
            className="mt-3 space-y-3"
          >
            <div className="h-7 w-3/4 animate-pulse rounded bg-cream-50/80" />
            <div className="h-4 w-full animate-pulse rounded bg-cream-50/80" />
            <div className="h-4 w-5/6 animate-pulse rounded bg-cream-50/80" />
          </div>
        )}
      </article>

      <article className="rounded-[2rem] border border-champagne-500/30 bg-cream-50/65 p-6 shadow-card sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-champagne-600">
          Accès rapides
        </p>

        <h2 className="mt-2 font-serif text-2xl font-semibold text-choco-700">
          Retrouvez vos espaces essentiels
        </h2>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {SHORTCUTS.map(
            ({
              href,
              label,
              description,
              icon: Icon,
            }) => (
              <Link
                key={href}
                href={href}
                className="group flex items-center gap-3 rounded-2xl border border-champagne-500/25 bg-cream-100/40 p-4 transition-colors hover:bg-champagne-400/12"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-champagne-400/20 text-choco-600">
                  <Icon size={18} />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-choco-700">
                    {label}
                  </span>

                  <span className="mt-0.5 block text-xs leading-5 text-ink-700/60">
                    {description}
                  </span>
                </span>

                <ArrowRight
                  size={15}
                  className="shrink-0 text-choco-600/55 transition-transform group-hover:translate-x-0.5"
                />
              </Link>
            ),
          )}
        </div>
      </article>
    </section>
  );
}
