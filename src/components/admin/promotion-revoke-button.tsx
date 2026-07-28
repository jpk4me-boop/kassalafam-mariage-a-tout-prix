"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Loader2 } from "lucide-react";

import { revokePromotionLinkAction } from "@/app/admin/members/promotion-actions";

/**
 * Révocation d'un lien promotionnel actif (PR #82). Confirmation explicite,
 * état de chargement, double soumission bloquée (useTransition), historique
 * jamais supprimé. L'acteur est résolu côté serveur — seul le linkId part du
 * navigateur.
 */
export function PromotionRevokeButton({
  linkId,
  tokenPrefix,
}: {
  linkId: string;
  /** Préfixe affiché dans la confirmation pour identifier le lien. */
  tokenPrefix: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function revoke() {
    setError(null);
    const confirmed = window.confirm(
      `Révoquer le lien « ${tokenPrefix}… » ? Il cessera immédiatement de fonctionner.`,
    );
    if (!confirmed) return;

    startTransition(async () => {
      const res = await revokePromotionLinkAction({ linkId });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // Révocation déjà effectuée ailleurs : l'état rafraîchi fait foi.
      router.refresh();
    });
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={revoke}
        disabled={pending}
        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-red-400/35 bg-red-400/10 px-4 py-2 text-xs font-semibold text-red-700/90 transition-colors hover:bg-red-400/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? (
          <Loader2 size={13} className="animate-spin" aria-hidden />
        ) : (
          <Ban size={13} aria-hidden />
        )}
        Révoquer
      </button>
      {error ? (
        <span className="text-[11px] font-medium text-red-700" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}
