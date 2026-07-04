"use client";

import { useState, useTransition } from "react";
import { Ban, Check, Loader2, RotateCcw, ShieldQuestion, X } from "lucide-react";

import type { AccountStatus } from "@/lib/types/database";
import {
  SUSPENSION_REASON_MIN,
  SUSPENSION_REASON_MAX,
} from "@/lib/admin/account-moderation";
import { setAccountStatusAction } from "@/app/admin/members/actions";

/**
 * Actions de modération d'un compte — CÔTÉ CLIENT (L3F-C3B).
 *
 * Ce composant n'importe QUE la Server Action (référence RPC) et des helpers
 * purs : aucune clé service_role, aucun secret, aucun appel Supabase navigateur
 * ne touche le bundle. Il ne reçoit que `profileId`, `currentStatus`, le libellé
 * d'affichage du membre et `isSelf` — jamais de donnée technique sensible.
 *
 * Interaction en DEUX étapes : un premier clic ouvre un panneau de confirmation
 * clair (membre concerné + motif OBLIGATOIRE + Confirmer/Annuler). Aucune action
 * n'est exécutée au premier clic. Le bouton d'envoi est verrouillé pendant la
 * requête (anti-double-clic). La validation autoritative (admin, transition,
 * motif, concurrence, auto-suspension) est refaite côté serveur puis en base.
 *
 * Le motif est requis dans LES DEUX sens : la RPC `admin_set_account_status`
 * exige un motif 10..2000 pour suspendre ET pour réactiver.
 */

const CONFIG: Record<
  AccountStatus, // statut COURANT
  {
    target: AccountStatus;
    button: string;
    Icon: typeof Ban;
    panel: string;
    confirm: string;
    input: string;
    question: string;
    reasonLabel: string;
    placeholder: string;
  }
> = {
  active: {
    target: "suspended",
    button:
      "border-amber-500/40 bg-amber-400/15 text-amber-800 hover:bg-amber-400/25",
    Icon: Ban,
    panel: "border-amber-500/25 bg-amber-400/5",
    confirm:
      "border-amber-500/40 bg-amber-400/15 text-amber-800 hover:bg-amber-400/25",
    input: "focus:border-amber-500/50 focus:ring-amber-400/20",
    question: "Suspendre le compte de",
    reasonLabel: "Motif de la suspension",
    placeholder:
      "Expliquez la raison de la suspension (conservée dans l’historique de modération).",
  },
  suspended: {
    target: "active",
    button:
      "border-emerald-600/35 bg-emerald-500/10 text-emerald-700/90 hover:bg-emerald-500/15",
    Icon: RotateCcw,
    panel: "border-emerald-600/25 bg-emerald-500/5",
    confirm:
      "border-emerald-600/35 bg-emerald-500/10 text-emerald-700/90 hover:bg-emerald-500/15",
    input: "focus:border-emerald-500/50 focus:ring-emerald-500/20",
    question: "Réactiver le compte de",
    reasonLabel: "Motif de la réactivation",
    placeholder:
      "Expliquez la raison de la réactivation (conservée dans l’historique de modération).",
  },
};

export function MemberModerationActions({
  profileId,
  currentStatus,
  memberLabel,
  isSelf,
}: {
  profileId: string;
  currentStatus: AccountStatus;
  memberLabel: string;
  isSelf: boolean;
}) {
  const config = CONFIG[currentStatus];
  const isSuspending = config.target === "suspended";

  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Auto-suspension : l'admin ne peut pas suspendre son propre compte. Le
  // bouton est neutralisé (le serveur refuse aussi, défense en profondeur).
  const blockedSelfSuspend = isSelf && isSuspending;

  function openPanel() {
    if (pending || blockedSelfSuspend) return;
    setOpen(true);
    setReason("");
    setError(null);
    setSuccess(null);
  }

  function cancel() {
    if (pending) return;
    setOpen(false);
    setReason("");
    setError(null);
  }

  function confirm() {
    if (!open || pending) return;
    setError(null);

    const trimmed = reason.trim();
    if (
      trimmed.length < SUSPENSION_REASON_MIN ||
      trimmed.length > SUSPENSION_REASON_MAX
    ) {
      setError(
        `Le motif doit contenir entre ${SUSPENSION_REASON_MIN} et ${SUSPENSION_REASON_MAX} caractères.`,
      );
      return;
    }

    startTransition(async () => {
      const res = await setAccountStatusAction({
        profileId,
        expectedStatus: currentStatus,
        newStatus: config.target,
        reason: trimmed,
      });
      if (res.ok) {
        // revalidatePath côté serveur re-rend la ligne avec le nouveau statut.
        // On ferme le panneau ; le message de succès est transitoire.
        setOpen(false);
        setReason("");
        setSuccess(res.message);
      } else {
        setError(res.error);
      }
    });
  }

  const Icon = config.Icon;
  const count = reason.trim().length;

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={openPanel}
        disabled={pending || blockedSelfSuspend}
        aria-expanded={open}
        aria-controls={open ? `panel-${profileId}` : undefined}
        title={
          blockedSelfSuspend
            ? "Vous ne pouvez pas suspendre votre propre compte."
            : undefined
        }
        className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${config.button}`}
      >
        <Icon size={13} />
        {isSuspending ? "Suspendre" : "Réactiver"}
      </button>

      {blockedSelfSuspend ? (
        <p className="text-[11px] text-ink-700/50">
          Votre propre compte ne peut pas être suspendu.
        </p>
      ) : null}

      {open ? (
        <div
          id={`panel-${profileId}`}
          role="group"
          aria-label={
            isSuspending
              ? "Confirmation de suspension du compte"
              : "Confirmation de réactivation du compte"
          }
          className={`flex flex-col gap-3 rounded-xl border p-3 ${config.panel}`}
        >
          <div className="flex items-start gap-2">
            <ShieldQuestion
              size={15}
              className="mt-0.5 shrink-0 text-choco-600"
            />
            <p className="text-xs text-choco-700">
              {config.question}{" "}
              <span className="font-semibold">{memberLabel}</span> ?
            </p>
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor={`reason-${profileId}`}
              className="text-[11px] text-ink-700/60"
            >
              {config.reasonLabel} (obligatoire, entre {SUSPENSION_REASON_MIN} et{" "}
              {SUSPENSION_REASON_MAX} caractères)
            </label>
            <textarea
              id={`reason-${profileId}`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={pending}
              required
              minLength={SUSPENSION_REASON_MIN}
              maxLength={SUSPENSION_REASON_MAX}
              rows={3}
              placeholder={config.placeholder}
              className={`w-full resize-y whitespace-pre-wrap break-words rounded-lg border border-champagne-500/30 bg-cream-50/80 px-3 py-2 text-sm text-ink-800 outline-none focus:ring-2 disabled:opacity-60 ${config.input}`}
            />
            <span className="self-end text-[11px] text-ink-700/50">
              {count}/{SUSPENSION_REASON_MAX}
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={cancel}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-full border border-champagne-500/30 bg-cream-100/60 px-3 py-1.5 text-xs font-medium text-ink-700/70 transition-colors hover:text-choco-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <X size={13} />
              Annuler
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={pending}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${config.confirm}`}
            >
              {pending ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Check size={13} />
              )}
              {pending
                ? "Traitement…"
                : isSuspending
                  ? "Confirmer la suspension"
                  : "Confirmer la réactivation"}
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="text-xs font-medium text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      {success && !open ? (
        <p className="text-xs font-medium text-emerald-700" role="status">
          {success}
        </p>
      ) : null}
    </div>
  );
}
