"use client";

import type { MaritalStatus, Religion } from "@/lib/types/database";
import {
  MARITAL_STATUS_OPTIONS,
  RELIGION_OPTIONS,
} from "@/lib/onboarding/options";
import { ChoiceTile } from "@/components/onboarding/choice-tile";
import { StepShell } from "@/components/onboarding/step-shell";

export function MaritalStatusStep({
  value,
  religion,
  onChange,
  onReligionChange,
  disabled,
}: {
  value: "" | MaritalStatus;
  religion: "" | Religion;
  onChange: (value: MaritalStatus) => void;
  onReligionChange: (value: Religion) => void;
  disabled?: boolean;
}) {
  return (
    <StepShell
      title="Votre situation"
      description="Une présentation honnête favorise des rencontres sincères et respectueuses."
    >
      <div className="flex flex-col gap-6">
        <div>
          <p className="mb-2.5 text-sm font-medium text-ink-800">
            Votre situation matrimoniale
          </p>
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
        </div>

        <div>
          <p className="mb-2.5 text-sm font-medium text-ink-800">
            Votre religion
          </p>
          <div
            role="radiogroup"
            aria-label="Religion"
            className="grid grid-cols-1 gap-2.5 sm:grid-cols-2"
          >
            {RELIGION_OPTIONS.map((option) => (
              <ChoiceTile
                key={option.value}
                selected={religion === option.value}
                onSelect={() => onReligionChange(option.value)}
                disabled={disabled}
              >
                {option.label}
              </ChoiceTile>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-700/55">
            Cette information reste distincte de votre univers de découverte et
            n’est pas affichée publiquement.
          </p>
        </div>
      </div>
    </StepShell>
  );
}
