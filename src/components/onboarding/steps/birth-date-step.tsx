"use client";

import { CalendarDays, Check } from "lucide-react";

import { isAdultBirthDate, ONBOARDING_MIN_AGE } from "@/lib/onboarding/completion";
import { Input, Label } from "@/components/ui/field";
import { StepShell } from "@/components/onboarding/step-shell";

/** Âge révolu à aujourd'hui, ou null si la date est vide/invalide/future. */
function computeAge(value: string): number | null {
  if (!value) return null;
  const birth = new Date(`${value}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const anniversaryPassed =
    today.getMonth() > birth.getMonth() ||
    (today.getMonth() === birth.getMonth() &&
      today.getDate() >= birth.getDate());
  if (!anniversaryPassed) age -= 1;
  return age >= 0 && age <= 120 ? age : null;
}

/** « 27 décembre 1995 » — jamais d'heure, jamais de fuseau surprise. */
function formatBirthDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  return date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

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
  // Confirmation VIVANTE : la date reformulée + l'âge calculé, uniquement
  // quand la date est valide ET majeure — une faute de frappe se voit tout de
  // suite (« 13 ans » ou « 130 ans » saute aux yeux).
  const age = !tooYoung ? computeAge(value) : null;

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
        {age !== null ? (
          <p
            role="status"
            className="mt-2 flex items-center justify-between gap-2 rounded-2xl border border-emerald-600/25 bg-emerald-50/70 px-3.5 py-2.5 text-sm text-emerald-800"
          >
            <span className="flex items-center gap-1.5">
              <Check size={14} className="shrink-0" />
              {formatBirthDate(value)}
            </span>
            <span className="shrink-0 font-semibold tabular-nums">
              {age} ans
            </span>
          </p>
        ) : null}
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
