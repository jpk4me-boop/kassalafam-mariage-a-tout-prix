import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  CircleCheck,
  CircleDashed,
  Clock,
  Compass,
  HeartHandshake,
  ListChecks,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import type { ProfileVerificationStatus } from "@/lib/types/database";

/**
 * Cartes « prochaines étapes » du dashboard membre (L3C-A).
 *
 * Composant purement présentationnel : il ne fait AUCUNE requête. Toutes les
 * valeurs proviennent du profil déjà chargé par la page dashboard
 * (`profiles.select("*")`). Pas de matching, de messagerie, de paiement ni
 * d'IA : la découverte des profils est explicitement annoncée « en préparation ».
 */

type Props = {
  complete: boolean;
  verificationStatus: ProfileVerificationStatus;
  blurPhotos: boolean;
};

const cardClass =
  "flex flex-col rounded-3xl border border-champagne-500/30 bg-cream-50/60 p-6 shadow-card";

const iconWrapClass =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-champagne-400/20 text-choco-600";

const softPillClass =
  "inline-flex items-center gap-1.5 rounded-full border border-champagne-500/40 bg-champagne-400/15 px-3 py-1 text-xs font-medium text-choco-700";

const TRUST_COPY: Record<ProfileVerificationStatus, string> = {
  pending:
    "Votre profil est en cours de vérification par notre équipe. Cette étape protège la qualité et le sérieux de la communauté.",
  approved:
    "Votre profil est vérifié. Vous évoluez parmi des membres réellement engagés dans une démarche de mariage sérieux.",
  rejected:
    "Quelques éléments sont à ajuster avant validation. Ouvrez votre profil pour les corriger sereinement.",
  paused:
    "Votre vérification est momentanément en pause, le temps d’une revue complémentaire de notre équipe.",
};

export function DashboardNextSteps({
  complete,
  verificationStatus,
  blurPhotos,
}: Props) {
  return (
    <section className="grid gap-4 sm:grid-cols-2">
      {/* 1. Profil matrimonial */}
      <article className={cardClass}>
        <div className="flex items-start gap-3">
          <span className={iconWrapClass}>
            <UserRound size={20} />
          </span>
          <div className="flex-1">
            <h3 className="font-serif text-lg font-semibold text-choco-700">
              Profil matrimonial
            </h3>
            <p className="mt-1 text-sm text-ink-700/75">
              {complete
                ? "Vos informations essentielles sont renseignées. Vous pouvez les enrichir à tout moment."
                : "Quelques informations manquent pour finaliser votre présentation."}
            </p>
          </div>
        </div>
        <Link
          href="/profile"
          className="mt-4 inline-flex items-center gap-1.5 self-start text-sm font-semibold text-choco-700 transition-colors hover:text-choco-800"
        >
          {complete ? "Modifier mon profil" : "Compléter mon profil"}
          <ArrowRight size={15} />
        </Link>
      </article>

      {/* 2. Vérification & confiance */}
      <article className={cardClass}>
        <div className="flex items-start gap-3">
          <span className={iconWrapClass}>
            <BadgeCheck size={20} />
          </span>
          <div className="flex-1">
            <h3 className="font-serif text-lg font-semibold text-choco-700">
              Vérification &amp; confiance
            </h3>
            <p className="mt-1 text-sm text-ink-700/75">
              {TRUST_COPY[verificationStatus]}
            </p>
          </div>
        </div>
      </article>

      {/* 3. Confidentialité */}
      <article className={cardClass}>
        <div className="flex items-start gap-3">
          <span className={iconWrapClass}>
            <ShieldCheck size={20} />
          </span>
          <div className="flex-1">
            <h3 className="font-serif text-lg font-semibold text-choco-700">
              Confidentialité
            </h3>
            <p className="mt-1 text-sm text-ink-700/75">
              {blurPhotos
                ? "Vos photos restent floutées par défaut. Vous gardez la maîtrise de ce que vous partagez, et avec qui."
                : "Vos photos sont actuellement visibles. Vous pouvez réactiver le floutage par défaut depuis votre profil."}
            </p>
          </div>
        </div>
        <Link
          href="/profile"
          className="mt-4 inline-flex items-center gap-1.5 self-start text-sm font-semibold text-choco-700 transition-colors hover:text-choco-800"
        >
          Gérer ma confidentialité
          <ArrowRight size={15} />
        </Link>
      </article>

      {/* 4. Découverte des profils — EN PRÉPARATION (aucun matching actif) */}
      <article className={cardClass}>
        <div className="flex items-start gap-3">
          <span className={iconWrapClass}>
            <Compass size={20} />
          </span>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-serif text-lg font-semibold text-choco-700">
                Découverte des profils
              </h3>
              <span className={softPillClass}>
                <Clock size={13} />
                En préparation
              </span>
            </div>
            <p className="mt-1 text-sm text-ink-700/75">
              La découverte de profils compatibles ouvrira progressivement. Nous
              préparons un espace sobre et respectueux pour vos futures
              rencontres.
            </p>
          </div>
        </div>
      </article>

      {/* 5. Prochaines étapes (pleine largeur) */}
      <article className={`${cardClass} sm:col-span-2`}>
        <div className="flex items-start gap-3">
          <span className={iconWrapClass}>
            <ListChecks size={20} />
          </span>
          <div className="flex-1">
            <h3 className="font-serif text-lg font-semibold text-choco-700">
              Prochaines étapes
            </h3>
            <ul className="mt-3 flex flex-col gap-2.5">
              <Step
                done={complete}
                label="Compléter votre profil matrimonial"
              />
              <Step
                done={complete}
                label="Vérifier l’exactitude de vos informations"
              />
              <Step
                done={verificationStatus === "approved"}
                label="Laisser notre équipe valider votre profil"
              />
              <Step
                upcoming
                label="Découvrir des profils compatibles (bientôt disponible)"
              />
            </ul>
          </div>
        </div>
      </article>
    </section>
  );
}

function Step({
  label,
  done = false,
  upcoming = false,
}: {
  label: string;
  done?: boolean;
  upcoming?: boolean;
}) {
  const Icon = upcoming ? CircleDashed : done ? CircleCheck : HeartHandshake;
  const tone = upcoming
    ? "text-ink-700/45"
    : done
      ? "text-emerald-700"
      : "text-choco-600";

  return (
    <li className="flex items-start gap-2.5 text-sm">
      <Icon size={17} className={`mt-0.5 shrink-0 ${tone}`} />
      <span className={upcoming ? "text-ink-700/55" : "text-ink-700/80"}>
        {label}
      </span>
    </li>
  );
}
