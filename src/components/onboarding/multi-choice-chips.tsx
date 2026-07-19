"use client";

import {
  CHOICE_SET_MAX,
  CHOICE_SET_MIN,
  type Option,
} from "@/lib/onboarding/options";
import { ChoiceCard } from "@/components/onboarding/choice-card";

/** Bascule une valeur dans une liste, en respectant le plafond (max 3). Retire
 *  si déjà présente ; ignore l'ajout au-delà du plafond. */
function toggle<T extends string>(list: T[], value: T): T[] {
  if (list.includes(value)) return list.filter((v) => v !== value);
  if (list.length >= CHOICE_SET_MAX) return list;
  return [...list, value];
}

/**
 * Groupe de sélection multiple bornée (2 à 3 choix) partagé par le parcours —
 * extrait de l'étape « projet matrimonial » sans changement de comportement :
 * compteur visible, plafond appliqué sans figer la désélection, rôles ARIA
 * checkbox portés par les cartes.
 */
export function MultiChoiceChips<T extends string>({
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
            <ChoiceCard
              key={option.value}
              multi
              selected={selected}
              onSelect={() => onChange(toggle(values, option.value))}
              // Empêche d'aller au-delà de 3 sans figer la désélection.
              disabled={disabled || (atMax && !selected)}
              title={option.label}
            />
          );
        })}
      </div>
    </fieldset>
  );
}
