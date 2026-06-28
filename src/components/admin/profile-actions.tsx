"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Pause, X } from "lucide-react";

import type { ProfileVerificationStatus } from "@/lib/types/database";
import {
  approveProfileAction,
  rejectProfileAction,
  pauseProfileAction,
} from "@/app/admin/verification/actions";
import {
  REJECTION_REASON_MIN,
  REJECTION_REASON_MAX,
  REJECTION_REASONS,
  PAUSE_REASONS,
  PAUSE_ACTION_ENABLED,
} from "@/lib/admin/verification";

/**
 * Actions de modération côté client (L3-B2A + L3-B2B).
 *
 * Ce composant n'importe QUE les Server Actions (références RPC) : aucune clé
 * service_role ne touche le bundle navigateur. La validation autoritative
 * (admin + motif) est refaite côté serveur dans actions.ts.
 *
 * - Approuver : confirmation native puis appel serveur.
 * - Rejeter   : motifs prédéfinis à cocher (≥ 1) + précision → motif composé.
 * - Pause     : idem, motifs de pause. Activé uniquement quand
 *               PAUSE_ACTION_ENABLED = true (après migration `paused`).
 * Les panneaux Rejeter et Pause sont mutuellement exclusifs.
 */

type Accent = {
  panel: string;
  checkbox: string;
  input: string;
  confirm: string;
};

const REJECT_ACCENT: Accent = {
  panel: "border-red-400/25 bg-red-400/5",
  checkbox: "border-red-400/40 accent-red-400 focus:ring-red-400/20",
  input: "focus:border-red-400/50 focus:ring-red-400/20",
  confirm:
    "border-red-400/35 bg-red-400/10 text-red-700/90 hover:bg-red-400/15",
};

const PAUSE_ACCENT: Accent = {
  panel: "border-amber-500/25 bg-amber-400/5",
  checkbox: "border-amber-500/40 accent-amber-500 focus:ring-amber-400/20",
  input: "focus:border-amber-500/50 focus:ring-amber-400/20",
  confirm:
    "border-amber-500/40 bg-amber-400/15 text-amber-800 hover:bg-amber-400/25",
};

/** Compose le motif final : raisons cochées (dans l'ordre de la liste) +
 *  précision optionnelle, jointes par « ; ». */
function composeReason(
  ordered: readonly string[],
  selected: string[],
  precision: string,
): string {
  const reasons = ordered.filter((r) => selected.includes(r));
  const p = precision.trim();
  return [...reasons, ...(p ? [`Précision: ${p}`] : [])].join("; ");
}

function ReasonPanel({
  idPrefix,
  title,
  reasons,
  selected,
  onToggle,
  precision,
  onPrecision,
  finalReason,
  onConfirm,
  confirmLabel,
  pending,
  accent,
}: {
  idPrefix: string;
  title: string;
  reasons: readonly string[];
  selected: string[];
  onToggle: (label: string) => void;
  precision: string;
  onPrecision: (value: string) => void;
  finalReason: string;
  onConfirm: () => void;
  confirmLabel: string;
  pending: boolean;
  accent: Accent;
}) {
  return (
    <div className={`flex flex-col gap-3 rounded-xl border p-3 ${accent.panel}`}>
      <div>
        <p className="text-xs font-semibold text-choco-700">{title}</p>
        <p className="text-[11px] text-ink-700/55">
          Cochez une ou plusieurs raisons.
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
              onChange={() => onToggle(label)}
              disabled={pending}
              className={`mt-0.5 h-3.5 w-3.5 shrink-0 rounded focus:ring-2 ${accent.checkbox}`}
            />
            <span>{label}</span>
          </label>
        ))}
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor={`${idPrefix}-precision`}
          className="text-[11px] text-ink-700/55"
        >
          Précision optionnelle
        </label>
        <input
          id={`${idPrefix}-precision`}
          type="text"
          value={precision}
          onChange={(e) => onPrecision(e.target.value)}
          disabled={pending}
          maxLength={REJECTION_REASON_MAX}
          placeholder="Ajouter un détail (facultatif)"
          className={`w-full rounded-lg border border-champagne-500/30 bg-cream-50/80 px-3 py-1.5 text-xs text-ink-800 outline-none focus:ring-2 disabled:opacity-60 ${accent.input}`}
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-ink-700/50">
          {finalReason.length}/{REJECTION_REASON_MAX}
        </span>
        <button
          type="button"
          onClick={onConfirm}
          disabled={pending || selected.length === 0}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${accent.confirm}`}
        >
          {pending ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Check size={13} />
          )}
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}

export function ProfileActions({
  profileId,
  status,
}: {
  profileId: string;
  status: ProfileVerificationStatus;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<null | "reject" | "pause">(null);

  const [rejectSelected, setRejectSelected] = useState<string[]>([]);
  const [rejectPrecision, setRejectPrecision] = useState("");
  const [pauseSelected, setPauseSelected] = useState<string[]>([]);
  const [pausePrecision, setPausePrecision] = useState("");

  const rejectFinal = composeReason(
    REJECTION_REASONS,
    rejectSelected,
    rejectPrecision,
  );
  const pauseFinal = composeReason(PAUSE_REASONS, pauseSelected, pausePrecision);

  function togglePanel(next: "reject" | "pause") {
    setError(null);
    setPanel((p) => (p === next ? null : next));
  }

  function toggle(list: string[], setList: (v: string[]) => void, label: string) {
    setError(null);
    setList(
      list.includes(label)
        ? list.filter((r) => r !== label)
        : [...list, label],
    );
  }

  function handleApprove() {
    setError(null);
    if (
      !window.confirm("Approuver ce profil ? Son statut passera à « Approuvé ».")
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
    if (rejectSelected.length === 0) {
      setError("Sélectionnez au moins un motif de rejet.");
      return;
    }
    if (rejectFinal.length > REJECTION_REASON_MAX) {
      setError(
        `Le motif dépasse ${REJECTION_REASON_MAX} caractères. Retirez une raison ou raccourcissez la précision.`,
      );
      return;
    }
    startTransition(async () => {
      const res = await rejectProfileAction(profileId, rejectFinal);
      if (!res.ok) {
        setError(res.error);
      } else {
        setPanel(null);
        setRejectSelected([]);
        setRejectPrecision("");
      }
    });
  }

  function handlePause() {
    setError(null);
    if (pauseSelected.length === 0) {
      setError("Sélectionnez au moins un motif de pause.");
      return;
    }
    if (pauseFinal.length > REJECTION_REASON_MAX) {
      setError(
        `Le motif dépasse ${REJECTION_REASON_MAX} caractères. Retirez une raison ou raccourcissez la précision.`,
      );
      return;
    }
    startTransition(async () => {
      const res = await pauseProfileAction(profileId, pauseFinal);
      if (!res.ok) {
        setError(res.error);
      } else {
        setPanel(null);
        setPauseSelected([]);
        setPausePrecision("");
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
          {pending ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Check size={13} />
          )}
          Approuver
        </button>

        <button
          type="button"
          onClick={() => togglePanel("reject")}
          disabled={pending}
          aria-expanded={panel === "reject"}
          aria-label="Rejeter ce profil"
          className="inline-flex items-center gap-1.5 rounded-full border border-red-400/35 bg-red-400/10 px-3 py-1.5 text-xs font-semibold text-red-700/90 transition-colors hover:bg-red-400/15 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <X size={13} />
          Rejeter
        </button>

        <button
          type="button"
          onClick={() => togglePanel("pause")}
          disabled={pending || !PAUSE_ACTION_ENABLED}
          aria-expanded={panel === "pause"}
          title={
            PAUSE_ACTION_ENABLED
              ? "Mettre ce profil en pause"
              : "Disponible après application de la migration « paused » (L3-B2B)"
          }
          aria-label="Mettre en pause ce profil"
          className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-400/15 px-3 py-1.5 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-400/25 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Pause size={13} />
          Pause
        </button>
      </div>

      {panel === "reject" ? (
        <ReasonPanel
          idPrefix={`reject-${profileId}`}
          title="Motif du rejet"
          reasons={REJECTION_REASONS}
          selected={rejectSelected}
          onToggle={(label) =>
            toggle(rejectSelected, setRejectSelected, label)
          }
          precision={rejectPrecision}
          onPrecision={setRejectPrecision}
          finalReason={rejectFinal}
          onConfirm={handleReject}
          confirmLabel="Confirmer le rejet"
          pending={pending}
          accent={REJECT_ACCENT}
        />
      ) : null}

      {panel === "pause" && PAUSE_ACTION_ENABLED ? (
        <ReasonPanel
          idPrefix={`pause-${profileId}`}
          title="Mettre en pause"
          reasons={PAUSE_REASONS}
          selected={pauseSelected}
          onToggle={(label) => toggle(pauseSelected, setPauseSelected, label)}
          precision={pausePrecision}
          onPrecision={setPausePrecision}
          finalReason={pauseFinal}
          onConfirm={handlePause}
          confirmLabel="Confirmer la pause"
          pending={pending}
          accent={PAUSE_ACCENT}
        />
      ) : null}

      {error ? (
        <p className="text-xs font-medium text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
