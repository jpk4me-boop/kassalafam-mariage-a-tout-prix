"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Pause, X } from "lucide-react";

import type { ProfileVerificationStatus } from "@/lib/types/database";
import {
  approveProfileAction,
  rejectProfileAction,
} from "@/app/admin/verification/actions";
import {
  REJECTION_REASON_MIN,
  REJECTION_REASON_MAX,
  REJECTION_REASONS,
} from "@/lib/admin/verification";

/**
 * Actions de modération côté client (L3-B2A).
 *
 * Ce composant n'importe QUE les Server Actions (références RPC) : aucune clé
 * service_role ne touche le bundle navigateur. La validation autoritative
 * (admin + motif) est refaite côté serveur dans actions.ts.
 *
 * - Approuver : confirmation native puis appel serveur.
 * - Rejeter   : motifs prédéfinis à cocher (≥ 1 obligatoire) + précision
 *               optionnelle ; le motif final est composé puis envoyé.
 * - Pause     : désactivé tant que l'enum n'a pas le statut `paused` (L3-B2B).
 */
export function ProfileActions({
  profileId,
  status,
}: {
  profileId: string;
  status: ProfileVerificationStatus;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [precision, setPrecision] = useState("");

  // Motif final composé : motifs cochés (dans l'ordre de la liste) + précision.
  const orderedReasons = REJECTION_REASONS.filter((r) => selected.includes(r));
  const precisionTrimmed = precision.trim();
  const finalReason = [
    ...orderedReasons,
    ...(precisionTrimmed ? [`Précision: ${precisionTrimmed}`] : []),
  ].join("; ");

  function toggleReason(label: string) {
    setError(null);
    setSelected((prev) =>
      prev.includes(label)
        ? prev.filter((r) => r !== label)
        : [...prev, label],
    );
  }

  function handleApprove() {
    setError(null);
    if (
      !window.confirm(
        "Approuver ce profil ? Son statut passera à « Approuvé ».",
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await approveProfileAction(profileId);
      if (!res.ok) setError(res.error);
    });
  }

  function handleReject() {
    setError(null);
    if (selected.length === 0) {
      setError("Sélectionnez au moins un motif de rejet.");
      return;
    }
    if (finalReason.length > REJECTION_REASON_MAX) {
      setError(
        `Le motif final dépasse ${REJECTION_REASON_MAX} caractères. Retirez une raison ou raccourcissez la précision.`,
      );
      return;
    }
    if (finalReason.trim().length < REJECTION_REASON_MIN) {
      setError("Motif de rejet invalide.");
      return;
    }
    startTransition(async () => {
      const res = await rejectProfileAction(profileId, finalReason);
      if (!res.ok) {
        setError(res.error);
      } else {
        setRejectOpen(false);
        setSelected([]);
        setPrecision("");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleApprove}
          disabled={pending}
          aria-label="Approuver ce profil"
          className="inline-flex items-center gap-1.5 rounded-full border border-emerald-600/35 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-700/90 transition-colors hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
          Approuver
        </button>

        <button
          type="button"
          onClick={() => {
            setError(null);
            setRejectOpen((v) => !v);
          }}
          disabled={pending}
          aria-expanded={rejectOpen}
          aria-label="Rejeter ce profil"
          className="inline-flex items-center gap-1.5 rounded-full border border-red-400/35 bg-red-400/10 px-3 py-1.5 text-xs font-semibold text-red-700/90 transition-colors hover:bg-red-400/15 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <X size={13} />
          Rejeter
        </button>

        <button
          type="button"
          disabled
          title="Disponible après migration L3-B2B"
          aria-label="Mettre en pause (disponible après migration L3-B2B)"
          className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-full border border-champagne-500/45 bg-champagne-400/20 px-3 py-1.5 text-xs font-semibold text-choco-700/80 opacity-75"
        >
          <Pause size={13} />
          Pause
        </button>
      </div>

      {rejectOpen ? (
        <div className="flex flex-col gap-3 rounded-xl border border-red-400/25 bg-red-400/5 p-3">
          <div>
            <p className="text-xs font-semibold text-choco-700">
              Motif du rejet
            </p>
            <p className="text-[11px] text-ink-700/55">
              Cochez une ou plusieurs raisons.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
            {REJECTION_REASONS.map((label) => (
              <label
                key={label}
                className="flex cursor-pointer items-start gap-2 text-xs text-choco-700/90"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(label)}
                  onChange={() => toggleReason(label)}
                  disabled={pending}
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-red-400/40 accent-red-400 focus:ring-2 focus:ring-red-400/20"
                />
                <span>{label}</span>
              </label>
            ))}
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor={`reject-precision-${profileId}`}
              className="text-[11px] text-ink-700/55"
            >
              Précision optionnelle
            </label>
            <input
              id={`reject-precision-${profileId}`}
              type="text"
              value={precision}
              onChange={(e) => setPrecision(e.target.value)}
              disabled={pending}
              maxLength={REJECTION_REASON_MAX}
              placeholder="Ajouter un détail (facultatif)"
              className="w-full rounded-lg border border-champagne-500/30 bg-cream-50/80 px-3 py-1.5 text-xs text-ink-800 outline-none focus:border-red-400/50 focus:ring-2 focus:ring-red-400/20 disabled:opacity-60"
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-ink-700/50">
              {finalReason.length}/{REJECTION_REASON_MAX}
            </span>
            <button
              type="button"
              onClick={handleReject}
              disabled={pending || selected.length === 0}
              className="inline-flex items-center gap-1.5 rounded-full border border-red-400/35 bg-red-400/10 px-3 py-1.5 text-xs font-semibold text-red-700/90 transition-colors hover:bg-red-400/15 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
              Confirmer le rejet
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
