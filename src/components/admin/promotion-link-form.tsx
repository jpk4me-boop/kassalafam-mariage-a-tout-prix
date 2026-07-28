"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Copy,
  ExternalLink,
  Link2,
  Loader2,
  Share2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  availablePromotionDurations,
  buildFacebookShareUrl,
  buildWhatsAppShareUrl,
  formatPromotionDate,
  PROMOTION_CHANNEL_LABELS,
  PROMOTION_SHARE_TEXT,
  type PromotionChannel,
  type PromotionDurationMinutes,
} from "@/lib/admin/profile-promotion";
import {
  createPromotionLinkAction,
  type CreatePromotionLinkState,
} from "@/app/admin/members/promotion-actions";

/**
 * Formulaire admin de création d'un lien promotionnel (PR #82).
 *
 * Le jeton complet n'existe que dans l'état React de ce composant, le temps de
 * l'affichage unique « copiez-le maintenant » : aucune persistance
 * (localStorage/sessionStorage/cookie), aucun paramètre d'URL, aucun log,
 * aucun réaffichage après rechargement. Toutes les contraintes (consentement,
 * canal, durée, éligibilité) restent tranchées côté serveur et en base.
 */

const FIELD =
  "w-full rounded-lg border border-champagne-500/30 bg-cream-50/80 px-3 py-2.5 text-sm text-ink-800 outline-none focus:border-champagne-500/50 focus:ring-2 focus:ring-champagne-500/20 disabled:opacity-60";

const BTN =
  "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-champagne-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-cream-50 disabled:cursor-not-allowed disabled:opacity-60";

const BTN_PRIMARY =
  "bg-gradient-to-br from-choco-600 to-choco-800 text-cream-50 ring-1 ring-inset ring-champagne-400/30 hover:-translate-y-0.5";

const BTN_SECONDARY =
  "border border-champagne-500/30 bg-cream-100/60 text-choco-700 hover:bg-champagne-400/15";

export function PromotionLinkForm({
  profileId,
  channels,
  consentExpiresAt,
}: {
  profileId: string;
  /** Réseaux réellement autorisés par le consentement actif. */
  channels: PromotionChannel[];
  consentExpiresAt: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [channel, setChannel] = useState<PromotionChannel | "">(
    channels[0] ?? "",
  );
  const durations = availablePromotionDurations(new Date(), consentExpiresAt);
  const firstEnabled = durations.find((d) => !d.disabled);
  const [duration, setDuration] = useState<PromotionDurationMinutes | null>(
    firstEnabled?.minutes ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Extract<
    CreatePromotionLinkState,
    { ok: true }
  > | null>(null);
  const [announce, setAnnounce] = useState("");
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback((message: string, markCopied = false) => {
    setCopied(markCopied);
    setAnnounce(message);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setCopied(false);
      setAnnounce("");
    }, 3000);
  }, []);

  // Copie robuste : Clipboard API puis repli `execCommand` (même motif que
  // ShareActions). L'URL ne quitte jamais la mémoire du composant.
  const copyToClipboard = useCallback(async (value: string) => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return true;
      }
      throw new Error("clipboard-api-unavailable");
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = value;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.top = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        return ok;
      } catch {
        return false;
      }
    }
  }, []);

  const copyLink = useCallback(async () => {
    if (!created) return;
    const ok = await copyToClipboard(created.url);
    flash(ok ? "Lien copié" : "Échec de la copie du lien", ok);
  }, [created, copyToClipboard, flash]);

  const nativeShare = useCallback(async () => {
    if (!created) return;
    if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
      await copyLink();
      return;
    }
    try {
      await navigator.share({
        title: "Profil présenté — KASSALAFAM",
        text: PROMOTION_SHARE_TEXT,
        url: created.url,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      await copyLink();
    }
  }, [created, copyLink]);

  function submit() {
    setError(null);
    if (!channel) {
      setError("Sélectionnez un réseau autorisé.");
      return;
    }
    if (duration == null) {
      setError("Sélectionnez une durée compatible avec le consentement.");
      return;
    }
    startTransition(async () => {
      const res = await createPromotionLinkAction({
        profileId,
        channel,
        durationMinutes: duration,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setCreated(res);
      flash("Lien promotionnel créé.");
      router.refresh();
    });
  }

  if (created) {
    const channelLabel = PROMOTION_CHANNEL_LABELS[created.channel];
    return (
      <div
        role="region"
        aria-label="Lien promotionnel créé"
        className="flex flex-col gap-3 rounded-xl border border-emerald-600/30 bg-emerald-500/5 p-4"
      >
        <div>
          <p className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-800">
            <Link2 size={16} aria-hidden />
            Lien créé — copiez-le maintenant
          </p>
          <p className="mt-1 text-xs text-ink-700/70">
            {channelLabel} · expire le {formatPromotionDate(created.expiresAt)}.
            Ce lien ne sera plus jamais affiché en clair : copiez-le ou
            partagez-le immédiatement.
          </p>
        </div>

        <p className="break-all rounded-lg border border-champagne-500/25 bg-cream-50/80 px-3 py-2 font-mono text-xs text-ink-800">
          {created.url}
        </p>

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={copyLink} className={cn(BTN, BTN_PRIMARY)}>
            {copied ? <Check size={15} /> : <Copy size={15} />}
            {copied ? "Lien copié" : "Copier le lien"}
          </button>

          <button
            type="button"
            onClick={nativeShare}
            className={cn(BTN, BTN_SECONDARY)}
          >
            <Share2 size={15} />
            Partager
          </button>

          {created.channel === "whatsapp" ? (
            <a
              href={buildWhatsAppShareUrl(created.url, PROMOTION_SHARE_TEXT)}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(BTN, BTN_SECONDARY)}
            >
              Ouvrir WhatsApp
            </a>
          ) : null}

          {created.channel === "facebook" ? (
            <a
              href={buildFacebookShareUrl(created.url)}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(BTN, BTN_SECONDARY)}
            >
              Partager sur Facebook
            </a>
          ) : null}

          {created.channel === "instagram" || created.channel === "snapchat" ? (
            // Aucune API web de publication : partage natif ou copie manuelle.
            <button
              type="button"
              onClick={nativeShare}
              className={cn(BTN, BTN_SECONDARY)}
            >
              Partager vers {channelLabel}
            </button>
          ) : null}

          <a
            href={created.url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(BTN, BTN_SECONDARY)}
          >
            <ExternalLink size={15} />
            Ouvrir le profil
          </a>
        </div>

        <button
          type="button"
          onClick={() => setCreated(null)}
          className="w-fit text-xs font-medium text-ink-700/60 underline underline-offset-2 hover:text-choco-700"
        >
          Fermer ce panneau (le lien restera actif)
        </button>

        <span role="status" aria-live="polite" className="sr-only">
          {announce}
        </span>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-3"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label
            htmlFor={`promotion-channel-${profileId}`}
            className="text-[11px] font-medium uppercase tracking-wide text-ink-700/55"
          >
            Réseau autorisé
          </label>
          <select
            id={`promotion-channel-${profileId}`}
            value={channel}
            onChange={(e) => {
              setError(null);
              setChannel(e.target.value as PromotionChannel);
            }}
            disabled={pending || channels.length === 0}
            className={FIELD}
          >
            {channels.map((c) => (
              <option key={c} value={c}>
                {PROMOTION_CHANNEL_LABELS[c]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor={`promotion-duration-${profileId}`}
            className="text-[11px] font-medium uppercase tracking-wide text-ink-700/55"
          >
            Durée du lien
          </label>
          <select
            id={`promotion-duration-${profileId}`}
            value={duration ?? ""}
            onChange={(e) => {
              setError(null);
              setDuration(Number(e.target.value) as PromotionDurationMinutes);
            }}
            disabled={pending}
            className={FIELD}
          >
            {durations.map((d) => (
              <option key={d.minutes} value={d.minutes} disabled={d.disabled}>
                {d.label}
                {d.disabled ? " (dépasse le consentement)" : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="text-[11px] text-ink-700/55">
        Le lien expirera au plus tard à la fin du consentement promotionnel du
        membre. Aucune publication automatique n’est effectuée.
      </p>

      <button
        type="submit"
        disabled={pending || channels.length === 0 || duration == null}
        className={cn(BTN, BTN_PRIMARY, "w-fit")}
      >
        {pending ? (
          <Loader2 size={15} className="animate-spin" aria-hidden />
        ) : (
          <Link2 size={15} aria-hidden />
        )}
        Créer un lien promotionnel
      </button>

      {error ? (
        <p className="text-xs font-medium text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      <span role="status" aria-live="polite" className="sr-only">
        {announce}
      </span>
    </form>
  );
}
