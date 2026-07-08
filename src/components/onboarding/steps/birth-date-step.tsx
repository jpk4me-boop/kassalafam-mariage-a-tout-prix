"use client";

import { CalendarDays } from "lucide-react";

import { isAdultBirthDate, ONBOARDING_MIN_AGE } from "@/lib/onboarding/completion";
import { Input, Label } from "@/components/ui/field";
import { StepShell } from "@/components/onboarding/step-shell";

export function BirthDateStep({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  // Avertissement inline dès qu'une date < 18 ans est saisie (exigence 7). La
  // validation « dure » (blocage du bouton Continuer) est faite par le wizard.
  const tooYoung = value !== "" && !isAdultBirthDate(value);

  return (
    <StepShell
      title="Votre date de naissance"
      description="Elle reste privée : seuls votre âge et des mises en relation adaptées en découlent."
    >
      <div>
        <Label htmlFor="birth_date">Date de naissance</Label>
        <Input
          id="birth_date"
          name="birth_date"
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          aria-describedby="birth_date_help"
          aria-invalid={tooYoung}
        />
        <p
          id="birth_date_help"
          className={
            tooYoung
              ? "mt-1.5 flex items-center gap-1.5 text-xs text-red-700"
              : "mt-1.5 flex items-center gap-1.5 text-xs text-ink-700/55"
          }
        >
          <CalendarDays size={13} className="shrink-0" />
          {tooYoung
            ? `Vous devez avoir au moins ${ONBOARDING_MIN_AGE} ans pour vous inscrire.`
            : `Inscription réservée aux personnes de ${ONBOARDING_MIN_AGE} ans et plus.`}
        </p>
      </div>
    </StepShell>
  );
}
