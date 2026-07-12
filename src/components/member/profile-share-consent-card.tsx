"use client";

import { useEffect, useState } from "react";
import { Loader2, Share2, ShieldCheck } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { FormError } from "@/components/ui/field";

/**
 * Carte « Partage public limité du profil » (PR1 partage) — consentement du
 * membre, préalable à toute future création de lien public par
 * l'administration. Composant CLIENT car entièrement interactif : lecture du
 * consentement actif (RLS select_own) + RPC grant/withdraw. Aucun lien n'est
 * créé ici : cette carte ne gère QUE l'autorisation.
 *
 * Le texte affiché reprend le texte OFFICIEL v1 ; la valeur stockée est
 * définie côté serveur par la RPC (le client n'envoie rien).
 */

/** Copie d'affichage du texte officiel v1 (source de vérité : la RPC). */
const CONSENT_TEXT =
  "J’autorise KASSALAFAM à publier et partager une présentation limitée de mon profil à des fins de mise en relation matrimoniale.";

const DATE_FMT = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" });

type ConsentState =
  | { kind: "loading" }
  | { kind: "inactive"; justWithdrawn: boolean }
  | { kind: "active"; consentedAt: string };

export function ProfileShareConsentCard() {
  const [state, setState] = useState<ConsentState>({ kind: "loading" });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      const supabase = createClient();
      // RLS select_own : seule la ligne du membre connecté est visible.
      const { data, error: loadError } = await supabase
        .from("profile_share_consents")
        .select("consented_at")
        .is("withdrawn_at", null)
        .maybeSingle();

      if (!active) return;
      if (loadError) {
        setState({ kind: "inactive", justWithdrawn: false });
        setError("Impossible de charger votre autorisation. Réessayez.");
        return;
      }
      setState(
        data
          ? { kind: "active", consentedAt: data.consented_at }
          : { kind: "inactive", justWithdrawn: false },
      );
    }

    load();
    return () => {
      active = false;
    };
  }, []);

  async function grant() {
    setPending(true);
    setError(null);
    const supabase = createClient();
    const { data, error: rpcError } = await supabase.rpc(
      "grant_my_profile_share_consent",
    );
    setPending(false);
    if (rpcError || !data?.[0]) {
      setError("L’autorisation n’a pas pu être enregistrée. Réessayez.");
      return;
    }
    setState({ kind: "active", consentedAt: data[0].consented_at });
  }

  async function withdraw() {
    setPending(true);
    setError(null);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc(
      "withdraw_my_profile_share_consent",
    );
    setPending(false);
    if (rpcError) {
      setError("Le retrait n’a pas pu être enregistré. Réessayez.");
      return;
    }
    setState({ kind: "inactive", justWithdrawn: true });
  }

  const consentedDate =
    state.kind === "active" ? DATE_FMT.format(new Date(state.consentedAt)) : null;

  return (
    <section className="glass rounded-3xl p-6 shadow-card sm:p-8">
      <div className="flex items-center gap-2">
        <Share2 size={18} className="text-choco-600" aria-hidden />
        <h2 className="font-serif text-xl font-semibold text-choco-700">
          Partage public limité du profil
        </h2>
      </div>

      <p className="mt-2 text-sm leading-relaxed text-ink-700/75">
        Avec votre autorisation, KASSALAFAM pourra créer un lien temporaire
        présentant uniquement certaines informations de votre profil. Vos
        coordonnées, votre nom complet, vos messages et vos données privées ne
        seront jamais affichés.
      </p>

      <blockquote className="mt-4 rounded-2xl border border-champagne-500/30 bg-cream-100/40 p-4 text-sm italic leading-relaxed text-ink-800">
        « {CONSENT_TEXT} »
      </blockquote>

      {error ? (
        <div className="mt-4">
          <FormError message={error} />
        </div>
      ) : null}

      <div className="mt-5 flex flex-col gap-3">
        {state.kind === "loading" ? (
          <p className="inline-flex items-center gap-2 text-sm text-ink-700/60">
            <Loader2 size={16} className="animate-spin" aria-hidden />
            Chargement de votre autorisation…
          </p>
        ) : state.kind === "active" ? (
          <>
            <p className="inline-flex flex-wrap items-center gap-2 text-sm">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-600/30 bg-emerald-600/10 px-3 py-1 font-medium text-emerald-700">
                <ShieldCheck size={14} aria-hidden />
                Autorisation active
              </span>
              <span className="text-ink-700/60">
                donnée le {consentedDate}
              </span>
            </p>
            <button
              type="button"
              onClick={withdraw}
              disabled={pending}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 self-start rounded-full border border-champagne-500/40 bg-cream-100/60 px-5 py-2.5 text-sm font-semibold text-choco-700 transition-colors hover:bg-champagne-400/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-champagne-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-cream-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? (
                <>
                  <Loader2 size={16} className="animate-spin" aria-hidden />
                  Retrait…
                </>
              ) : (
                "Retirer mon autorisation"
              )}
            </button>
          </>
        ) : (
          <>
            {state.justWithdrawn ? (
              <p
                role="status"
                className="rounded-2xl border border-champagne-500/30 bg-champagne-400/10 p-4 text-sm text-choco-700"
              >
                Votre autorisation a été retirée. Aucun nouveau lien public ne
                pourra être créé.
              </p>
            ) : null}
            <button
              type="button"
              onClick={grant}
              disabled={pending}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 self-start rounded-full bg-gradient-to-br from-choco-600 to-choco-800 px-6 py-2.5 text-sm font-semibold text-cream-50 shadow-[0_12px_30px_-12px_rgba(43,26,18,0.8)] ring-1 ring-inset ring-champagne-400/30 transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-champagne-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-cream-50 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
            >
              {pending ? (
                <>
                  <Loader2 size={16} className="animate-spin" aria-hidden />
                  Enregistrement…
                </>
              ) : (
                "Autoriser le partage limité"
              )}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
