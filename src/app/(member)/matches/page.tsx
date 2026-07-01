import { Suspense } from "react";
import Link from "next/link";
import { ArrowRight, Compass, ShieldCheck, UserRound } from "lucide-react";

import { PageBackNav } from "@/components/member/page-back-nav";
import { createClient } from "@/lib/supabase/server";
import { getMyRelationships } from "@/lib/relationships/get-relationships";
import { MatchesView } from "@/components/member/matches-view";

/**
 * Page « Mes relations » (L3D-C) — Server Component.
 *
 * Regroupe les Intérêts reçus / envoyés / Matches acceptés. Suit le même patron
 * de confidentialité que la découverte :
 *   - garde viewer (authentifié + approuvé) AVANT tout chargement ;
 *   - lecture via RPC sécurisée + signature serveur des photos ;
 *   - ne transmet au client QUE des champs sûrs + `signedUrl`.
 *
 * Accès protégé par le middleware (préfixe « /matches »).
 */

const PRINCIPLES = ["Confidentialité", "Profils vérifiés", "Réponses respectueuses"];

function StateCard({
  title,
  text,
  cta,
}: {
  title: string;
  text: string;
  cta?: { href: string; label: string };
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
        <p className="mt-1 max-w-xl text-sm text-ink-700/75">{text}</p>
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

function MatchesSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden>
      <div className="h-10 w-full max-w-md animate-pulse rounded-full bg-cream-100/70" />
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="overflow-hidden rounded-3xl border border-champagne-500/30 bg-cream-50/60 shadow-card"
          >
            <div className="aspect-[4/5] animate-pulse bg-cream-100/70" />
            <div className="flex flex-col gap-2 p-4">
              <div className="h-5 w-2/3 animate-pulse rounded bg-cream-100/70" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-cream-100/70" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

async function MatchesFeed() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Le middleware redirige déjà un anonyme ; garde défensive.
  if (!user) {
    return (
      <StateCard
        title="Votre profil doit être vérifié avant l’accès aux relations."
        text="Notre équipe vérifie chaque profil pour garantir des échanges sérieux et sûrs."
        cta={{ href: "/profile", label: "Voir mon profil" }}
      />
    );
  }

  const { data: viewer, error: viewerError } = await supabase
    .from("profiles")
    .select("verification_status")
    .eq("id", user.id)
    .maybeSingle();

  if (viewerError) {
    return (
      <StateCard
        title="Vos relations sont momentanément indisponibles."
        text="Réessayez dans un instant."
      />
    );
  }

  // Viewer non approuvé → message doux, AUCUN chargement de relations.
  if (!viewer || viewer.verification_status !== "approved") {
    return (
      <StateCard
        title="Votre profil doit être vérifié avant l’accès aux relations."
        text="Notre équipe vérifie chaque profil pour garantir des échanges sérieux et sûrs. Vous serez prévenu(e) dès validation."
        cta={{ href: "/profile", label: "Voir mon profil" }}
      />
    );
  }

  const relationships = await getMyRelationships();

  if (!relationships) {
    return (
      <StateCard
        title="Vos relations sont momentanément indisponibles."
        text="Réessayez dans un instant."
      />
    );
  }

  return (
    <MatchesView
      received={relationships.received}
      sent={relationships.sent}
      matched={relationships.matched}
    />
  );
}

export default function MatchesPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageBackNav />

      <section>
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-champagne-600">
          Espace membre
        </p>
        <h1 className="mt-2 font-serif text-3xl font-semibold text-choco-700 sm:text-4xl">
          Mes relations
        </h1>
        <p className="mt-3 max-w-2xl text-ink-700/75">
          Retrouvez ici les intérêts que vous avez reçus, ceux que vous avez
          exprimés, et vos mises en relation mutuelles. Prenez le temps de
          répondre avec sérieux et respect.
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

      <Suspense fallback={<MatchesSkeleton />}>
        <MatchesFeed />
      </Suspense>

      {/* Liens utiles */}
      <section className="flex flex-col gap-3 sm:flex-row">
        <Link
          href="/discover"
          className="inline-flex items-center justify-center gap-2 rounded-full border border-champagne-500/40 bg-cream-50/60 px-5 py-2.5 text-sm font-semibold text-choco-700 transition-colors hover:bg-champagne-400/15"
        >
          <Compass size={16} />
          Découvrir des profils
        </Link>
        <Link
          href="/profile"
          className="inline-flex items-center justify-center gap-2 rounded-full border border-champagne-500/40 bg-cream-50/60 px-5 py-2.5 text-sm font-semibold text-choco-700 transition-colors hover:bg-champagne-400/15"
        >
          <UserRound size={16} />
          Mon profil
          <ArrowRight size={16} />
        </Link>
      </section>
    </div>
  );
}
