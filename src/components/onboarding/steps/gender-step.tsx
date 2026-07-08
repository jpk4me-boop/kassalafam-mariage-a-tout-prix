"use client";

import type { Gender } from "@/lib/types/database";
import { GENDER_OPTIONS } from "@/lib/onboarding/options";
import { Input, Label } from "@/components/ui/field";
import { ChoiceTile } from "@/components/onboarding/choice-tile";
import { StepShell } from "@/components/onboarding/step-shell";

export function GenderStep({
  firstName,
  value,
  onFirstNameChange,
  onChange,
  disabled,
}: {
  firstName: string;
  value: "" | Gender;
  onFirstNameChange: (value: string) => void;
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

      <div
        role="radiogroup"
        aria-label="Genre"
        className="grid grid-cols-1 gap-2.5 sm:grid-cols-2"
      >
        {GENDER_OPTIONS.map((option) => (
          <ChoiceTile
            key={option.value}
            selected={value === option.value}
            onSelect={() => onChange(option.value)}
            disabled={disabled}
          >
            {option.label}
          </ChoiceTile>
        ))}
      </div>
    </StepShell>
  );
}
