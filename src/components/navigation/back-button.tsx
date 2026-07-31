"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

/**
 * Flèche « Retour » vers la page précédente, avec repli configurable lorsque
 * l'onglet n'a pas d'historique (accès direct par URL) — on ne quitte jamais
 * le site. Purement présentationnel : aucune logique d'auth, aucune requête.
 */
export function BackButton({
  fallbackHref = "/",
  className,
}: {
  /** Destination lorsque l'historique de l'onglet est vide. */
  fallbackHref?: string;
  className?: string;
}) {
  const router = useRouter();

  function handleBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(fallbackHref);
    }
  }

  return (
    <button
      type="button"
      onClick={handleBack}
      className={
        className ??
        "inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-2 py-2 text-sm font-medium text-ink-700/70 transition-colors hover:text-choco-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-champagne-500/60"
      }
    >
      <ArrowLeft size={16} />
      Retour
    </button>
  );
}
