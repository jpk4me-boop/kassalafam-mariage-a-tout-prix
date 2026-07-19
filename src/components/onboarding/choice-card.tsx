"use client";

import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Carte de choix partagée du parcours (choix unique ou multiple), accessible au
 * clavier. Remplace l'ancienne `ChoiceTile` en ajoutant une icône et une
 * description optionnelles, sans changer le comportement : `multi` bascule le
 * rôle ARIA (radio ↔ checkbox) et la forme de l'indicateur (rond ↔ carré).
 * États couverts : normal, survol, sélectionné, désactivé, focus clavier.
 * Identité KASSALAFAM (crème / champagne / chocolat).
 */
export function ChoiceCard({
  selected,
  onSelect,
  disabled,
  multi = false,
  icon,
  title,
  description,
}: {
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
  multi?: boolean;
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role={multi ? "checkbox" : "radio"}
      aria-checked={selected}
      onClick={onSelect}
      disabled={disabled}
      className={cn(
        "group relative flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left shadow-sm transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-champagne-400/50",
        selected
          ? "border-choco-500 bg-champagne-400/15"
          : "border-champagne-500/30 bg-cream-50/70 hover:border-champagne-500/60 hover:bg-champagne-400/10",
        disabled && "cursor-not-allowed opacity-70",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center border transition-colors",
          multi ? "rounded-md" : "rounded-full",
          selected
            ? "border-choco-600 bg-choco-600 text-cream-50"
            : "border-champagne-500/50 bg-cream-50",
        )}
      >
        {selected ? <Check size={13} strokeWidth={3} /> : null}
      </span>

      {icon ? (
        <span
          aria-hidden
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors",
            selected
              ? "bg-choco-600/10 text-choco-700"
              : "bg-champagne-400/15 text-choco-600",
          )}
        >
          {icon}
        </span>
      ) : null}

      <span className="flex min-w-0 flex-col gap-0.5">
        <span
          className={cn(
            "text-sm font-medium",
            selected ? "text-choco-700" : "text-ink-800",
          )}
        >
          {title}
        </span>
        {description ? (
          <span className="text-xs text-ink-700/60">{description}</span>
        ) : null}
      </span>
    </button>
  );
}
