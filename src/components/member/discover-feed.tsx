import Link from "next/link";
import { ArrowRight, ShieldCheck, UserRound } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { attachSignedPhotos } from "@/lib/discovery/candidate-photos";
import type {
  DiscoverCandidate,
  DiscoverCandidateWithPhoto,
  DiscoveryUniverse,
} from "@/lib/types/database";
import { DiscoverFeedView } from "@/components/member/discover-feed-view";

/**
 * L3D-B PR2 — Flux de découverte réel (Server Component).
 *
 * Confidentialité (contraintes absolues) :
 *   - lit le profil du SEUL viewer connecté (RLS owner-only) pour la garde ;
 *   - si le viewer n'est pas `approved` (ou genre inconnu), NE FAIT AUCUN appel
 *     à la RPC : zéro donnée candidat n'est chargée (aucune fuite possible) ;
 *   - sinon appelle `discover_candidates` (chemin de lecture sécurisé PR1) puis
 *     signe les photos côté serveur (`attachSignedPhotos`) ;
 *   - ne transmet au client QUE des champs sûrs + `signedUrl` (jamais
 *     `storage_path`, `birth_date`, `verification_*`, `email`, etc.).
 *
 * Aucune écriture DB, aucune interaction (likes/matches/messages/paiement).
 */

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

export async function DiscoverFeed({
  universe,
}: {
  universe: DiscoveryUniverse;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Le middleware redirige déjà un visiteur non authentifié ; garde défensive.
  if (!user) {
    return (
      <StateCard
        title="Votre profil doit être vérifié avant la découverte."
        text="Notre équipe vérifie chaque profil pour garantir des rencontres sérieuses et sûres."
        cta={{ href: "/profile", label: "Voir mon profil" }}
      />
    );
  }

  // Profil du SEUL viewer (owner-only) pour la garde — pas de données d'autrui.
  const { data: viewer, error: viewerError } = await supabase
    .from("profiles")
    .select("gender, verification_status")
    .eq("id", user.id)
    .maybeSingle();

  if (viewerError) {
    console.error("[discover-feed] lecture viewer échouée:", viewerError.message);
    return (
      <StateCard
        title="La découverte est momentanément indisponible."
        text="Réessayez dans un instant."
      />
    );
  }

  // Viewer non approuvé → message doux, AUCUN appel RPC (aucune fuite).
  if (!viewer || viewer.verification_status !== "approved") {
    return (
      <StateCard
        title="Votre profil doit être vérifié avant la découverte."
        text="Notre équipe vérifie chaque profil pour garantir des rencontres sérieuses et sûres. Vous serez prévenu(e) dès validation."
        cta={{ href: "/profile", label: "Voir mon profil" }}
      />
    );
  }

  // Genre inconnu → impossible de proposer des profils compatibles (MVP hétéro).
  if (!viewer.gender) {
    return (
      <StateCard
        title="Complétez votre profil pour découvrir des profils."
        text="Indiquez votre genre dans votre profil : il nous aide à proposer des personnes réellement compatibles."
        cta={{ href: "/profile", label: "Compléter mon profil" }}
      />
    );
  }

  // Lecture sécurisée des candidats + signature serveur des photos.
  // (Aucune JSX construite dans le try/catch : on calcule puis on rend après.)
  let candidates: DiscoverCandidateWithPhoto[] | null = null;
  try {
    const { data, error } = await supabase.rpc("discover_candidates", {
      p_universe: universe,
    });
    if (error) throw error;
    candidates = await attachSignedPhotos((data ?? []) as DiscoverCandidate[]);
  } catch (e) {
    console.error(
      "[discover-feed] échec découverte:",
      e instanceof Error ? e.message : String(e),
    );
  }

  if (!candidates) {
    return (
      <StateCard
        title="La découverte est momentanément indisponible."
        text="Réessayez dans un instant."
      />
    );
  }

  return <DiscoverFeedView candidates={candidates} universe={universe} />;
}
