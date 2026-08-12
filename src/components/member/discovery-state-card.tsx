import Link from "next/link";
import { ArrowRight, ShieldCheck, UserRound } from "lucide-react";

/**
 * Carte d'état de la découverte — profil non vérifié, genre manquant, univers
 * non choisi, service indisponible.
 *
 * Partagée par le flux en grille (<DiscoverFeed>) et par l'Explorer
 * (<ExplorerFeed>) : les deux modes lisent la MÊME RPC derrière les MÊMES
 * gardes, ils doivent donc dire exactement la même chose au membre. Deux
 * copies auraient dérivé à la première retouche.
 */
export function DiscoveryStateCard({
  title,
  text,
  cta,
}: {
  title: string;
  text: string;
  cta?: {
    href: string;
    label: string;
  };
}) {
  return (
    <section className="flex flex-col items-start gap-3 rounded-3xl border border-champagne-500/30 bg-cream-50/60 p-6 shadow-card sm:p-8">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-champagne-400/20 text-choco-600">
        <ShieldCheck size={20} />
      </span>

      <div>
        <h2 className="font-serif text-xl font-semibold text-choco-700">
          {title}
        </h2>

        <p className="mt-1 max-w-xl text-sm text-ink-700/75">{text}</p>
      </div>

      {cta ? (
        <Link
          href={cta.href}
          className="mt-1 inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-choco-600 to-choco-800 px-5 py-2.5 text-sm font-semibold text-cream-50 shadow-[0_12px_30px_-12px_rgba(43,26,18,0.8)] ring-1 ring-inset ring-champagne-400/30 transition-transform hover:-translate-y-0.5"
        >
          <UserRound size={16} />
          {cta.label}
          <ArrowRight size={16} />
        </Link>
      ) : null}
    </section>
  );
}
