import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  BellRing,
  Check,
  ChevronDown,
  Crown,
  Eye,
  EyeOff,
  Gem,
  Heart,
  Infinity,
  LockKeyhole,
  MessageCircle,
  Rocket,
  ShieldCheck,
  Sparkles,
  Star,
  UserRoundCheck,
  Zap,
} from "lucide-react";

const BENEFITS = [
  {
    icon: Eye,
    title: "Découvre qui visite ton profil",
    description:
      "Identifie les membres qui consultent ton profil et montre-toi au bon moment.",
    standard: "Masqué",
    premium: "Visible",
  },
  {
    icon: Heart,
    title: "Vois qui tajoute en favori",
    description:
      "Repère les personnes qui ont déjà manifesté un intérêt discret pour toi.",
    standard: "Masqué",
    premium: "Visible",
  },
  {
    icon: UserRoundCheck,
    title: "Demandes sans limite standard",
    description:
      "Avance plus librement lorsque tu découvres des profils réellement compatibles.",
    standard: "Limité",
    premium: "Étendu",
  },
  {
    icon: MessageCircle,
    title: "Échanges facilités",
    description:
      "Profite dune expérience de conversation plus complète avec tes connexions mutuelles.",
    standard: "Essentiel",
    premium: "Enrichi",
  },
  {
    icon: Rocket,
    title: "Profil mis en avant",
    description:
      "Bénéficie dune priorité de présentation dans les espaces de découverte compatibles.",
    standard: "Classique",
    premium: "Prioritaire",
  },
  {
    icon: Zap,
    title: "Boosts de visibilité",
    description:
      "Donne ponctuellement plus de présence à ton profil auprès des bons membres.",
    standard: "Non inclus",
    premium: "Inclus",
  },
  {
    icon: BadgeCheck,
    title: "Traitement prioritaire",
    description:
      "Les opérations Premium prévues bénéficient dun parcours de traitement prioritaire.",
    standard: "Standard",
    premium: "Prioritaire",
  },
  {
    icon: Crown,
    title: "Badge Premium",
    description:
      "Affiche un signe distinctif qui renforce la lisibilité de ton engagement matrimonial.",
    standard: "Absent",
    premium: "Inclus",
  },
  {
    icon: Star,
    title: "Accès anticipé aux nouveautés",
    description:
      "Découvre en priorité les nouvelles fonctions utiles à ta recherche.",
    standard: "Après lancement",
    premium: "Prioritaire",
  },
  {
    icon: LockKeyhole,
    title: "Confidentialité renforcée",
    description:
      "Profite de réglages plus précis pour maîtriser la présentation de tes photos.",
    standard: "Essentielle",
    premium: "Avancée",
  },
] as const;

const DURATIONS = [
  {
    name: "15 jours",
    description: "Pour découvrir lexpérience Premium sur une courte période.",
  },
  {
    name: "1 mois",
    description: "Une durée souple pour renforcer activement ta recherche.",
  },
  {
    name: "3 mois",
    description: "Plus de temps pour construire des échanges sérieux.",
  },
  {
    name: "6 mois",
    description: "Une démarche suivie pour avancer avec constance.",
  },
] as const;

const FAQS = [
  {
    question: "Les paiements Premium sont-ils déjà actifs ?",
    answer:
      "Non. Cette page présente lexpérience prévue, mais aucun paiement et aucune collecte Mobile Money ne peuvent actuellement être lancés.",
  },
  {
    question: "Quels moyens de paiement sont prévus ?",
    answer:
      "MTN Mobile Money et Orange Money sont les moyens actuellement envisagés pour le Cameroun. Leur disponibilité définitive sera confirmée avant louverture.",
  },
  {
    question: "Quels seront les tarifs ?",
    answer:
      "Les tarifs KASSALAFAM ne sont pas encore confirmés. Aucun montant affiché sur une autre plateforme ne constitue un tarif officiel KASSALAFAM.",
  },
  {
    question: "Labonnement sera-t-il renouvelé automatiquement ?",
    answer:
      "Aucun renouvellement automatique nest actif aujourdhui. Les règles de durée et de renouvellement seront présentées clairement avant tout paiement.",
  },
  {
    question: "Puis-je continuer à utiliser KASSALAFAM gratuitement ?",
    answer:
      "Oui. Lespace membre standard reste disponible. Premium viendra compléter lexpérience sans empêcher lutilisation des fonctions gratuites existantes.",
  },
  {
    question: "Quand les avantages seront-ils réellement disponibles ?",
    answer:
      "Chaque avantage sera annoncé comme actif uniquement après validation de son fonctionnement, de sa sécurité et de son intégration au compte membre.",
  },
] as const;

const TRUST_ITEMS = [
  {
    icon: ShieldCheck,
    title: "Activation contrôlée",
    text: "Aucun avantage ne sera vendu avant sa validation technique.",
  },
  {
    icon: LockKeyhole,
    title: "Paiement sécurisé",
    text: "Les secrets de paiement resteront exclusivement côté serveur.",
  },
  {
    icon: BellRing,
    title: "Information transparente",
    text: "Prix, durée et conditions seront affichés avant toute confirmation.",
  },
  {
    icon: BadgeCheck,
    title: "Données protégées",
    text: "La confidentialité du profil reste au cœur de lexpérience.",
  },
] as const;

export function PremiumExperience() {
  return (
    <div className="space-y-8 pb-12">
      <section className="relative overflow-hidden rounded-[2.25rem] border border-champagne-500/35 bg-gradient-to-br from-choco-800 via-choco-700 to-choco-900 px-6 py-10 text-cream-50 shadow-[0_30px_90px_-40px_rgba(43,26,18,0.95)] sm:px-10 sm:py-14 lg:px-14">
        <div
          aria-hidden="true"
          className="absolute -right-20 -top-24 h-80 w-80 rounded-full bg-champagne-400/20 blur-3xl"
        />

        <div
          aria-hidden="true"
          className="absolute -bottom-28 -left-16 h-72 w-72 rounded-full bg-champagne-500/10 blur-3xl"
        />

        <div className="relative max-w-4xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-champagne-300/35 bg-champagne-300/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-champagne-200">
            <Crown size={15} />
            KASSALAFAM Premium
          </span>

          <h1 className="mt-7 max-w-4xl font-serif text-4xl font-semibold leading-[1.08] text-cream-50 sm:text-5xl lg:text-6xl">
            Ta future épouse tattend.
            <span className="mt-1 block text-champagne-300">
              Ne la rate pas.
            </span>
          </h1>

          <p className="mt-6 max-w-3xl text-base leading-8 text-cream-100/80 sm:text-lg">
            Premium est conçu pour donner plus de visibilité à ton profil,
            faciliter les connexions sérieuses et taider à avancer avec
            davantage de clarté dans ta recherche matrimoniale.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="#avantages-premium"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-champagne-500 via-champagne-300 to-champagne-500 px-6 py-3.5 text-sm font-bold text-choco-900 shadow-[0_18px_44px_-18px_rgba(232,201,106,0.9)] transition-transform hover:-translate-y-0.5"
            >
              Découvrir les avantages
              <ArrowRight size={17} />
            </Link>

            <Link
              href="/profile"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-cream-50/20 bg-cream-50/8 px-6 py-3.5 text-sm font-semibold text-cream-50 transition-colors hover:bg-cream-50/14"
            >
              Préparer mon profil
            </Link>
          </div>

          <div className="mt-10 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-cream-50/12 bg-cream-50/8 p-4 backdrop-blur-sm">
              <Sparkles className="text-champagne-300" size={20} />
              <p className="mt-3 font-semibold text-cream-50">
                Plus de visibilité
              </p>
              <p className="mt-1 text-xs leading-5 text-cream-100/65">
                Une présence renforcée dans la Découverte.
              </p>
            </div>

            <div className="rounded-2xl border border-cream-50/12 bg-cream-50/8 p-4 backdrop-blur-sm">
              <BadgeCheck className="text-champagne-300" size={20} />
              <p className="mt-3 font-semibold text-cream-50">
                Démarche sérieuse
              </p>
              <p className="mt-1 text-xs leading-5 text-cream-100/65">
                Une expérience pensée pour le mariage.
              </p>
            </div>

            <div className="rounded-2xl border border-cream-50/12 bg-cream-50/8 p-4 backdrop-blur-sm">
              <ShieldCheck className="text-champagne-300" size={20} />
              <p className="mt-3 font-semibold text-cream-50">
                Ouverture sécurisée
              </p>
              <p className="mt-1 text-xs leading-5 text-cream-100/65">
                Aucun paiement avant validation complète.
              </p>
            </div>
          </div>
        </div>
      </section>

      <aside className="flex flex-col gap-3 rounded-2xl border border-champagne-500/35 bg-champagne-300/10 px-5 py-4 text-sm text-choco-700 sm:flex-row sm:items-center">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-champagne-400/25 text-champagne-700">
          <Gem size={18} />
        </span>

        <p className="leading-6">
          <strong>Aperçu de loffre prévue :</strong> les tarifs, les paiements
          et lactivation Premium restent désactivés jusquà leur validation
          officielle.
        </p>
      </aside>

      <section
        id="avantages-premium"
        className="scroll-mt-36 overflow-hidden rounded-[2rem] border border-champagne-500/30 bg-cream-50/70 shadow-card"
      >
        <div className="border-b border-champagne-500/25 bg-gradient-to-r from-champagne-300/20 via-cream-50 to-champagne-300/10 px-6 py-7 sm:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-champagne-700">
            Une expérience plus complète
          </p>

          <h2 className="mt-2 font-serif text-3xl font-semibold text-choco-800">
            Ce que Premium débloque pour toi
          </h2>

          <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-700/68">
            Chaque avantage est présenté séparément afin que tu voies
            clairement la différence entre lexpérience standard et
            lexpérience Premium prévue.
          </p>
        </div>

        <div className="hidden grid-cols-[minmax(0,1fr)_110px_110px] border-b border-champagne-500/20 bg-cream-100/45 px-6 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-ink-700/55 md:grid sm:px-8">
          <span>Avantage</span>
          <span className="text-center">Standard</span>
          <span className="text-center text-champagne-700">Premium</span>
        </div>

        <div className="divide-y divide-champagne-500/18">
          {BENEFITS.map((benefit) => {
            const Icon = benefit.icon;

            return (
              <article
                key={benefit.title}
                className="grid gap-4 px-6 py-5 transition-colors hover:bg-champagne-300/7 md:grid-cols-[minmax(0,1fr)_110px_110px] md:items-center sm:px-8"
              >
                <div className="flex gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-champagne-400/18 text-champagne-700">
                    <Icon size={20} />
                  </span>

                  <div>
                    <h3 className="font-semibold text-choco-800">
                      {benefit.title}
                    </h3>

                    <p className="mt-1 text-sm leading-6 text-ink-700/62">
                      {benefit.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 md:contents">
                  <span className="inline-flex items-center justify-center gap-1.5 rounded-full bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 md:mx-auto">
                    <EyeOff size={13} />
                    {benefit.standard}
                  </span>

                  <span className="inline-flex items-center justify-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 md:mx-auto">
                    <Check size={13} strokeWidth={3} />
                    {benefit.premium}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {TRUST_ITEMS.map((item) => {
          const Icon = item.icon;

          return (
            <article
              key={item.title}
              className="rounded-3xl border border-champagne-500/25 bg-cream-100/45 p-5"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-champagne-400/18 text-champagne-700">
                <Icon size={19} />
              </span>

              <h3 className="mt-4 font-semibold text-choco-800">
                {item.title}
              </h3>

              <p className="mt-2 text-sm leading-6 text-ink-700/62">
                {item.text}
              </p>
            </article>
          );
        })}
      </section>

      <section className="rounded-[2rem] border border-champagne-500/30 bg-cream-50/70 p-6 shadow-card sm:p-8">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-champagne-700">
            Formules Premium
          </p>

          <h2 className="mt-2 font-serif text-3xl font-semibold text-choco-800">
            Choisis la durée qui te correspond
          </h2>

          <p className="mt-3 text-sm leading-6 text-ink-700/65">
            Les durées sont présentées pour préparer linterface. Les prix
            officiels seront ajoutés uniquement après validation.
          </p>
        </div>

        <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {DURATIONS.map((duration) => (
            <article
              key={duration.name}
              className="relative overflow-hidden rounded-3xl border border-champagne-500/30 bg-gradient-to-br from-cream-50 to-champagne-300/10 p-5"
            >
              <span
                aria-hidden="true"
                className="absolute right-0 top-0 h-20 w-20 rounded-bl-full bg-champagne-400/10"
              />

              <Crown
                size={20}
                className="relative text-champagne-700"
              />

              <h3 className="relative mt-4 font-serif text-2xl font-semibold text-choco-800">
                {duration.name}
              </h3>

              <p className="relative mt-2 min-h-16 text-sm leading-6 text-ink-700/62">
                {duration.description}
              </p>

              <p className="relative mt-5 border-t border-champagne-500/20 pt-4 text-sm font-semibold text-champagne-700">
                Tarif à confirmer
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <article className="rounded-[2rem] border border-champagne-500/30 bg-gradient-to-br from-choco-800 to-choco-700 p-6 text-cream-50 shadow-card sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-champagne-300">
            Paiement Mobile Money
          </p>

          <h2 className="mt-2 font-serif text-3xl font-semibold">
            Des moyens adaptés au Cameroun
          </h2>

          <div className="mt-6 space-y-3">
            <div className="flex items-center justify-between rounded-2xl border border-cream-50/12 bg-cream-50/8 p-4">
              <div>
                <p className="font-semibold">MTN Mobile Money</p>
                <p className="mt-1 text-xs text-cream-100/60">
                  Intégration prévue
                </p>
              </div>

              <span className="rounded-full bg-champagne-300/15 px-3 py-1 text-xs font-semibold text-champagne-200">
                Bientôt disponible
              </span>
            </div>

            <div className="flex items-center justify-between rounded-2xl border border-cream-50/12 bg-cream-50/8 p-4">
              <div>
                <p className="font-semibold">Orange Money</p>
                <p className="mt-1 text-xs text-cream-100/60">
                  Intégration prévue
                </p>
              </div>

              <span className="rounded-full bg-champagne-300/15 px-3 py-1 text-xs font-semibold text-champagne-200">
                Bientôt disponible
              </span>
            </div>
          </div>

          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-champagne-300/20 bg-champagne-300/10 p-4">
            <LockKeyhole
              size={18}
              className="mt-0.5 shrink-0 text-champagne-300"
            />

            <p className="text-xs leading-5 text-cream-100/70">
              Aucun numéro de téléphone, aucun opérateur et aucun montant ne
              sont demandés sur cette version de la page.
            </p>
          </div>
        </article>

        <article className="rounded-[2rem] border border-champagne-500/30 bg-cream-100/45 p-6 shadow-card sm:p-8">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-champagne-400/20 text-champagne-700">
            <Infinity size={22} />
          </span>

          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.22em] text-champagne-700">
            Une démarche durable
          </p>

          <h2 className="mt-2 font-serif text-3xl font-semibold text-choco-800">
            Plus quun abonnement
          </h2>

          <p className="mt-4 text-sm leading-7 text-ink-700/68">
            Premium est pensé comme un accompagnement de ta recherche :
            davantage de présence, une meilleure lecture des intérêts et une
            expérience plus fluide pour construire des échanges sérieux.
          </p>

          <ul className="mt-6 space-y-3">
            {[
              "Aucun faux témoignage affiché",
              "Aucune promesse de mariage garantie",
              "Aucun débit avant confirmation explicite",
            ].map((item) => (
              <li
                key={item}
                className="flex items-center gap-3 text-sm text-choco-700"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                  <Check size={13} strokeWidth={3} />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </article>
      </section>

      <section className="rounded-[2rem] border border-champagne-500/30 bg-cream-50/70 p-6 shadow-card sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-champagne-700">
          Questions fréquentes
        </p>

        <h2 className="mt-2 font-serif text-3xl font-semibold text-choco-800">
          Tout savoir avant louverture
        </h2>

        <div className="mt-7 divide-y divide-champagne-500/20">
          {FAQS.map((faq) => (
            <details
              key={faq.question}
              className="group py-1"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-left font-semibold text-choco-800 [&::-webkit-details-marker]:hidden">
                <span>{faq.question}</span>

                <ChevronDown
                  size={18}
                  className="shrink-0 text-champagne-700 transition-transform group-open:rotate-180"
                />
              </summary>

              <p className="max-w-4xl pb-5 pr-8 text-sm leading-7 text-ink-700/65">
                {faq.answer}
              </p>
            </details>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-[2.25rem] border border-champagne-400/35 bg-gradient-to-br from-emerald-950 via-emerald-900 to-choco-900 p-7 text-cream-50 shadow-[0_30px_80px_-42px_rgba(6,78,59,0.9)] sm:p-10">
        <div className="max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full bg-champagne-300/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-champagne-200">
            <Crown size={14} />
            Prépare ton lancement Premium
          </span>

          <h2 className="mt-5 font-serif text-3xl font-semibold sm:text-4xl">
            Le bon moment pour préparer ton profil, cest maintenant.
          </h2>

          <p className="mt-4 text-sm leading-7 text-cream-100/72 sm:text-base">
            Complète tes informations, soigne ta présentation et ajoute une
            photo principale afin dêtre prêt lorsque Premium sera
            officiellement ouvert.
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/profile"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-champagne-500 to-champagne-300 px-6 py-3.5 text-sm font-bold text-choco-900 transition-transform hover:-translate-y-0.5"
            >
              Préparer mon profil
              <ArrowRight size={17} />
            </Link>

            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center rounded-full border border-cream-50/20 px-6 py-3.5 text-sm font-semibold text-cream-50 transition-colors hover:bg-cream-50/10"
            >
              Retour au tableau de bord
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
