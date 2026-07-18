"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, BadgeCheck, Check, Loader2 } from "lucide-react";

import type { AccountStatus } from "@/lib/types/database";
import { setAccountStatusAction } from "@/app/admin/members/actions";
import {
  SUSPENSION_REASONS,
  REACTIVATION_REASONS,
  SUSPENSION_REASON_MIN,
  SUSPENSION_REASON_MAX,
} from "@/lib/admin/account-moderation";

/**
 * Actions de MODÉRATION DE COMPTE côté client (L3G). N'importe QUE la Server
 * Action (référence RPC) : aucune clé service_role côté navigateur. La validation
 * autoritative (admin + motif + concurrence) est refaite côté serveur et en base.
 *
 * - Suspendre  : motifs prédéfinis (≥ 1) + précision → motif composé, puis
 *   confirmation explicite. Action visuellement distincte (rouge).
 * - Réactiver  : motifs de réactivation (≥ 1) + confirmation native.
 * Le statut attendu (currentStatus) est transmis pour la concurrence optimiste.
 */

function composeReason(
  ordered: readonly string[],
  selected: string[],
  precision: string,
): string {
  const reasons = ordered.filter((r) => selected.includes(r));
  const p = precision.trim();
  return [...reasons, ...(p ? [`Précision: ${p}`] : [])].join("; ");
}

const SELF_MODERATION_MESSAGE =
  "Vous ne pouvez pas modifier le statut de votre propre compte.";

export function MemberAccountActions({
  profileId,
  currentStatus,
  isSelf,
}: {
  profileId: string;
  currentStatus: AccountStatus;
  /** `true` si l'admin consulte SA PROPRE fiche : action neutralisée. */
  isSelf: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [precision, setPrecision] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isSuspend = currentStatus === "active";
  const newStatus: AccountStatus = isSuspend ? "suspended" : "active";
  const reasons = isSuspend ? SUSPENSION_REASONS : REACTIVATION_REASONS;
  const finalReason = composeReason(reasons, selected, precision);

  function toggle(label: string) {
    setError(null);
    setSelected((list) =>
      list.includes(label) ? list.filter((r) => r !== label) : [...list, label],
    );
  }

  function reset() {
    setSelected([]);
    setPrecision("");
    setError(null);
  }

  function submit() {
    setError(null);
    // Défense UI : la Server Action et la RPC refusent aussi l'auto-modération.
    if (isSelf) {
      setError(SELF_MODERATION_MESSAGE);
      return;
    }
    if (selected.length === 0) {
      setError("Sélectionnez au moins un motif.");
      return;
    }
    if (finalReason.length < SUSPENSION_REASON_MIN) {
      setError(`Le motif doit contenir au moins ${SUSPENSION_REASON_MIN} caractères.`);
      return;
    }
    if (finalReason.length > SUSPENSION_REASON_MAX) {
      setError(
        `Le motif dépasse ${SUSPENSION_REASON_MAX} caractères. Retirez une raison ou raccourcissez la précision.`,
      );
      return;
    }
    const confirmMsg = isSuspend
      ? "Suspendre ce compte ? Le membre sera marqué « suspendu »."
      : "Réactiver ce compte ? Le membre redeviendra « actif ».";
    if (!window.confirm(confirmMsg)) return;

    startTransition(async () => {
      const res = await setAccountStatusAction({
        profileId,
        expectedStatus: currentStatus,
        newStatus,
        reason: finalReason,
      });
      if (!res.ok) {
        setError(res.error);
      } else {
        setOpen(false);
        reset();
        router.refresh();
      }
    });
  }

  const accent = isSuspend
    ? {
        trigger:
          "border-red-400/35 bg-red-400/10 text-red-700/90 hover:bg-red-400/15",
        panel: "border-red-400/25 bg-red-400/5",
        checkbox: "border-red-400/40 accent-red-400 focus:ring-red-400/20",
        confirm:
          "border-red-500/40 bg-red-500/15 text-red-800 hover:bg-red-500/25",
      }
    : {
        trigger:
          "border-emerald-600/35 bg-emerald-500/10 text-emerald-700/90 hover:bg-emerald-500/15",
        panel: "border-emerald-600/25 bg-emerald-500/5",
        checkbox:
          "border-emerald-600/40 accent-emerald-600 focus:ring-emerald-500/20",
        confirm:
          "border-emerald-600/40 bg-emerald-500/15 text-emerald-800 hover:bg-emerald-500/25",
      };

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => {
          if (isSelf) return;
          setError(null);
          setOpen((o) => !o);
        }}
        disabled={pending || isSelf}
        aria-expanded={open}
        aria-describedby={isSelf ? `self-moderation-note-${profileId}` : undefined}
        title={isSelf ? SELF_MODERATION_MESSAGE : undefined}
        className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${accent.trigger}`}
      >
        {isSuspend ? <Ban size={15} /> : <BadgeCheck size={15} />}
        {isSuspend ? "Suspendre le compte" : "Réactiver le compte"}
      </button>

      {isSelf ? (
        <p
          id={`self-moderation-note-${profileId}`}
          className="text-xs text-ink-700/60"
        >
          {SELF_MODERATION_MESSAGE}
        </p>
      ) : null}

      {open && !isSelf ? (
        <div className={`flex flex-col gap-3 rounded-xl border p-4 ${accent.panel}`}>
          <div>
            <p className="text-xs font-semibold text-choco-700">
              {isSuspend ? "Motif de la suspension" : "Motif de la réactivation"}
            </p>
            <p className="text-[11px] text-ink-700/55">
              Cochez une ou plusieurs raisons. Motif obligatoire ({SUSPENSION_REASON_MIN}–
              {SUSPENSION_REASON_MAX} caractères).
            </p>
          </div>

          <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
            {reasons.map((label) => (
              <label
                key={label}
                className="flex cursor-pointer items-start gap-2 text-xs text-choco-700/90"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(label)}
                  onChange={() => toggle(label)}
                  disabled={pending}
                  className={`mt-0.5 h-3.5 w-3.5 shrink-0 rounded focus:ring-2 ${accent.checkbox}`}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor={`account-precision-${profileId}`}
              className="text-[11px] text-ink-700/55"
            >
              Précision optionnelle
            </label>
            <input
              id={`account-precision-${profileId}`}
              type="text"
              value={precision}
              onChange={(e) => setPrecision(e.target.value)}
              disabled={pending}
              maxLength={SUSPENSION_REASON_MAX}
              placeholder="Ajouter un détail (facultatif)"
              className="w-full rounded-lg border border-champagne-500/30 bg-cream-50/80 px-3 py-1.5 text-xs text-ink-800 outline-none focus:border-champagne-500/50 focus:ring-2 focus:ring-champagne-500/20 disabled:opacity-60"
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-ink-700/50">
              {finalReason.length}/{SUSPENSION_REASON_MAX}
            </span>
            <button
              type="button"
              onClick={submit}
              disabled={pending || selected.length === 0}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${accent.confirm}`}
            >
              {pending ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Check size={13} />
              )}
              {isSuspend ? "Confirmer la suspension" : "Confirmer la réactivation"}
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="text-xs font-medium text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
