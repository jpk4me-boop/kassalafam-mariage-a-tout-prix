"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import type { CandidateDetails } from "@/lib/types/database";

/**
 * Visites (Lot 3) — volet « Voir plus » d'une carte membre.
 *
 * L'ouverture charge le détail sûr via la RPC `view_candidate_details`
 * (bio, attentes) : c'est cet acte volontaire qui constitue la « visite »
 * enregistrée côté serveur (sauf visites discrètes du viewer, gérées par la
 * RPC). Le détail n'est chargé qu'une fois, puis simplement replié/déplié.
 */

type DetailsState =
  | { status: "closed" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "unavailable" }
  | { status: "ready"; details: CandidateDetails };

export function CandidateDetailsToggle({ targetId }: { targetId: string }) {
  const [state, setState] = useState<DetailsState>({ status: "closed" });
  const [collapsed, setCollapsed] = useState(false);

  async function open() {
    if (state.status === "ready") {
      setCollapsed(false);
      return;
    }

    setState({ status: "loading" });

    const supabase = createClient();
    const { data, error } = await supabase.rpc("view_candidate_details", {
      p_target: targetId,
    });

    if (error) {
      console.error("[visites] détail indisponible:", error.message);
      setState({ status: "error" });
      return;
    }

    const details = (data as CandidateDetails[] | null)?.[0];

    if (!details) {
      // Cible devenue invisible (0 ligne, sans erreur côté RPC).
      setState({ status: "unavailable" });
      return;
    }

    setCollapsed(false);
    setState({ status: "ready", details });
  }

  const isOpen = state.status === "ready" && !collapsed;

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => (isOpen ? setCollapsed(true) : open())}
        disabled={state.status === "loading"}
        aria-expanded={isOpen}
        className="inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium text-choco-600 transition-colors hover:bg-champagne-400/15 hover:text-choco-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {state.status === "loading" ? (
          <Loader2 size={14} className="animate-spin" />
        ) : isOpen ? (
          <ChevronUp size={14} />
        ) : (
          <ChevronDown size={14} />
        )}
        {isOpen ? "Voir moins" : "Voir plus"}
      </button>

      {state.status === "error" ? (
        <p className="px-1 text-xs text-red-700">
          Détail momentanément indisponible. Réessayez dans un instant.
        </p>
      ) : null}

      {state.status === "unavailable" ? (
        <p className="px-1 text-xs text-ink-700/60">
          Ce profil n’est plus disponible pour le moment.
        </p>
      ) : null}

      {isOpen ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-champagne-500/25 bg-cream-100/40 p-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-champagne-700">
              À propos
            </p>
            <p className="mt-1 whitespace-pre-line text-sm leading-6 text-ink-700/80">
              {state.details.bio?.trim() ||
                "Ce membre n’a pas encore rédigé sa présentation."}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-champagne-700">
              Ce qu’il/elle recherche
            </p>
            <p className="mt-1 whitespace-pre-line text-sm leading-6 text-ink-700/80">
              {state.details.partner_expectations?.trim() ||
                "Ce membre n’a pas encore décrit ses attentes."}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
