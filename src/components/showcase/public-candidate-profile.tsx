import { HeartHandshake, MapPin, ShieldCheck, Target } from "lucide-react";

import { VerificationBadge } from "@/components/member/verification-badge";
import { PublicCandidatePhoto } from "@/components/showcase/public-candidate-photo";
import {
  candidateIntentionLabel,
  candidateMaritalStatusLabel,
  candidateUniverseLabel,
} from "@/lib/showcase/labels";
import type { PublicCandidateShowcase } from "@/lib/server/public-candidate-showcase";

export function PublicCandidateProfile({
  candidate,
}: {
  candidate: PublicCandidateShowcase;
}) {
  const photoSrc = `/candidats/${candidate.slug}/photo`;
  const location = `${candidate.city}, ${candidate.country}`;

  return (
    <article className="overflow-hidden rounded-[2rem] border border-champagne-500/30 bg-cream-50/75 shadow-[0_24px_70px_-42px_rgba(43,26,18,0.65)]">
      <div className="grid lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div className="relative aspect-[4/5] min-h-[360px] bg-cream-100/60 lg:aspect-auto lg:min-h-[620px]">
          <PublicCandidatePhoto
            src={photoSrc}
            alt={`Photo publique choisie par ${candidate.firstName}`}
          />
        </div>

        <div className="flex flex-col gap-6 p-6 sm:p-8 lg:p-10">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="font-serif text-4xl font-semibold text-choco-700 sm:text-5xl">
                {candidate.firstName}
                <span className="ml-3 text-2xl font-normal text-ink-700/65 sm:text-3xl">
                  {candidate.age}&nbsp;ans
                </span>
              </h1>
              <p className="mt-3 inline-flex items-center gap-2 text-sm text-ink-700/75">
                <MapPin size={17} className="text-champagne-600" aria-hidden />
                {location}
              </p>
            </div>
            <VerificationBadge status="approved" />
          </div>

          <div className="flex flex-wrap gap-2 text-sm font-medium">
            <span className="rounded-full border border-champagne-500/25 bg-champagne-400/10 px-3.5 py-2 text-choco-700">
              {candidateUniverseLabel(candidate.universe)}
            </span>
            <span className="rounded-full border border-champagne-500/25 bg-cream-100/70 px-3.5 py-2 text-ink-700/75">
              {candidateMaritalStatusLabel(candidate.maritalStatus)}
            </span>
          </div>

          <p className="inline-flex items-center gap-2 text-sm font-semibold text-choco-700">
            <Target size={17} className="text-champagne-600" aria-hidden />
            {candidateIntentionLabel(candidate.intention)}
          </p>

          <section className="border-t border-champagne-500/20 pt-5">
            <h2 className="font-serif text-2xl font-semibold text-choco-700">
              Sa présentation
            </h2>
            <p className="mt-3 whitespace-pre-line text-sm leading-7 text-ink-700/80">
              {candidate.bio}
            </p>
          </section>

          <section className="border-t border-champagne-500/20 pt-5">
            <h2 className="inline-flex items-center gap-2 font-serif text-2xl font-semibold text-choco-700">
              <HeartHandshake
                size={21}
                className="text-champagne-600"
                aria-hidden
              />
              Ce qu’il ou elle recherche
            </h2>
            <p className="mt-3 whitespace-pre-line text-sm leading-7 text-ink-700/80">
              {candidate.expectations}
            </p>
          </section>

          <p className="mt-auto inline-flex items-start gap-2 rounded-2xl border border-emerald-700/15 bg-emerald-50/60 px-4 py-3 text-xs leading-relaxed text-ink-700/70">
            <ShieldCheck
              size={16}
              className="mt-0.5 shrink-0 text-emerald-700"
              aria-hidden
            />
            Cette présentation est publiée avec le consentement de son titulaire.
            Aucune coordonnée personnelle n’est affichée.
          </p>
        </div>
      </div>
    </article>
  );
}
