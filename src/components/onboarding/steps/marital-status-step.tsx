"use client";

import type { MaritalStatus } from "@/lib/types/database";
import { MARITAL_STATUS_OPTIONS } from "@/lib/onboarding/options";
import { ChoiceTile } from "@/components/onboarding/choice-tile";
import { StepShell } from "@/components/onboarding/step-shell";

export function MaritalStatusStep({
  value,
  onChange,
  disabled,
}: {
  value: "" | MaritalStatus;
  onChange: (value: MaritalStatus) => void;
  disabled?: boolean;
}) {
  return (
    <StepShell
      title="Votre situation matrimoniale"
      description="Une présentation honnête favorise des rencontres sincères et respectueuses."
    >
      <div
        role="radiogroup"
        aria-label="Situation matrimoniale"
        className="grid grid-cols-1 gap-2.5 sm:grid-cols-2"
      >
        {MARITAL_STATUS_OPTIONS.map((option) => (
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
