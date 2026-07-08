"use client";

import type { EducationLevel } from "@/lib/types/database";
import {
  EDUCATION_LEVEL_OPTIONS,
  HEIGHT_MAX_CM,
  HEIGHT_MIN_CM,
  PROFESSION_MAX,
} from "@/lib/onboarding/options";
import { Input, Label, Select } from "@/components/ui/field";
import { StepShell } from "@/components/onboarding/step-shell";

export function ProfessionalStep({
  profession,
  educationLevel,
  heightCm,
  onProfessionChange,
  onEducationChange,
  onHeightChange,
  disabled,
}: {
  profession: string;
  educationLevel: "" | EducationLevel;
  heightCm: string;
  onProfessionChange: (value: string) => void;
  onEducationChange: (value: "" | EducationLevel) => void;
  onHeightChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <StepShell
      title="Profession et parcours"
      description="Quelques repères sur votre quotidien et votre formation."
    >
      <div>
        <Label htmlFor="profession">Profession</Label>
        <Input
          id="profession"
          name="profession"
          type="text"
          maxLength={PROFESSION_MAX}
          placeholder="Par exemple : enseignante, ingénieur, commerçant…"
          value={profession}
          onChange={(e) => onProfessionChange(e.target.value)}
          disabled={disabled}
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <Label htmlFor="education_level">Niveau d’études</Label>
          <Select
            id="education_level"
            name="education_level"
            value={educationLevel}
            onChange={(e) =>
              onEducationChange(e.target.value as "" | EducationLevel)
            }
            disabled={disabled}
          >
            <option value="" disabled>
              Sélectionner…
            </option>
            {EDUCATION_LEVEL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label htmlFor="height_cm">Taille (cm)</Label>
          <Input
            id="height_cm"
            name="height_cm"
            type="number"
            inputMode="numeric"
            min={HEIGHT_MIN_CM}
            max={HEIGHT_MAX_CM}
            step={1}
            placeholder="Par exemple : 172"
            value={heightCm}
            onChange={(e) => onHeightChange(e.target.value)}
            disabled={disabled}
          />
          <p className="mt-1.5 text-xs text-ink-700/55">
            Entre {HEIGHT_MIN_CM} et {HEIGHT_MAX_CM} cm.
          </p>
        </div>
      </div>
    </StepShell>
  );
}
