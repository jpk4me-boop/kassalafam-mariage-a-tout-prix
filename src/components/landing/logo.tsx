import { cn } from "@/lib/utils";

type LogoProps = {
  className?: string;
  variant?: "light" | "dark";
  /** Carré « K » — permet de réduire la marque sur petits écrans. */
  markClassName?: string;
  /** Mot-marque « KASSALAFAM ». */
  wordmarkClassName?: string;
  /** Baseline « Mariage à Tout Prix » — peut être masquée sur mobile. */
  baselineClassName?: string;
};

/**
 * Logo KASSALAFAM avec baseline "Mariage à Tout Prix".
 * variant "dark" pour fonds clairs, "light" pour fonds sombres (footer).
 *
 * Le bloc texte est en `min-w-0` : placé dans un conteneur contraint, il se
 * laisse rétrécir au lieu de pousser ses voisins hors de l'écran (débordement
 * horizontal de l'en-tête membre constaté sur mobile le 06/08).
 */
export function Logo({
  className,
  variant = "dark",
  markClassName,
  wordmarkClassName,
  baselineClassName,
}: LogoProps) {
  const wordmark = variant === "dark" ? "text-choco-700" : "text-cream-50";
  const baseline = variant === "dark" ? "text-ink-700/70" : "text-cream-200/70";

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span
        className={cn(
          "relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-choco-600 to-choco-800 shadow-[0_8px_24px_-10px_rgba(43,26,18,0.7)]",
          markClassName,
        )}
      >
        <span className="absolute inset-0 rounded-xl ring-1 ring-inset ring-champagne-400/40" />
        <span className="font-serif text-xl font-semibold text-gold-gradient">
          K
        </span>
      </span>
      <span className="flex min-w-0 flex-col leading-none">
        <span
          className={cn(
            "font-serif text-lg font-semibold tracking-wide",
            wordmark,
            wordmarkClassName,
          )}
        >
          KASSALAFAM
        </span>
        <span
          className={cn(
            "mt-1 text-[0.62rem] font-medium uppercase tracking-[0.28em]",
            baseline,
            baselineClassName,
          )}
        >
          Mariage à Tout Prix
        </span>
      </span>
    </div>
  );
}
