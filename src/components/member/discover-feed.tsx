import Link from "next/link";
import {
  ArrowRight,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import { DiscoverFeedView } from "@/components/member/discover-feed-view";
import { loadDiscoveryCandidates } from "@/lib/discovery/load-candidates";
import type {
  DiscoveryUniverse,
} from "@/lib/types/database";

function StateCard({
  title,
  text,
  cta,
}: {
  title: string;
  text: string;
  cta?: {
    href: string;
    label: string;
  };
}) {
  return (
    <section className="flex flex-col items-start gap-3 rounded-3xl border border-champagne-500/30 bg-cream-50/60 p-6 shadow-card sm:p-8">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-champagne-400/20 text-choco-600">
        <ShieldCheck size={20} />
      </span>

      <div>
        <h2 className="font-serif text-xl font-semibold text-choco-700">
          {title}
        </h2>

        <p className="mt-1 max-w-xl text-sm text-ink-700/75">
          {text}
        </p>
      </div>

      {cta ? (
        <Link
          href={cta.href}
          className="mt-1 inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-choco-600 to-choco-800 px-5 py-2.5 text-sm font-semibold text-cream-50 shadow-[0_12px_30px_-12px_rgba(43,26,18,0.8)] ring-1 ring-inset ring-champagne-400/30 transition-transform hover:-translate-y-0.5"
        >
          <UserRound size={16} />
          {cta.label}
          <ArrowRight size={16} />
        </Link>
      ) : null}
    </section>
  );
}

export async function DiscoverFeed({
  universe,
}: {
  universe: DiscoveryUniverse;
}) {
  const result = await loadDiscoveryCandidates({
    universe,
    includeRelationshipStates: true,
  });

  if (
    result.status === "unauthenticated" ||
    result.status === "needs_verification"
  ) {
    return (
      <StateCard
        title="Votre profil doit être vérifié avant la découverte."
        text="Notre équipe vérifie chaque profil pour garantir des rencontres sérieuses et sûres. Vous serez prévenu(e) dès validation."
        cta={{
          href: "/profile",
          label: "Voir mon profil",
        }}
      />
    );
  }

  if (result.status === "needs_gender") {
    return (
      <StateCard
        title="Complétez votre profil pour découvrir des profils."
        text="Indiquez votre genre dans votre profil : il nous aide à proposer des personnes réellement compatibles."
        cta={{
          href: "/profile",
          label: "Compléter mon profil",
        }}
      />
    );
  }

  if (result.status === "needs_universe") {
    return (
      <StateCard
        title="Choisissez votre univers matrimonial."
        text="Votre univers permet de proposer des profils cohérents avec votre démarche."
        cta={{
          href: "/discover",
          label: "Choisir mon univers",
        }}
      />
    );
  }

  if (result.status === "unavailable") {
    return (
      <StateCard
        title="La découverte est momentanément indisponible."
        text="Réessayez dans un instant."
      />
    );
  }

  return (
    <DiscoverFeedView
      candidates={result.candidates}
      universe={result.universe}
      initialStates={result.initialStates}
    />
  );
}
