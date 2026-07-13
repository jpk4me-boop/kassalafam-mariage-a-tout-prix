import { MapPin, Target, UserRound } from "lucide-react";

import { VerificationBadge } from "@/components/member/verification-badge";
import type { PublicSharedProfile } from "@/lib/server/public-profile-share";

/**
 * Partage PR3 — Carte de présentation LIMITÉE d'un profil partagé (/p/[token]).
 *
 * Composant SERVEUR purement présentationnel : il ne reçoit QUE la projection
 * publique `PublicSharedProfile` (aucun UUID, aucun jeton, aucun chemin
 * Storage) et `photoSrc`, chemin INTERNE de l'endpoint de diffusion contrôlée
 * (/p/[token]/photo) — jamais une URL signée Supabase, qui contiendrait le
 * storage_path (donc l'UUID du profil) en clair. `photoSrc` null → avatar
 * neutre (membre sans photo ou floutage activé) — jamais de flou CSS sur
 * l'image réelle. Aucun bouton de contact, aucune donnée supplémentaire.
 */

function intentionLabel(intention: string): string {
  if (intention === "mariage_serieux") return "Mariage sérieux";
  // Valeur inattendue : libellé générique — jamais de valeur brute en public.
  return "Projet de mariage sérieux";
}

export function SharedProfileCard({
  profile,
  photoSrc,
}: {
  profile: PublicSharedProfile;
  /** Chemin interne de l'endpoint photo, ou null (avatar neutre). */
  photoSrc: string | null;
}) {
  const displayName = profile.firstName ?? "Membre KASSALAFAM";
  const location = [profile.city, profile.country]
    .filter(Boolean)
    .join(", ");

  return (
    <article className="overflow-hidden rounded-3xl border border-champagne-500/30 bg-cream-50/60 shadow-[0_18px_40px_-28px_rgba(43,26,18,0.5)]">
      {/* Média : photo autorisée ou avatar neutre */}
      <div className="relative aspect-[4/5] max-h-[420px] w-full bg-cream-100/50">
        {photoSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoSrc}
            alt={`Photo de ${displayName}`}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-ink-700/40">
            <UserRound size={64} strokeWidth={1.25} aria-hidden />
            <span className="text-xs font-medium">Photo protégée</span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-serif text-2xl font-semibold text-choco-700">
            {displayName}
            {profile.age != null ? (
              <span className="ml-2 text-lg font-normal text-ink-700/70">
                {profile.age}&nbsp;ans
              </span>
            ) : null}
          </h2>
          <VerificationBadge status="approved" />
        </div>

        {location ? (
          <p className="inline-flex items-center gap-1.5 text-sm text-ink-700/75">
            <MapPin size={15} className="text-champagne-600" aria-hidden />
            {location}
          </p>
        ) : null}

        <p className="inline-flex items-center gap-1.5 text-sm font-medium text-choco-700">
          <Target size={15} className="text-champagne-600" aria-hidden />
          {intentionLabel(profile.intention)}
        </p>

        {profile.bio ? (
          <p className="mt-1 border-t border-champagne-500/20 pt-3 text-sm leading-relaxed text-ink-700/80">
            {profile.bio}
          </p>
        ) : null}
      </div>
    </article>
  );
}
