"use client";

import { useState } from "react";
import { Check, Copy, TriangleAlert } from "lucide-react";

/**
 * Bouton « Copier » de la vue Relance : copie l'adresse email dans le
 * presse-papiers — repli fiable quand aucun client `mailto:` n'est configuré
 * sur le poste de l'administrateur. Îlot client MINIMAL : ne reçoit que
 * l'adresse déjà affichée sur la page admin (aucune donnée supplémentaire
 * n'atteint le navigateur, aucun accès DB, aucun secret).
 */
export function CopyEmailButton({ email }: { email: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(email);
      setStatus("copied");
    } catch {
      setStatus("error");
    }
    window.setTimeout(() => setStatus("idle"), 2000);
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={`Copier l'adresse ${email}`}
      className="inline-flex items-center gap-1 rounded-full border border-champagne-500/30 bg-cream-100/60 px-2.5 py-1 text-xs font-medium text-choco-700 transition-colors hover:bg-champagne-400/15"
    >
      {status === "copied" ? (
        <>
          <Check size={13} aria-hidden className="text-emerald-700" />
          Copié
        </>
      ) : status === "error" ? (
        <>
          <TriangleAlert size={13} aria-hidden className="text-red-700" />
          Échec
        </>
      ) : (
        <>
          <Copy size={13} aria-hidden />
          Copier
        </>
      )}
    </button>
  );
}
