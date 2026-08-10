import { BadgeCheck, EyeOff, HeartHandshake } from "lucide-react";

/**
 * Bandeau de preuves — bande horizontale qui sépare le hero du reste de la
 * page (inspiration : bandeau « membres actifs / profils vérifiés / gratuit »
 * des plateformes concurrentes).
 *
 * PARTI PRIS D'HONNÊTETÉ : aucune statistique inventée, aucun compteur de
 * membres. Trois preuves VRAIES et vérifiables dans le produit : vérification
 * manuelle des profils, inscription gratuite, photos protégées/floutées.
 */

const PROOFS = [
  {
    icon: BadgeCheck,
    strong: "Profils vérifiés",
    rest: "à la main, un par un",
  },
  {
    icon: HeartHandshake,
    strong: "Inscription gratuite",
    rest: "sans engagement",
  },
  {
    icon: EyeOff,
    strong: "Photos protégées",
    rest: "vous décidez qui voit quoi",
  },
];

export function ProofBar() {
  return (
    <section
      aria-label="Nos engagements"
      className="border-y border-champagne-500/25 bg-cream-100/70"
    >
      <ul className="mx-auto flex max-w-6xl flex-col divide-y divide-champagne-500/20 px-4 sm:px-6 md:flex-row md:divide-y-0 md:divide-x">
        {PROOFS.map((proof) => (
          <li
            key={proof.strong}
            className="flex flex-1 items-center justify-center gap-2.5 py-3.5 text-sm md:py-4"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-champagne-400/20 text-champagne-600">
              <proof.icon size={15} />
            </span>
            <p className="text-ink-700/75">
              <span className="font-semibold text-choco-700">
                {proof.strong}
              </span>{" "}
              {proof.rest}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
