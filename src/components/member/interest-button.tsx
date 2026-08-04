"use client";

import { useState } from "react";
import { Check, Heart, Loader2 } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import type {
  DiscoveryUniverse,
  ExpressInterestResult,
} from "@/lib/types/database";

/**
 * « Exprimer un intérêt » (extrait de discover-feed-view pour réutilisation
 * sur /favorites — Lot 2). SEULE écriture : la RPC contrôlée
 * `express_interest` (aucun insert/update direct de `matches`).
 */

type InterestState =
  | "idle"
  | "sending"
  | "created"
  | "already"
  | "matched"
  | "error";

export function InterestButton({
  targetId,
  universe,
  initial,
}: {
  targetId: string;
  universe: DiscoveryUniverse;
  initial?: "sent" | "matched";
}) {
  const [state, setState] = useState<InterestState>(
    initial === "matched" ? "matched" : initial === "sent" ? "already" : "idle",
  );

  const clickable = state === "idle" || state === "error";

  async function express() {
    if (!clickable) return;
    setState("sending");
    const supabase = createClient();
    const { data, error } = await supabase.rpc("express_interest", {
      p_target: targetId,
      p_universe: universe,
    });
    if (error) {
      console.error("[interest] express_interest échoué:", error.message);
      setState("error");
      return;
    }
    const result = data as ExpressInterestResult;
    setState(
      result === "matched"
        ? "matched"
        : result === "created"
          ? "created"
          : "already",
    );
  }

  const label =
    state === "sending"
      ? "Envoi…"
      : state === "created"
        ? "Intérêt exprimé"
        : state === "already"
          ? "Intérêt déjà exprimé"
          : state === "matched"
            ? "Intérêt mutuel"
            : "Exprimer un intérêt";

  const done = state === "created" || state === "already" || state === "matched";

  const softMessage =
    state === "created"
      ? "Votre intérêt a été enregistré avec respect."
      : state === "matched"
        ? "L’intérêt est mutuel. Les prochaines étapes arriveront bientôt."
        : state === "error"
          ? "Impossible d’enregistrer cet intérêt pour le moment."
          : null;

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={express}
        disabled={!clickable}
        aria-busy={state === "sending"}
        className={
          done
            ? "inline-flex cursor-default items-center justify-center gap-2 rounded-full border border-emerald-600/30 bg-emerald-600/10 px-4 py-2 text-sm font-medium text-emerald-700"
            : "inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-br from-choco-600 to-choco-800 px-4 py-2 text-sm font-semibold text-cream-50 shadow-[0_12px_30px_-12px_rgba(43,26,18,0.8)] ring-1 ring-inset ring-champagne-400/30 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
        }
      >
        {state === "sending" ? (
          <Loader2 size={14} className="animate-spin" />
        ) : done ? (
          <Check size={14} />
        ) : (
          <Heart size={14} />
        )}
        {label}
      </button>
      {softMessage ? (
        <p
          className={`px-1 text-xs ${
            state === "error" ? "text-red-700" : "text-ink-700/60"
          }`}
        >
          {softMessage}
        </p>
      ) : null}
    </div>
  );
}
