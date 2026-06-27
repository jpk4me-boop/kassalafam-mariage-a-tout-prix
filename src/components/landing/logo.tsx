import { cn } from "@/lib/utils";

type LogoProps = {
  className?: string;
  variant?: "light" | "dark";
};

/**
 * Logo KASSALAFAM avec baseline "Mariage à Tout Prix".
 * variant "dark" pour fonds clairs, "light" pour fonds sombres (footer).
 */
export function Logo({ className, variant = "dark" }: LogoProps) {
  const wordmark = variant === "dark" ? "text-choco-700" : "text-cream-50";
  const baseline = variant === "dark" ? "text-ink-700/70" : "text-cream-200/70";

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-choco-600 to-choco-800 shadow-[0_8px_24px_-10px_rgba(43,26,18,0.7)]">
        <span className="absolute inset-0 rounded-xl ring-1 ring-inset ring-champagne-400/40" />
        <span className="font-serif text-xl font-semibold text-gold-gradient">
          K
        </span>
      </span>
      <span className="flex flex-col leading-none">
        <span
          className={cn(
            "font-serif text-lg font-semibold tracking-wide",
            wordmark,
          )}
        >
          KASSALAFAM
        </span>
        <span
          className={cn(
            "mt-1 text-[0.62rem] font-medium uppercase tracking-[0.28em]",
            baseline,
          )}
        >
          Mariage à Tout Prix
        </span>
      </span>
    </div>
  );
}
