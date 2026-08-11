"use client";

import { useState } from "react";

import type { Gender } from "@/lib/types/database";
import { GENDER_OPTIONS, PSEUDO_MAX } from "@/lib/onboarding/options";
import { Check, MessageCircle, TriangleAlert, X } from "lucide-react";
import { Input, Label } from "@/components/ui/field";
import { ChoiceCard } from "@/components/onboarding/choice-card";
import { StepShell } from "@/components/onboarding/step-shell";

export function GenderStep({
  firstName,
  pseudo,
  whatsappPhone,
  value,
  onFirstNameChange,
  onPseudoChange,
  onWhatsappPhoneChange,
  onChange,
  disabled,
}: {
  firstName: string;
  /** Pseudo affiché (migration 53) — FACULTATIF : remplace le prénom pour les
   *  autres membres dès qu'il est renseigné ; vide = prénom affiché. */
  pseudo: string;
  /** Numéro WhatsApp (migration 55) — REQUIS : canal par lequel le membre est
   *  prévenu. Jamais affiché publiquement. */
  whatsappPhone: string;
  value: "" | Gender;
  onFirstNameChange: (value: string) => void;
  onPseudoChange: (value: string) => void;
  onWhatsappPhoneChange: (value: string) => void;
  onChange: (value: Gender) => void;
  disabled?: boolean;
}) {
  // Confirmation AVANT d'enregistrer un genre (inspiré des parcours
  // concurrents, mais VRAI ici) : après l'envoi du profil, genre et date de
  // naissance deviennent immuables côté base (garde
  // `guard_profile_identity_fields`, correction admin uniquement). Le choix
  // n'est propagé au wizard (`onChange`) qu'une fois confirmé.
  const [pendingGender, setPendingGender] = useState<Gender | null>(null);
  const pendingLabel = GENDER_OPTIONS.find(
    (o) => o.value === pendingGender,
  )?.label;

  return (
    <StepShell
      title="Vous êtes…"
      description="Cette information oriente vos futures mises en relation."
    >
      <div>
        <Label htmlFor="onboarding_first_name">Prénom</Label>
        <Input
          id="onboarding_first_name"
          name="first_name"
          type="text"
          autoComplete="given-name"
          placeholder="Votre prénom"
          value={firstName}
          onChange={(e) => onFirstNameChange(e.target.value)}
          disabled={disabled}
        />
      </div>

      <div>
        <Label htmlFor="onboarding_pseudo">Pseudo affiché (facultatif)</Label>
        <Input
          id="onboarding_pseudo"
          name="pseudo"
          type="text"
          autoComplete="nickname"
          maxLength={PSEUDO_MAX}
          placeholder="Par exemple : Perle237"
          value={pseudo}
          onChange={(e) => onPseudoChange(e.target.value)}
          disabled={disabled}
        />
        <p className="mt-1.5 text-xs text-ink-700/55">
          Si vous le renseignez, ce pseudo remplace votre prénom auprès des
          autres membres. Vous pourrez le modifier à tout moment.
        </p>
      </div>

      <div>
        <Label htmlFor="onboarding_whatsapp">Numéro WhatsApp</Label>
        <Input
          id="onboarding_whatsapp"
          name="whatsapp_phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          maxLength={20}
          placeholder="+237670000000"
          value={whatsappPhone}
          onChange={(e) => onWhatsappPhoneChange(e.target.value)}
          disabled={disabled}
        />
        <p className="mt-1.5 inline-flex items-start gap-1.5 text-xs text-ink-700/55">
          <MessageCircle size={13} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            C’est ici que nous vous préviendrons : nouveau message, nouvel
            intérêt, avancement de votre profil. Votre numéro reste privé — il
            n’est jamais affiché aux autres membres.
          </span>
        </p>
      </div>

      <div
        role="radiogroup"
        aria-label="Genre"
        className="grid grid-cols-1 gap-2.5 sm:grid-cols-2"
      >
        {GENDER_OPTIONS.map((option) => (
          <ChoiceCard
            key={option.value}
            selected={value === option.value}
            onSelect={() => {
              // Re-choisir la valeur déjà enregistrée ne demande rien.
              if (option.value === value) return;
              setPendingGender(option.value);
            }}
            disabled={disabled}
            title={option.label}
          />
        ))}
      </div>

      {pendingGender && pendingLabel ? (
        <div
          role="alertdialog"
          aria-label="Confirmer votre genre"
          className="flex flex-col gap-3 rounded-2xl border border-champagne-500/50 bg-champagne-400/10 p-4"
        >
          <p className="text-sm font-medium text-choco-800">
            Vous confirmez être {pendingLabel === "Homme" ? "un homme" : "une femme"} ?
          </p>
          <p className="flex items-start gap-1.5 text-xs text-ink-700/70">
            <TriangleAlert size={13} className="mt-0.5 shrink-0 text-champagne-600" />
            Ce choix devient définitif après l’envoi de votre profil : il
            détermine vos mises en relation et ne pourra plus être modifié sans
            passer par notre équipe.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPendingGender(null)}
              disabled={disabled}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-champagne-500/40 bg-cream-50/70 px-4 py-2 text-sm font-medium text-ink-700/75 transition-colors hover:bg-champagne-400/15 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <X size={14} />
              Modifier
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(pendingGender);
                setPendingGender(null);
              }}
              disabled={disabled}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-gradient-to-br from-choco-600 to-choco-800 px-4 py-2 text-sm font-semibold text-cream-50 ring-1 ring-inset ring-champagne-400/30 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
            >
              <Check size={14} />
              Oui, je confirme
            </button>
          </div>
        </div>
      ) : (
        <p className="flex items-start gap-1.5 text-xs text-ink-700/60">
          <TriangleAlert size={13} className="mt-0.5 shrink-0 text-champagne-600" />
          Genre et date de naissance deviennent définitifs après l’envoi de
          votre profil.
        </p>
      )}
    </StepShell>
  );
}
