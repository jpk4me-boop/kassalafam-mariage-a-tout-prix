"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Check,
  CircleAlert,
  Crown,
  Loader2,
  Phone,
  PhoneCall,
  X,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { normalizeWhatsappNumber } from "@/lib/contact/whatsapp-contact";
import type { ContactExchangeStatus, PremiumStatusRow } from "@/lib/types/database";

/**
 * Carte « Échange de coordonnées » — Client Component, montée dans la
 * conversation (migration 20260806075800, §5.-1 de la mémoire projet).
 *
 * Principe : le premium achète le DROIT DE DEMANDER, jamais le numéro. Seule la
 * personne sollicitée décide ; si elle accepte, les DEUX numéros se révèlent,
 * symétriquement. Le BACKEND est l'autorité : la carte ne fait que restituer
 * `get_contact_exchange` et rappeler les 4 RPC ; chaque échec re-synchronise
 * l'état depuis le serveur.
 *
 * Confidentialité :
 *   - aucun numéro n'est affiché en dehors de `other_whatsapp` / `my_whatsapp`
 *     renvoyés par la RPC (donc UNIQUEMENT si accepted + conversation autorisée) ;
 *   - un refus, un verrou de 30 jours ou un verrou définitif ne sont JAMAIS
 *     motivés côté demandeur : la carte reste muette (état neutre) ;
 *   - l'incitation Premium ne s'affiche que si le membre n'est PAS premium —
 *     jamais pour masquer un verrou.
 */

type Notice = { tone: "success" | "error"; message: string };

/** Traduit les exceptions nommées CONTACT_EXCHANGE_* en phrases neutres. */
function messageForError(raw: string | undefined): string {
  const m = raw ?? "";
  if (m.includes("CONTACT_EXCHANGE_PREMIUM_REQUIRED")) {
    return "L’échange de coordonnées est réservé aux membres Premium.";
  }
  if (m.includes("CONTACT_EXCHANGE_DAILY_LIMIT")) {
    return "Vous avez atteint la limite de 3 demandes par 24 heures. Réessayez plus tard.";
  }
  if (m.includes("CONTACT_EXCHANGE_ALREADY_OPEN")) {
    return "Une demande est déjà en cours pour cette conversation.";
  }
  if (m.includes("CONTACT_EXCHANGE_NOTHING_TO_ANSWER")) {
    return "Cette demande n’est plus d’actualité.";
  }
  if (m.includes("CONTACT_EXCHANGE_NOTHING_TO_REVOKE")) {
    return "Aucun échange de coordonnées à retirer.";
  }
  // CONTACT_EXCHANGE_LOCKED, CONTACT_EXCHANGE_CLOSED_BY_TARGET,
  // CONTACT_EXCHANGE_CONVERSATION_UNAVAILABLE et tout le reste : NEUTRE,
  // aucun motif n'est jamais révélé.
  return "L’échange de coordonnées n’est pas disponible pour cette conversation.";
}

export function ContactExchangeCard({
  matchId,
  otherName,
  messagingAvailable,
}: {
  matchId: string;
  otherName: string;
  /**
   * État relationnel tenu par la conversation (backend autorité) : quand la
   * messagerie est indisponible (blocage, suspension), la carte ne propose ni
   * demande, ni réponse, ni incitation Premium — SEUL l'état accepté reste
   * rendu, car le retrait d'accord doit rester possible même après un blocage.
   */
  messagingAvailable: boolean;
}) {
  const [status, setStatus] = useState<ContactExchangeStatus | null>(null);
  const [isPremium, setIsPremium] = useState<boolean | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<"request" | "revoke" | null>(null);
  // Après un refus DANS cette session : plus aucune proposition ni incitation
  // jusqu'au prochain chargement (éviter d'enchaîner « refusé » → « demandez ! »).
  const [justDeclined, setJustDeclined] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  // L'état vient TOUJOURS du serveur ; en cas d'échec, la carte reste muette.
  const refresh = useCallback(async (): Promise<ContactExchangeStatus | null> => {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("get_contact_exchange", {
      p_match: matchId,
    });
    if (error || !data || data.length === 0) {
      setStatus(null);
      return null;
    }
    const fresh = data[0] as ContactExchangeStatus;
    setStatus(fresh);
    return fresh;
  }, [matchId]);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    Promise.all([
      supabase.rpc("get_contact_exchange", { p_match: matchId }),
      supabase.rpc("get_my_premium_status"),
    ]).then(([exchange, premium]) => {
      if (cancelled) return;
      if (!exchange.error && exchange.data && exchange.data.length > 0) {
        setStatus(exchange.data[0] as ContactExchangeStatus);
      }
      if (!premium.error && premium.data && premium.data.length > 0) {
        setIsPremium((premium.data[0] as PremiumStatusRow).is_premium);
      }
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [matchId]);

  const doRequest = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("request_contact_exchange", {
      p_match: matchId,
    });
    await refresh();
    setBusy(false);
    setConfirming(null);
    if (error) {
      setNotice({ tone: "error", message: messageForError(error.message) });
      return;
    }
    setNotice({
      tone: "success",
      message: `Demande envoyée. C’est ${otherName} qui décide d’accepter ou non.`,
    });
  }, [busy, matchId, otherName, refresh]);

  const doRespond = useCallback(
    async (decision: "accept" | "decline") => {
      if (busy) return;
      setBusy(true);
      setNotice(null);
      const supabase = createClient();
      const { error } = await supabase.rpc("respond_to_contact_exchange", {
        p_match: matchId,
        p_decision: decision,
      });
      await refresh();
      setBusy(false);
      if (error) {
        setNotice({ tone: "error", message: messageForError(error.message) });
        return;
      }
      if (decision === "decline") setJustDeclined(true);
      setNotice(
        decision === "accept"
          ? {
              tone: "success",
              message: "Échange accepté : vos deux numéros sont désormais visibles.",
            }
          : { tone: "success", message: "Demande refusée." },
      );
    },
    [busy, matchId, refresh],
  );

  const doRevoke = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("revoke_contact_exchange", {
      p_match: matchId,
    });
    await refresh();
    setBusy(false);
    setConfirming(null);
    if (error) {
      setNotice({ tone: "error", message: messageForError(error.message) });
      return;
    }
    setNotice({
      tone: "success",
      message: "Accord retiré. Les numéros ne sont plus partagés.",
    });
  }, [busy, matchId, refresh]);

  // Notice seule (ex. demande refusée => plus de carte) : on l'affiche quand même.
  const noticeLine = notice ? (
    <p
      role="status"
      className={
        notice.tone === "success"
          ? "flex items-center gap-1.5 text-sm font-medium text-emerald-700"
          : "flex items-center gap-1.5 text-sm font-medium text-red-700"
      }
    >
      {notice.tone === "success" ? (
        <Check size={14} className="shrink-0" />
      ) : (
        <CircleAlert size={14} className="shrink-0" />
      )}
      {notice.message}
    </p>
  ) : null;

  if (!loaded || !status) {
    return notice ? <div className="px-1">{noticeLine}</div> : null;
  }

  // --- État ACCEPTÉ : les deux numéros, symétriquement -----------------------
  if (status.state === "accepted") {
    const digits = normalizeWhatsappNumber(status.other_whatsapp ?? undefined);
    return (
      <section
        aria-label="Échange de coordonnées"
        className="flex flex-col gap-3 rounded-3xl border border-emerald-600/25 bg-emerald-50/60 p-4"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-600/10 text-emerald-700">
            <PhoneCall size={18} />
          </span>
          <div className="min-w-0">
            <h2 className="font-serif text-base font-semibold text-choco-800">
              Numéros WhatsApp partagés
            </h2>
            {status.other_whatsapp ? (
              <p className="text-sm text-ink-700/75">
                {otherName} :{" "}
                <span className="font-semibold tabular-nums text-choco-800">
                  {status.other_whatsapp}
                </span>
                {status.my_whatsapp ? (
                  <>
                    {" "}
                    · votre numéro ({status.my_whatsapp}) lui est visible aussi.
                  </>
                ) : null}
              </p>
            ) : (
              <p className="text-sm text-ink-700/75">
                Les numéros ne sont plus visibles pour cette conversation.
              </p>
            )}
          </div>
        </div>

        {confirming === "revoke" ? (
          <div className="flex flex-col gap-2 rounded-2xl border border-champagne-500/40 bg-cream-50/80 p-3">
            <p className="text-sm text-ink-700/80">
              Retirer votre accord ? Les numéros ne seront plus visibles, ni
              pour vous ni pour {otherName}.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirming(null)}
                disabled={busy}
                className="inline-flex flex-1 items-center justify-center rounded-full border border-champagne-500/40 bg-cream-50/60 px-4 py-2 text-sm font-medium text-ink-700/75 transition-colors hover:bg-champagne-400/15 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={doRevoke}
                disabled={busy}
                aria-busy={busy}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-red-700 px-4 py-2 text-sm font-semibold text-cream-50 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                Retirer
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {digits ? (
              <a
                href={`https://wa.me/${digits}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 rounded-full bg-emerald-700 px-4 py-2 text-sm font-semibold text-cream-50 shadow-[0_12px_30px_-12px_rgba(4,120,87,0.8)] transition-transform hover:-translate-y-0.5"
              >
                <Phone size={14} />
                Ouvrir WhatsApp
              </a>
            ) : null}
            <button
              type="button"
              onClick={() => setConfirming("revoke")}
              disabled={busy}
              className="inline-flex items-center justify-center gap-1.5 rounded-full border border-champagne-500/40 bg-cream-50/60 px-4 py-2 text-sm font-medium text-ink-700/70 transition-colors hover:bg-champagne-400/15 hover:text-choco-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Retirer mon accord
            </button>
          </div>
        )}

        {noticeLine}
      </section>
    );
  }

  // Hors état accepté, une messagerie indisponible fait tout disparaître :
  // ni demande, ni réponse, ni incitation — état NEUTRE, comme le composer.
  if (!messagingAvailable) {
    return notice ? <div className="px-1">{noticeLine}</div> : null;
  }

  // --- Demande EN ATTENTE, reçue : la personne sollicitée décide -------------
  if (status.state === "pending" && !status.i_requested) {
    return (
      <section
        aria-label="Échange de coordonnées"
        className="flex flex-col gap-3 rounded-3xl border border-champagne-500/40 bg-champagne-300/30 p-4"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-champagne-400/25 text-choco-600">
            <PhoneCall size={18} />
          </span>
          <div className="min-w-0">
            <h2 className="font-serif text-base font-semibold text-choco-800">
              {otherName} propose d’échanger vos numéros WhatsApp
            </h2>
            <p className="text-sm text-ink-700/75">
              Si vous acceptez, vos deux numéros seront visibles — le sien comme
              le vôtre. C’est vous qui décidez, et vous pourrez retirer votre
              accord à tout moment.
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => doRespond("decline")}
            disabled={busy}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-champagne-500/40 bg-cream-50/60 px-4 py-2 text-sm font-medium text-ink-700/75 transition-colors hover:bg-champagne-400/15 hover:text-choco-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <X size={14} />
            Refuser
          </button>
          <button
            type="button"
            onClick={() => doRespond("accept")}
            disabled={busy}
            aria-busy={busy}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-gradient-to-br from-choco-600 to-choco-800 px-4 py-2 text-sm font-semibold text-cream-50 shadow-[0_12px_30px_-12px_rgba(43,26,18,0.8)] ring-1 ring-inset ring-champagne-400/30 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Accepter
          </button>
        </div>

        {noticeLine}
      </section>
    );
  }

  // --- Demande EN ATTENTE, envoyée par moi -----------------------------------
  if (status.state === "pending" && status.i_requested) {
    return (
      <section
        aria-label="Échange de coordonnées"
        className="flex flex-col gap-2 rounded-3xl border border-champagne-500/30 bg-cream-100/40 p-4"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-champagne-400/20 text-choco-600">
            <PhoneCall size={18} />
          </span>
          <div className="min-w-0">
            <h2 className="font-serif text-base font-semibold text-choco-800">
              Demande d’échange de numéros envoyée
            </h2>
            <p className="text-sm text-ink-700/75">
              C’est {otherName} qui décide d’accepter ou non. Sans réponse, la
              demande expirera d’elle-même au bout de 14 jours.
            </p>
          </div>
        </div>
        {noticeLine}
      </section>
    );
  }

  // --- Aucune demande vivante ------------------------------------------------

  // Membre premium avec le droit de demander : proposition (plafond 3 / 24 h).
  if (status.can_request && !justDeclined) {
    const left = status.requests_left_today;
    return (
      <section
        aria-label="Échange de coordonnées"
        className="flex flex-col gap-3 rounded-3xl border border-champagne-500/30 bg-cream-100/40 p-4"
      >
        {confirming === "request" ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-ink-700/80">
              Proposer à {otherName} d’échanger vos numéros WhatsApp ? C’est{" "}
              {otherName} qui décide ; si la demande est acceptée, vos deux
              numéros seront visibles — le sien comme le vôtre.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirming(null)}
                disabled={busy}
                className="inline-flex flex-1 items-center justify-center rounded-full border border-champagne-500/40 bg-cream-50/60 px-4 py-2 text-sm font-medium text-ink-700/75 transition-colors hover:bg-champagne-400/15 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={doRequest}
                disabled={busy}
                aria-busy={busy}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-gradient-to-br from-choco-600 to-choco-800 px-4 py-2 text-sm font-semibold text-cream-50 shadow-[0_12px_30px_-12px_rgba(43,26,18,0.8)] ring-1 ring-inset ring-champagne-400/30 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
              >
                {busy ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <PhoneCall size={14} />
                )}
                Envoyer la demande
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-champagne-400/20 text-choco-600">
              <PhoneCall size={18} />
            </span>
            <div className="min-w-0 flex-1 basis-56">
              <h2 className="font-serif text-base font-semibold text-choco-800">
                Échangez vos numéros WhatsApp
              </h2>
              <p className="text-sm text-ink-700/70">
                {left > 0
                  ? `C’est ${otherName} qui décide d’accepter ou non.`
                  : "Vous avez atteint la limite de 3 demandes par 24 heures."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setConfirming("request")}
              disabled={busy || left <= 0}
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border border-champagne-500/50 bg-cream-50/70 px-4 py-2 text-sm font-semibold text-choco-700 transition-colors hover:bg-champagne-400/15 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <PhoneCall size={14} />
              Demander
            </button>
          </div>
        )}
        {noticeLine}
      </section>
    );
  }

  // Membre NON premium : incitation discrète. Ne s'affiche JAMAIS pour couvrir
  // un verrou (un membre premium verrouillé ne voit RIEN — état neutre), ni
  // juste après un refus dans cette session.
  if (isPremium === false && !justDeclined) {
    return (
      <section
        aria-label="Échange de coordonnées"
        className="flex flex-col gap-2 rounded-3xl border border-champagne-500/30 bg-cream-100/40 p-4"
      >
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-champagne-400/20 text-choco-600">
            <Crown size={18} />
          </span>
          <div className="min-w-0 flex-1 basis-56">
            <h2 className="font-serif text-base font-semibold text-choco-800">
              Échangez vos numéros WhatsApp
            </h2>
            <p className="text-sm text-ink-700/70">
              Demander l’échange des numéros est réservé aux membres Premium.{" "}
              {otherName} restera libre d’accepter ou non.
            </p>
          </div>
          <Link
            href="/premium"
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border border-champagne-500/50 bg-cream-50/70 px-4 py-2 text-sm font-semibold text-choco-700 transition-colors hover:bg-champagne-400/15"
          >
            <Crown size={14} />
            Découvrir Premium
          </Link>
        </div>
        {noticeLine}
      </section>
    );
  }

  // Verrou (refus récent, retrait définitif, conversation indisponible…) :
  // état NEUTRE, la carte disparaît sans jamais motiver.
  return notice ? <div className="px-1">{noticeLine}</div> : null;
}
