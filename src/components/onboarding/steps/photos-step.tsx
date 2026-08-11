"use client";

import { ImageOff, ShieldCheck, Star } from "lucide-react";

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
  onBusyChange,
}: {
  hasPrimary: boolean;
  onStateChange: (state: ProfilePhotosState) => void;
  onBusyChange?: (busy: boolean) => void;
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

      <ProfilePhotos
        bare
        onStateChange={onStateChange}
        onBusyChange={onBusyChange}
      />

      {/* Pudeur : le floutage EXISTE dans le produit (réglage du profil) —
          on rassure ici, au moment exact où l'hésitation se joue. */}
      <p
        role="note"
        className="flex items-start gap-2 rounded-2xl border border-emerald-600/20 bg-emerald-50/60 px-4 py-3 text-xs leading-relaxed text-emerald-900/85"
      >
        <ShieldCheck size={14} className="mt-0.5 shrink-0 text-emerald-700" />
        <span>
          <span className="font-semibold">Pudeur respectée</span> — vos photos
          peuvent rester <span className="font-semibold">floutées</span> pour
          les autres membres : vous décidez qui voit quoi, à tout moment,
          depuis votre profil.
        </span>
      </p>
    </StepShell>
  );
}
