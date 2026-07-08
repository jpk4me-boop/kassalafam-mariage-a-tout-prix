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
  PROFILE_TEXT_MAX,
  type Option,
} from "@/lib/onboarding/options";
import { Label, Textarea } from "@/components/ui/field";
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
