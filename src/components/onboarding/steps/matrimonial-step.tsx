"use client";

import type {
  ChildrenIntent,
  MarriageGoal,
  PartnerTrait,
  PolygamyPreference,
} from "@/lib/types/database";
import {
  CHILDREN_INTENT_OPTIONS,
  CHOICE_SET_MAX,
  CHOICE_SET_MIN,
  MARRIAGE_GOAL_OPTIONS,
  PARTNER_TRAIT_OPTIONS,
  POLYGAMY_PREFERENCE_OPTIONS,
  type Option,
} from "@/lib/onboarding/options";
import { Label } from "@/components/ui/field";
import { ChoiceTile } from "@/components/onboarding/choice-tile";
import { StepShell } from "@/components/onboarding/step-shell";

/** Bascule une valeur dans une liste, en respectant le plafond (max 3). Retire
 *  si déjà présente ; ignore l'ajout au-delà du plafond. */
function toggle<T extends string>(list: T[], value: T): T[] {
  if (list.includes(value)) return list.filter((v) => v !== value);
  if (list.length >= CHOICE_SET_MAX) return list;
  return [...list, value];
}

function MultiChoiceGroup<T extends string>({
  legend,
  options,
  values,
  onChange,
  disabled,
}: {
  legend: string;
  options: Option<T>[];
  values: T[];
  onChange: (next: T[]) => void;
  disabled?: boolean;
}) {
  const atMax = values.length >= CHOICE_SET_MAX;
  return (
    <fieldset className="flex flex-col gap-2.5">
      <legend className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-ink-700">{legend}</span>
        <span className="text-xs text-ink-700/55">
          {values.length}/{CHOICE_SET_MAX} · {CHOICE_SET_MIN} minimum
        </span>
      </legend>
      <div
        role="group"
        aria-label={legend}
        className="grid grid-cols-1 gap-2.5 sm:grid-cols-2"
      >
        {options.map((option) => {
          const selected = values.includes(option.value);
          return (
            <ChoiceTile
              key={option.value}
              multi
              selected={selected}
              onSelect={() => onChange(toggle(values, option.value))}
              // Empêche d'aller au-delà de 3 sans figer la désélection.
              disabled={disabled || (atMax && !selected)}
            >
              {option.label}
            </ChoiceTile>
          );
        })}
      </div>
    </fieldset>
  );
}

export function MatrimonialStep({
  marriageGoals,
  partnerTraits,
  polygamyPreference,
  childrenIntent,
  onMarriageGoalsChange,
  onPartnerTraitsChange,
  onPolygamyChange,
  onChildrenChange,
  disabled,
}: {
  marriageGoals: MarriageGoal[];
  partnerTraits: PartnerTrait[];
  polygamyPreference: "" | PolygamyPreference;
  childrenIntent: "" | ChildrenIntent;
  onMarriageGoalsChange: (next: MarriageGoal[]) => void;
  onPartnerTraitsChange: (next: PartnerTrait[]) => void;
  onPolygamyChange: (value: PolygamyPreference) => void;
  onChildrenChange: (value: ChildrenIntent) => void;
  disabled?: boolean;
}) {
  return (
    <StepShell
      title="Votre projet matrimonial"
      description="Ce qui compte pour vous et ce que vous recherchez chez un futur conjoint."
    >
      <MultiChoiceGroup
        legend="Vos objectifs de mariage"
        options={MARRIAGE_GOAL_OPTIONS}
        values={marriageGoals}
        onChange={onMarriageGoalsChange}
        disabled={disabled}
      />

      <MultiChoiceGroup
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
            <ChoiceTile
              key={option.value}
              selected={polygamyPreference === option.value}
              onSelect={() => onPolygamyChange(option.value)}
              disabled={disabled}
            >
              {option.label}
            </ChoiceTile>
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
            <ChoiceTile
              key={option.value}
              selected={childrenIntent === option.value}
              onSelect={() => onChildrenChange(option.value)}
              disabled={disabled}
            >
              {option.label}
            </ChoiceTile>
          ))}
        </div>
      </div>
    </StepShell>
  );
}
