"use client";

import { useState } from "react";
import { Bookmark, BookmarkCheck, Loader2 } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import type { AddFavoriteResult } from "@/lib/types/database";

/**
 * Favoris (Lot 2) — bouton d'ajout/retrait d'un profil aux favoris.
 *
 * Écritures strictement bornées :
 *   - ajout : RPC contrôlée `add_favorite` (idempotente, gardes serveur) ;
 *   - retrait : DELETE direct autorisé par la policy RLS
 *     « Members can remove their own favorites » (lignes du membre uniquement).
 *
 * `onRemoved` est optionnel (utilisé sur /favorites pour retirer la carte).
 */

type FavoriteState = "idle" | "pending" | "favorited" | "error";

export function FavoriteButton({
  targetId,
  initialFavorited = false,
  onRemoved,
}: {
  targetId: string;
  initialFavorited?: boolean;
  onRemoved?: () => void;
}) {
  const [state, setState] = useState<FavoriteState>(
    initialFavorited ? "favorited" : "idle",
  );

  const favorited = state === "favorited";
  const pending = state === "pending";

  async function toggle() {
    if (pending) return;

    const wasFavorited = favorited;
    setState("pending");

    const supabase = createClient();

    if (wasFavorited) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setState("error");
        return;
      }

      const { error } = await supabase
        .from("member_favorites")
        .delete()
        .eq("user_id", user.id) // RLS le garantit déjà ; explicite et lisible.
        .eq("target_profile_id", targetId);

      if (error) {
        console.error("[favorites] retrait échoué:", error.message);
        setState("error");
        return;
      }

      setState("idle");
      onRemoved?.();
      return;
    }

    const { data, error } = await supabase.rpc("add_favorite", {
      p_target: targetId,
    });

    if (error) {
      console.error("[favorites] ajout échoué:", error.message);
      setState("error");
      return;
    }

    // 'added' comme 'already' aboutissent au même état visuel.
    void (data as AddFavoriteResult);
    setState("favorited");
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={favorited}
      aria-busy={pending}
      className={
        favorited
          ? "inline-flex items-center justify-center gap-1.5 rounded-full border border-champagne-600/50 bg-champagne-400/20 px-4 py-2 text-sm font-medium text-choco-700 transition-colors hover:bg-champagne-400/30"
          : "inline-flex items-center justify-center gap-1.5 rounded-full border border-champagne-500/40 bg-cream-50 px-4 py-2 text-sm font-medium text-ink-700/70 transition-colors hover:bg-champagne-400/15 hover:text-choco-700 disabled:cursor-not-allowed disabled:opacity-60"
      }
    >
      {pending ? (
        <Loader2 size={14} className="animate-spin" />
      ) : favorited ? (
        <BookmarkCheck size={14} />
      ) : (
        <Bookmark size={14} />
      )}
      {favorited ? "Dans vos favoris" : "Ajouter aux favoris"}
      {state === "error" ? (
        <span className="sr-only">Une erreur est survenue, réessayez.</span>
      ) : null}
    </button>
  );
}
