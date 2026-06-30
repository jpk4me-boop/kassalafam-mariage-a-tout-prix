"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, LayoutDashboard } from "lucide-react";

/**
 * Navigation de retour pour les pages membres secondaires (L3C-B).
 *
 * - « Retour » s'appuie sur l'historique du navigateur (router.back()), avec un
 *   repli sobre vers /dashboard lorsqu'il n'y a pas de page précédente dans
 *   l'onglet (accès direct par URL).
 * - « Dashboard » renvoie explicitement vers /dashboard.
 *
 * Purement présentationnel : aucune logique d'auth, aucune requête.
 */
export function PageBackNav() {
  const router = useRouter();

  function handleBack() {
    // S'il existe une entrée précédente dans l'historique de l'onglet, on y
    // revient ; sinon (accès direct au lien) on bascule proprement vers le
    // tableau de bord plutôt que de quitter le site.
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/dashboard");
    }
  }

  return (
    <nav className="flex items-center justify-between gap-3">
      <button
        type="button"
        onClick={handleBack}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-700/70 transition-colors hover:text-choco-700"
      >
        <ArrowLeft size={16} />
        Retour
      </button>
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 rounded-full border border-champagne-500/40 bg-cream-50/60 px-3.5 py-1.5 text-sm font-medium text-choco-700 transition-colors hover:bg-champagne-400/15"
      >
        <LayoutDashboard size={15} />
        Dashboard
      </Link>
    </nav>
  );
}
