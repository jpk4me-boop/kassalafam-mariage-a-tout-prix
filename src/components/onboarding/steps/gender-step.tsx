"use client";

import type { Gender } from "@/lib/types/database";
import { GENDER_OPTIONS, PSEUDO_MAX } from "@/lib/onboarding/options";
import { MessageCircle } from "lucide-react";
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
            onSelect={() => onChange(option.value)}
            disabled={disabled}
            title={option.label}
          />
        ))}
      </div>
    </StepShell>
  );
}
