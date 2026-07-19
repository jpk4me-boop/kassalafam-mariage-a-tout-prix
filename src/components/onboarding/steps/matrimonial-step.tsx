"use client";

import type {
  ChildrenIntent,
  MarriageGoal,
  PartnerTrait,
  PolygamyPreference,
} from "@/lib/types/database";
import {
  CHILDREN_INTENT_OPTIONS,
  MARRIAGE_GOAL_OPTIONS,
  PARTNER_TRAIT_OPTIONS,
  POLYGAMY_PREFERENCE_OPTIONS,
  PROFILE_TEXT_MAX,
} from "@/lib/onboarding/options";
import { Label, Textarea } from "@/components/ui/field";
import { ChoiceCard } from "@/components/onboarding/choice-card";
import { MultiChoiceChips } from "@/components/onboarding/multi-choice-chips";
import { StepShell } from "@/components/onboarding/step-shell";

/** Textarea requise avec compteur — mêmes règles que /profile (≤ 2000). */
function CountedTextarea({
  id,
  label,
  placeholder,
  value,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        <span className="text-xs text-ink-700/55">
          {value.length}/{PROFILE_TEXT_MAX}
        </span>
      </div>
      <Textarea
        id={id}
        name={id}
        maxLength={PROFILE_TEXT_MAX}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    </div>
  );
}

export function MatrimonialStep({
  marriageGoals,
  partnerTraits,
  polygamyPreference,
  childrenIntent,
  bio,
  partnerExpectations,
  onMarriageGoalsChange,
  onPartnerTraitsChange,
  onPolygamyChange,
  onChildrenChange,
  onBioChange,
  onPartnerExpectationsChange,
  disabled,
}: {
  marriageGoals: MarriageGoal[];
  partnerTraits: PartnerTrait[];
  polygamyPreference: "" | PolygamyPreference;
  childrenIntent: "" | ChildrenIntent;
  bio: string;
  partnerExpectations: string;
  onMarriageGoalsChange: (next: MarriageGoal[]) => void;
  onPartnerTraitsChange: (next: PartnerTrait[]) => void;
  onPolygamyChange: (value: PolygamyPreference) => void;
  onChildrenChange: (value: ChildrenIntent) => void;
  onBioChange: (value: string) => void;
  onPartnerExpectationsChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <StepShell
      title="Votre projet matrimonial"
      description="Ce qui compte pour vous et ce que vous recherchez chez un futur conjoint."
    >
      <MultiChoiceChips
        legend="Vos objectifs de mariage"
        options={MARRIAGE_GOAL_OPTIONS}
        values={marriageGoals}
        onChange={onMarriageGoalsChange}
        disabled={disabled}
      />

      <MultiChoiceChips
        legend="Qualités recherchées"
        options={PARTNER_TRAIT_OPTIONS}
        values={partnerTraits}
        onChange={onPartnerTraitsChange}
        disabled={disabled}
      />

      <div>
        <Label>Positionnement sur la polygamie</Label>
        <div
          role="radiogroup"
          aria-label="Positionnement sur la polygamie"
          className="grid grid-cols-1 gap-2.5 sm:grid-cols-3"
        >
          {POLYGAMY_PREFERENCE_OPTIONS.map((option) => (
            <ChoiceCard
              key={option.value}
              selected={polygamyPreference === option.value}
              onSelect={() => onPolygamyChange(option.value)}
              disabled={disabled}
              title={option.label}
            />
          ))}
        </div>
      </div>

      <div>
        <Label>Projet d’enfants</Label>
        <div
          role="radiogroup"
          aria-label="Projet d'enfants"
          className="grid grid-cols-1 gap-2.5 sm:grid-cols-2"
        >
          {CHILDREN_INTENT_OPTIONS.map((option) => (
            <ChoiceCard
              key={option.value}
              selected={childrenIntent === option.value}
              onSelect={() => onChildrenChange(option.value)}
              disabled={disabled}
              title={option.label}
            />
          ))}
        </div>
      </div>

      <CountedTextarea
        id="onboarding_bio"
        label="Présentez-vous"
        placeholder="Quelques mots sur vous, vos valeurs et votre projet de foyer…"
        value={bio}
        onChange={onBioChange}
        disabled={disabled}
      />

      <CountedTextarea
        id="onboarding_partner_expectations"
        label="Ce que vous recherchez chez votre futur conjoint"
        placeholder="Décrivez les qualités, valeurs et le projet de vie que vous recherchez chez un futur conjoint…"
        value={partnerExpectations}
        onChange={onPartnerExpectationsChange}
        disabled={disabled}
      />
    </StepShell>
  );
}
