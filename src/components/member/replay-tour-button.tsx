"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Compass, Loader2 } from "lucide-react";

import { createClient } from "@/lib/supabase/client";

/**
 * « Revoir la visite guidée » (Lot E) — remet `profiles.tour_completed_at` à
 * NULL, ce qui relance la visite au prochain passage sur un univers de
 * découverte.
 *
 * Le repli localStorage posé par la visite est effacé lui aussi : sans cela, le
 * filet anti-clignotement empêcherait la relance sur CE navigateur, et le
 * membre croirait le bouton cassé.
 */

const REPLI_KEY = "kassalafam_tour_decouverte_vue";

export function ReplayTourButton() {
  const [etat, setEtat] = useState<"repos" | "envoi" | "fait" | "erreur">(
    "repos",
  );

  async function relancer() {
    setEtat("envoi");

    try {
      window.localStorage.removeItem(REPLI_KEY);
    } catch {
      // ignore
    }

    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setEtat("erreur");
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({ tour_completed_at: null })
      .eq("id", user.id);

    if (error) {
      console.error("[visite guidée] relance impossible:", error.message);
      setEtat("erreur");
      return;
    }

    setEtat("fait");
  }

  return (
    <section className="flex flex-col gap-3 rounded-3xl border border-champagne-500/30 bg-cream-50/60 p-6 shadow-card sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="flex items-center gap-2 font-serif text-lg font-semibold text-choco-700">
          <Compass size={18} className="text-choco-600" />
          Visite guidée de la découverte
        </h2>
        <p className="mt-1 max-w-xl text-sm text-ink-700/70">
          Les six repères du premier passage : photos protégées, « Voir plus »,
          intérêt, favoris. Vous pouvez les revoir quand vous voulez.
        </p>

        {etat === "fait" ? (
          <p className="mt-2 text-sm font-medium text-emerald-800">
            C’est noté : la visite se relancera à votre prochaine découverte.
          </p>
        ) : null}

        {etat === "erreur" ? (
          <p className="mt-2 text-sm text-red-800">
            Relance impossible pour le moment. Réessayez dans un instant.
          </p>
        ) : null}
      </div>

      {etat === "fait" ? (
        <Link
          href="/discover"
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-gradient-to-br from-choco-600 to-choco-800 px-5 py-2.5 text-sm font-semibold text-cream-50 shadow-[0_12px_30px_-12px_rgba(43,26,18,0.8)] ring-1 ring-inset ring-champagne-400/30 transition-transform hover:-translate-y-0.5"
        >
          Aller à la découverte
          <ArrowRight size={16} />
        </Link>
      ) : (
        <button
          type="button"
          onClick={relancer}
          disabled={etat === "envoi"}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-champagne-500/40 bg-cream-50 px-5 py-2.5 text-sm font-medium text-choco-700 transition-colors hover:bg-champagne-400/15 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {etat === "envoi" ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Relance…
            </>
          ) : (
            "Revoir la visite guidée"
          )}
        </button>
      )}
    </section>
  );
}
