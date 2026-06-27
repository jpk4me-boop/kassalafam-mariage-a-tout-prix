import { BadgeCheck, Lock, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

type FloatingProfileCardProps = {
  initial: string;
  age: number;
  city: string;
  gradient: string;
  matched?: number;
  className?: string;
};

/**
 * Carte de profil anonymisée et floutée pour le visuel hero.
 * Aucune vraie donnée : initiale + ville, photo volontairement floutée
 * pour illustrer la confidentialité de la plateforme.
 */
export function FloatingProfileCard({
  initial,
  age,
  city,
  gradient,
  matched,
  className,
}: FloatingProfileCardProps) {
  return (
    <div
      className={cn(
        "w-44 rounded-2xl glass p-3 shadow-card sm:w-52",
        className,
      )}
    >
      <div className="relative overflow-hidden rounded-xl">
        <div className={cn("h-28 w-full sm:h-32", gradient)} />
        {/* Voile de confidentialité (photo floutée) */}
        <div className="absolute inset-0 backdrop-blur-md" />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-cream-50/85 font-serif text-lg font-semibold text-choco-700">
            {initial}
          </span>
        </div>
        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-choco-700/85 px-2 py-1 text-[0.6rem] font-semibold text-cream-50">
          <Lock size={10} /> Photo protégée
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-ink-800">
            {initial}. · {age} ans
          </span>
          <span className="flex items-center gap-1 text-xs text-ink-700/70">
            <MapPin size={11} /> {city}
          </span>
        </div>
        <BadgeCheck className="text-champagne-600" size={18} />
      </div>

      {typeof matched === "number" ? (
        <div className="mt-3 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-cream-300/70">
            <div
              className="h-full rounded-full bg-gradient-to-r from-champagne-500 to-choco-500"
              style={{ width: `${matched}%` }}
            />
          </div>
          <span className="text-[0.65rem] font-semibold text-choco-600">
            {matched}%
          </span>
        </div>
      ) : null}
    </div>
  );
}
