/**
 * L3D-B PR2 — Squelette de chargement du flux de découverte (fallback Suspense).
 * Sobre, mobile-first, sans donnée. Purement présentationnel.
 */
export function DiscoverFeedSkeleton() {
  return (
    <ul
      className="grid grid-cols-1 gap-5 sm:grid-cols-2"
      aria-hidden="true"
    >
      {[0, 1, 2, 3].map((i) => (
        <li
          key={i}
          className="flex flex-col overflow-hidden rounded-3xl border border-champagne-500/30 bg-cream-50/60 shadow-card"
        >
          <div className="aspect-[4/5] animate-pulse bg-cream-100/70" />
          <div className="flex flex-col gap-3 p-4">
            <div className="h-5 w-2/3 animate-pulse rounded-full bg-cream-100/80" />
            <div className="h-4 w-1/2 animate-pulse rounded-full bg-cream-100/70" />
            <div className="h-6 w-24 animate-pulse rounded-full bg-cream-100/70" />
            <div className="mt-2 h-9 w-full animate-pulse rounded-full bg-cream-100/70" />
          </div>
        </li>
      ))}
    </ul>
  );
}
