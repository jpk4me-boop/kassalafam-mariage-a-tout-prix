import Link from "next/link";
import { Crown, Lock, UserRound } from "lucide-react";

/**
 * Lot B2 — état VERROUILLÉ d'un signal entrant (visiteurs, favoris entrants).
 *
 * Règle d'honnêteté : sans cet écran, un membre non premium verrait l'état
 * vide (« aucune visite ») alors que des visites existent. On annonce donc le
 * NOMBRE RÉEL — renvoyé par les compteurs libres `count_profile_visitors` et
 * `count_favorited_by` — et on masque uniquement les identités.
 *
 * Aucune donnée personnelle n'atteint ce composant : il ne reçoit qu'un entier.
 * Les silhouettes affichées sont des gabarits vides, pas des profils floutés.
 */
export function PremiumLockedSignal({
  count,
  title,
  description,
  ctaLabel,
}: {
  count: number;
  title: string;
  description: string;
  ctaLabel: string;
}) {
  const pluriel = count > 1;
  const apercus = Math.min(count, 4);

  return (
    <section className="overflow-hidden rounded-3xl border border-champagne-500/30 bg-cream-50/60 shadow-card">
      <div className="flex flex-col items-center gap-3 border-b border-champagne-500/20 bg-gradient-to-br from-champagne-400/12 to-cream-100/40 px-6 py-8 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full border border-amber-500/35 bg-amber-50 text-amber-700">
          <Lock size={20} />
        </span>

        <p className="font-serif text-2xl font-semibold text-choco-700">
          {count} {pluriel ? "personnes" : "personne"}
        </p>

        <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-choco-700/75">
          {title}
        </h2>

        <p className="mx-auto max-w-xl text-sm leading-6 text-ink-700/70">
          {description}
        </p>

        <Link
          href="/premium"
          className="mt-2 inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-choco-600 to-choco-800 px-5 py-2.5 text-sm font-semibold text-cream-50 shadow-[0_12px_30px_-12px_rgba(43,26,18,0.8)] ring-1 ring-inset ring-champagne-400/30 transition-transform hover:-translate-y-0.5"
        >
          <Crown size={16} />
          {ctaLabel}
        </Link>
      </div>

      {/* Gabarits : aucune donnée réelle, uniquement le nombre de cartes. */}
      <ul
        aria-hidden="true"
        className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4"
      >
        {Array.from({ length: apercus }, (_, index) => (
          <li
            key={index}
            className="flex aspect-[4/5] flex-col items-center justify-center gap-2 rounded-2xl border border-champagne-500/25 bg-cream-100/50 text-ink-700/20 blur-[3px]"
          >
            <UserRound size={30} />
            <span className="h-2 w-14 rounded-full bg-ink-700/15" />
            <span className="h-2 w-10 rounded-full bg-ink-700/10" />
          </li>
        ))}
      </ul>
    </section>
  );
}
