import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Compass,
  HeartHandshake,
  ListChecks,
  Sparkles,
  UserRound,
} from "lucide-react";

import { PageBackNav } from "@/components/member/page-back-nav";
import { DiscoverCriteria } from "@/components/member/discover-criteria";
import { DiscoverUniverses } from "@/components/member/discover-universes";

/**
 * Hub de découverte des profils.
 *
 * Cette page permet au membre connecté de vérifier ses critères, de choisir son
 * univers matrimonial puis d'ouvrir le flux réel correspondant. Les profils ne
 * sont jamais chargés sur ce hub : chaque page d'univers applique sa propre
 * garde de vérification et appelle la RPC sécurisée `discover_candidates`.
 *
 * L'accès est protégé par le middleware (préfixe « /discover » dans
 * PROTECTED_PREFIXES) au même titre que /dashboard et /profile : un visiteur
 * non authentifié est redirigé vers /login.
 */

const cardClass =
  "flex flex-col rounded-3xl border border-champagne-500/30 bg-cream-50/60 p-6 shadow-card";

const iconWrapClass =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-champagne-400/20 text-choco-600";

const PRINCIPLES = [
  "Confidentialité",
  "Photos floutées par défaut",
  "Profils vérifiés",
  "Démarche de mariage sérieux",
];

export default function DiscoverPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageBackNav />

      {/* En-tête */}
      <section>
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-champagne-600">
          Espace membre
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-serif text-3xl font-semibold text-choco-700 sm:text-4xl">
            Découverte des profils
          </h1>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-600/30 bg-emerald-600/10 px-3 py-1 text-xs font-medium text-emerald-800">
            <BadgeCheck size={13} />
            Espace actif
          </span>
        </div>
        <p className="mt-3 max-w-2xl text-ink-700/75">
          Choisissez votre univers matrimonial pour découvrir les profils
          compatibles déjà disponibles. L’accès aux cartes reste réservé aux
          membres dont le profil a été vérifié par notre équipe.
        </p>
      </section>

      {/* Rappel des principes */}
      <section className="rounded-3xl border border-champagne-500/30 bg-cream-100/50 p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {PRINCIPLES.map((principle, i) => (
            <span key={principle} className="flex items-center gap-2">
              {i > 0 ? (
                <span className="hidden text-champagne-500/70 sm:inline">•</span>
              ) : null}
              <span className="text-sm font-medium text-ink-800">
                {principle}
              </span>
            </span>
          ))}
        </div>
      </section>

      {/* Mes critères de découverte (L3C-C) — résumé du profil du membre connecté */}
      <DiscoverCriteria />

      {/* Choisir mon univers de découverte (L3C-C) — préférence volontaire,
          enregistrée uniquement sur le profil connecté */}
      <DiscoverUniverses />

      {/* Repères de découverte */}
      <section className="grid gap-4 sm:grid-cols-2">
        {/* 1. Découverte par univers */}
        <article className={cardClass}>
          <div className="flex items-start gap-3">
            <span className={iconWrapClass}>
              <Sparkles size={20} />
            </span>
            <div className="flex-1">
              <h2 className="font-serif text-lg font-semibold text-choco-700">
                Découverte par univers
              </h2>
              <p className="mt-1 text-sm text-ink-700/75">
                Ouvrez l’espace chrétien, islamique ou pour tous afin de parcourir
                immédiatement les profils vérifiés compatibles avec votre choix.
              </p>
            </div>
          </div>
        </article>

        {/* 2. Comment les profils sont proposés */}
        <article className={cardClass}>
          <div className="flex items-start gap-3">
            <span className={iconWrapClass}>
              <Compass size={20} />
            </span>
            <div className="flex-1">
              <h2 className="font-serif text-lg font-semibold text-choco-700">
                Comment les profils sont proposés
              </h2>
              <p className="mt-1 text-sm text-ink-700/75">
                Les suggestions s’appuient sur les informations que vous
                renseignez vous-même : univers, situation, attentes et lieu de
                résidence. Une approche transparente, pensée pour des rencontres
                réellement compatibles.
              </p>
            </div>
          </div>
        </article>

        {/* 3. Confidentialité et contrôle */}
        <article className={cardClass}>
          <div className="flex items-start gap-3">
            <span className={iconWrapClass}>
              <HeartHandshake size={20} />
            </span>
            <div className="flex-1">
              <h2 className="font-serif text-lg font-semibold text-choco-700">
                Confidentialité et contrôle
              </h2>
              <p className="mt-1 text-sm text-ink-700/75">
                Vos photos restent floutées par défaut et les profils sont
                vérifiés par notre équipe. Vous gardez la maîtrise de ce que vous
                partagez, et avec qui.
              </p>
            </div>
          </div>
        </article>

        {/* 4. Préparer mon profil */}
        <article className={cardClass}>
          <div className="flex items-start gap-3">
            <span className={iconWrapClass}>
              <ListChecks size={20} />
            </span>
            <div className="flex-1">
              <h2 className="font-serif text-lg font-semibold text-choco-700">
                Améliorer mes suggestions
              </h2>
              <p className="mt-1 text-sm text-ink-700/75">
                Un profil complet et sincère améliore la pertinence des profils
                proposés. Renseignez votre situation, vos attentes et ajoutez une
                photo principale avant de commencer.
              </p>
            </div>
          </div>
        </article>
      </section>

      {/* Appel à l'action */}
      <section className="flex flex-col items-start gap-3 rounded-3xl border border-champagne-500/30 bg-cream-50/60 p-6 shadow-card sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div>
          <h2 className="font-serif text-xl font-semibold text-choco-700">
            Votre profil est la base
          </h2>
          <p className="mt-1 max-w-xl text-sm text-ink-700/75">
            Complétez votre profil matrimonial pour recevoir des suggestions
            plus pertinentes et accéder sereinement aux espaces de découverte.
          </p>
        </div>
        <Link
          href="/profile"
          className="inline-flex shrink-0 items-center gap-2 rounded-full bg-gradient-to-br from-choco-600 to-choco-800 px-5 py-2.5 text-sm font-semibold text-cream-50 shadow-[0_12px_30px_-12px_rgba(43,26,18,0.8)] ring-1 ring-inset ring-champagne-400/30 transition-transform hover:-translate-y-0.5"
        >
          <UserRound size={16} />
          Compléter mon profil
          <ArrowRight size={16} />
        </Link>
      </section>
    </div>
  );
}
