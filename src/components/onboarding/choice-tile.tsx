"use client";

import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Tuile sélectionnable réutilisable (choix unique ou multiple), accessible au
 * clavier. `multi` bascule le rôle ARIA (radio ↔ checkbox) et la forme de
 * l'indicateur (rond ↔ carré). Identité visuelle KASSALAFAM (champagne / choco).
 */
export function ChoiceTile({
  selected,
  onSelect,
  disabled,
  multi = false,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
  multi?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role={multi ? "checkbox" : "radio"}
      aria-checked={selected}
      onClick={onSelect}
      disabled={disabled}
      className={cn(
        "group relative flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left text-sm font-medium shadow-sm transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-champagne-400/50",
        selected
          ? "border-choco-500 bg-champagne-400/15 text-choco-700"
          : "border-champagne-500/30 bg-cream-50/70 text-ink-800 hover:border-champagne-500/60 hover:bg-champagne-400/10",
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
      <span>{children}</span>
    </button>
  );
}
