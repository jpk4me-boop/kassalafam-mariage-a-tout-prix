import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-32 text-center">
      <span className="font-serif text-6xl text-gold-gradient">404</span>
      <h1 className="mt-4 font-serif text-2xl text-choco-700">
        Page introuvable
      </h1>
      <p className="mt-3 max-w-sm text-sm text-ink-700/70">
        Cette page n&apos;existe pas ou a été déplacée. Revenez à l&apos;accueil
        pour poursuivre votre recherche.
      </p>
      <Link
        href="/"
        className="mt-8 inline-flex items-center justify-center rounded-full bg-gradient-to-br from-choco-600 to-choco-800 px-6 py-3 text-sm font-semibold text-cream-50 ring-1 ring-inset ring-champagne-400/30"
      >
        Retour à l&apos;accueil
      </Link>
    </main>
  );
}
