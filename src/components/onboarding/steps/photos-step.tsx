"use client";

import { ImageOff, Star } from "lucide-react";

import {
  ProfilePhotos,
  type ProfilePhotosState,
} from "@/components/member/profile-photos";
import { StepShell } from "@/components/onboarding/step-shell";

/**
 * Étape photos — RÉUTILISE le composant privé `ProfilePhotos` (bucket privé
 * `profile-photos`, aucune logique d'upload dupliquée). Le wizard gate la
 * soumission finale sur `hasPrimary` via `onStateChange`.
 */
export function PhotosStep({
  hasPrimary,
  onStateChange,
}: {
  hasPrimary: boolean;
  onStateChange: (state: ProfilePhotosState) => void;
}) {
  return (
    <StepShell
      title="Vos photos"
      description="Ajoutez au moins une photo et désignez votre photo principale pour finaliser votre profil."
    >
      {!hasPrimary ? (
        <div
          role="status"
          className="flex items-start gap-2.5 rounded-2xl border border-champagne-500/40 bg-champagne-400/10 px-4 py-3 text-sm text-ink-800"
        >
          <ImageOff size={16} className="mt-0.5 shrink-0 text-choco-600" />
          <span>
            Une <span className="font-medium">photo principale</span> est
            requise avant l’envoi. Ajoutez une photo puis touchez «&nbsp;
            <Star size={12} className="inline align-[-1px]" /> Définir comme
            principale&nbsp;».
          </span>
        </div>
      ) : null}

      <ProfilePhotos bare onStateChange={onStateChange} />
    </StepShell>
  );
}
