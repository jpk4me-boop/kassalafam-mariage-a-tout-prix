import Link from "next/link";
import {
  BarChart3,
  BadgeCheck,
  Flag,
  Users,
  UserCog,
  Settings,
  ScrollText,
  ArrowRight,
  Clock,
  Crown,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { requireAdmin } from "@/lib/auth/admin-guard";

// Rendu dynamique : dépend de la session (cookies) et d'env serveur.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Administration — KASSALAFAM",
};

type AdminCard = {
  title: string;
  description: string;
  href?: string;
  icon: LucideIcon;
  /** `true` : fonction déjà livrée (lien actif). Sinon carte « à venir ». */
  available: boolean;
  /** `true` : réservée au super administrateur (badge). */
  superAdminOnly?: boolean;
};

const CARDS: AdminCard[] = [
  {
    title: "Statistiques & Analyses",
    description:
      "Vue agrégée des membres, de l’engagement, de la sécurité et de la conversion.",
    href: "/admin/analytics",
    icon: BarChart3,
    available: true,
  },
  {
    title: "Vérification des profils",
    description: "Approuver, rejeter ou mettre en pause les profils membres.",
    href: "/admin/verification",
    icon: BadgeCheck,
    available: true,
  },
  {
    title: "Signalements",
    description: "Consulter et traiter les signalements de messages.",
    href: "/admin/reports",
    icon: Flag,
    available: true,
  },
  {
    title: "Membres et profils",
    description:
      "Recherche paginée, filtres, tri et fiche détaillée. Suspension et vérification depuis la fiche.",
    href: "/admin/members",
    icon: Users,
    available: true,
  },
  {
    title: "Journal d’administration",
    description:
      "Flux unifié et horodaté des actions de modération (vérification, suspension, signalements).",
    href: "/admin/audit",
    icon: ScrollText,
    available: true,
  },
  {
    title: "Modération des comptes",
    description:
      "Suspension et réactivation des comptes désormais accessibles depuis la fiche d’un membre.",
    href: "/admin/members",
    icon: UserCog,
    available: true,
  },
  {
    title: "Paramètres de la plateforme",
    description: "Réglages généraux et administration système. À venir.",
    icon: Settings,
    available: false,
    superAdminOnly: true,
  },
];

export default async function AdminHomePage() {
  const { isSuperAdmin } = await requireAdmin("/admin");

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-champagne-600">
          Back-office
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-serif text-3xl font-semibold text-choco-700 sm:text-4xl">
            Administration KASSALAFAM
          </h1>
          {isSuperAdmin ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-champagne-500/40 bg-champagne-400/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-choco-700">
              <Crown size={13} aria-hidden />
              Super administrateur
            </span>
          ) : null}
        </div>
        <p className="mt-3 max-w-2xl text-sm text-ink-700/70">
          Centre de pilotage de la plateforme. Chaque rubrique livrée est
          accessible ci-dessous ; les fonctions à venir sont clairement
          identifiées et non cliquables.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CARDS.map((card) => {
          const Icon = card.icon;
          const badge =
            card.superAdminOnly && !card.available ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-champagne-500/30 bg-champagne-400/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-choco-600">
                <Crown size={11} aria-hidden />
                Super admin
              </span>
            ) : null;

          if (card.available && card.href) {
            return (
              <Link
                key={card.title}
                href={card.href}
                className="group flex flex-col gap-3 rounded-3xl border border-champagne-500/25 bg-cream-100/50 p-5 shadow-card transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-champagne-500/60"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-choco-600/10 text-choco-600">
                  <Icon size={22} aria-hidden />
                </span>
                <div>
                  <h2 className="font-serif text-lg font-semibold text-choco-700">
                    {card.title}
                  </h2>
                  <p className="mt-1 text-sm text-ink-700/70">
                    {card.description}
                  </p>
                </div>
                <span className="mt-auto inline-flex items-center gap-1.5 text-sm font-semibold text-champagne-600">
                  Ouvrir
                  <ArrowRight
                    size={15}
                    className="transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </span>
              </Link>
            );
          }

          // Carte « à venir » : non cliquable, clairement identifiée.
          return (
            <div
              key={card.title}
              aria-disabled="true"
              className="flex flex-col gap-3 rounded-3xl border border-dashed border-champagne-500/30 bg-cream-100/30 p-5 opacity-80"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-champagne-400/15 text-ink-700/50">
                <Icon size={22} aria-hidden />
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-serif text-lg font-semibold text-ink-700/75">
                    {card.title}
                  </h2>
                  {badge}
                </div>
                <p className="mt-1 text-sm text-ink-700/60">
                  {card.description}
                </p>
              </div>
              <span className="mt-auto inline-flex items-center gap-1.5 text-sm font-medium text-ink-700/50">
                <Clock size={14} aria-hidden />
                Prochaine étape
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
