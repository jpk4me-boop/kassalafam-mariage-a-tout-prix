"use client";

import { useEffect, useState } from "react";
import { BellRing, Check, MessageCircle, TriangleAlert } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import type { WhatsappNotificationsStatusRow } from "@/lib/types/database";

/**
 * Notifications WhatsApp (PR A — fondation, fiche validée le 03/08).
 *
 * Consentement EXPLICITE et dédié : avoir renseigné son numéro (migration 52)
 * ne vaut pas accord. Ce composant ne fait QUE lire le statut et appeler les
 * RPC grant/withdraw — la base reste l'autorité (le statut est relu après
 * chaque action, aucun état deviné). Aucun envoi n'a lieu tant que la phase
 * d'expédition (PR B + pilote) n'est pas ouverte : le consentement enregistré
 * prend effet à ce moment-là.
 */

type LoadedState = {
  hasPhone: boolean;
  consentActive: boolean;
};

async function fetchWhatsappState(): Promise<LoadedState | null> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc(
    "get_my_whatsapp_notifications_status",
  );
  if (error) return null;
  const row = (data as WhatsappNotificationsStatusRow[] | null)?.[0];
  if (!row) return null;
  return { hasPhone: row.has_phone, consentActive: row.consent_active };
}

export function WhatsappNotificationsCard() {
  const [state, setState] = useState<LoadedState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    fetchWhatsappState().then((loadedState) => {
      if (mounted) {
        setState(loadedState);
        setLoaded(true);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  async function run(action: "grant" | "withdraw") {
    setPending(true);
    setError(null);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc(
      action === "grant"
        ? "grant_my_whatsapp_notifications"
        : "withdraw_my_whatsapp_notifications",
    );
    if (rpcError) {
      setError(
        action === "grant"
          ? "Activation impossible pour le moment. Vérifiez que votre numéro WhatsApp est bien enregistré, puis réessayez."
          : "Désactivation impossible pour le moment. Réessayez.",
      );
    }
    // La base reste l'autorité : relire le statut après chaque action.
    const fresh = await fetchWhatsappState();
    setState(fresh);
    setPending(false);
  }

  if (!loaded || state === null) return null;

  return (
    <section className="rounded-3xl border border-champagne-500/30 bg-cream-50/60 p-6 shadow-card sm:p-8">
      <div className="flex items-center gap-2">
        <BellRing size={18} className="text-choco-600" aria-hidden />
        <h2 className="font-serif text-xl font-semibold text-choco-700">
          Notifications WhatsApp
        </h2>
      </div>

      <p className="mt-3 text-sm text-ink-700/75">
        Recevez un message WhatsApp quand il se passe quelque chose pour vous
        sur KASSALAFAM : nouveau message, nouvel intérêt, intérêt accepté,
        vérification de votre profil ou sécurité de votre compte. Jamais le
        contenu de vos conversations, jamais de publicité. Vous pouvez retirer
        votre accord à tout moment.
      </p>

      {error ? (
        <p className="mt-3 flex items-start gap-2 text-sm text-red-800">
          <TriangleAlert size={15} className="mt-0.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}

      <div className="mt-4">
        {!state.hasPhone ? (
          <p className="flex items-start gap-2 text-sm text-ink-700/60">
            <MessageCircle size={15} className="mt-0.5 shrink-0" aria-hidden />
            Renseignez d’abord votre numéro WhatsApp ci-dessus (champ
            « Téléphone ») pour pouvoir activer ces notifications.
          </p>
        ) : state.consentActive ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-600/25 bg-emerald-600/10 px-3 py-1.5 text-sm font-medium text-emerald-700">
              <Check size={15} aria-hidden />
              Notifications activées
            </span>
            <button
              type="button"
              onClick={() => void run("withdraw")}
              disabled={pending}
              className="rounded-full border border-champagne-500/40 px-4 py-2 text-sm font-semibold text-choco-700 transition-colors hover:bg-cream-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Retirer mon accord
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void run("grant")}
            disabled={pending}
            className="rounded-full bg-choco-600 px-5 py-2.5 text-sm font-semibold text-cream-50 transition-colors hover:bg-choco-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            J’autorise les notifications WhatsApp
          </button>
        )}
      </div>

      <p className="mt-3 text-xs text-ink-700/55">
        Les messages sont acheminés par WhatsApp (Meta) vers votre numéro.
        Seuls votre numéro et votre prénom leur sont transmis — jamais vos
        conversations ni votre profil.
      </p>
    </section>
  );
}
