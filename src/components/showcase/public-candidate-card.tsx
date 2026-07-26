import Link from "next/link";
import { HeartHandshake, MapPin } from "lucide-react";

import { VerificationBadge } from "@/components/member/verification-badge";
import { PublicCandidatePhoto } from "@/components/showcase/public-candidate-photo";
import {
  candidateMaritalStatusLabel,
  candidateUniverseLabel,
} from "@/lib/showcase/labels";
import type { PublicCandidateSummary } from "@/lib/server/public-candidate-showcase";

export function PublicCandidateCard({
  candidate,
}: {
  candidate: PublicCandidateSummary;
}) {
  const href = `/candidats/${candidate.slug}`;
  const photoSrc = `${href}/photo`;
  const location = `${candidate.city}, ${candidate.country}`;

  return (
    <article className="overflow-hidden rounded-3xl border border-champagne-500/30 bg-cream-50/70 shadow-[0_18px_40px_-28px_rgba(43,26,18,0.5)] transition-transform hover:-translate-y-1">
      <Link
        href={href}
        aria-label={`Voir le profil public de ${candidate.firstName}`}
        className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-champagne-500/70 focus-visible:ring-inset"
      >
        <div className="relative aspect-[4/5] w-full bg-cream-100/60">
          <PublicCandidatePhoto
            src={photoSrc}
            alt={`Photo publique choisie par ${candidate.firstName}`}
          />
        </div>

        <div className="flex flex-col gap-3 p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h2 className="font-serif text-2xl font-semibold text-choco-700">
              {candidate.firstName}
              <span className="ml-2 text-lg font-normal text-ink-700/70">
                {candidate.age}&nbsp;ans
              </span>
            </h2>
            <VerificationBadge status="approved" />
          </div>

          <p className="inline-flex items-center gap-1.5 text-sm text-ink-700/75">
            <MapPin size={15} className="text-champagne-600" aria-hidden />
            {location}
          </p>

          <div className="flex flex-wrap gap-2 text-xs font-medium">
            <span className="rounded-full border border-champagne-500/25 bg-champagne-400/10 px-3 py-1.5 text-choco-700">
              {candidateUniverseLabel(candidate.universe)}
            </span>
            <span className="rounded-full border border-champagne-500/25 bg-cream-100/70 px-3 py-1.5 text-ink-700/75">
              {candidateMaritalStatusLabel(candidate.maritalStatus)}
            </span>
          </div>

          <span className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-choco-700">
            <HeartHandshake size={16} className="text-champagne-600" aria-hidden />
            Découvrir ce profil
          </span>
        </div>
      </Link>
    </article>
  );
}
