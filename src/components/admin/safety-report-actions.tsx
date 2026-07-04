"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, ShieldQuestion, X } from "lucide-react";

import {
  SAFETY_TRANSITIONS,
  SAFETY_NOTE_MIN,
  SAFETY_NOTE_MAX,
  safetyNoteRequired,
  type SafetyActionableStatus,
  type SafetyTransition,
} from "@/lib/admin/safety-reports";
import { transitionSafetyReportAction } from "@/app/admin/reports/actions";

/**
 * Actions de traitement d'un signalement — CÔTÉ CLIENT (L3F-C2B).
 *
 * Ce composant n'importe QUE la Server Action (référence RPC) et des helpers
 * purs : aucune clé service_role, aucun secret, aucun appel Supabase navigateur
 * ne touche le bundle. Il ne reçoit que `reportId` et `currentStatus` — jamais
 * le snapshot du message, l'identité du déclarant ni aucune donnée sensible.
 *
 * Interaction en DEUX étapes : un premier clic ouvre un panneau de confirmation
 * (action choisie + note + règle de longueur + Confirmer/Annuler). Aucune
 * décision n'est exécutée au premier clic. La validation autoritative (admin,
 * transition, note, concurrence) est refaite côté serveur puis en base.
 */

const TONE_ACCENT: Record<
  SafetyTransition["tone"],
  { button: string; panel: string; confirm: string; input: string }
> = {
  review: {
    button:
      "border-champagne-500/40 bg-champagne-400/15 text-choco-700 hover:bg-champagne-400/25",
    panel: "border-champagne-500/25 bg-champagne-400/5",
    confirm:
      "border-choco-600/35 bg-choco-600/10 text-choco-700 hover:bg-choco-600/15",
    input: "focus:border-choco-500/50 focus:ring-choco-500/20",
  },
  resolve: {
    button:
      "border-emerald-600/35 bg-emerald-500/10 text-emerald-700/90 hover:bg-emerald-500/15",
    panel: "border-emerald-600/25 bg-emerald-500/5",
    confirm:
      "border-emerald-600/35 bg-emerald-500/10 text-emerald-700/90 hover:bg-emerald-500/15",
    input: "focus:border-emerald-500/50 focus:ring-emerald-500/20",
  },
  dismiss: {
    button:
      "border-ink-700/25 bg-ink-700/5 text-ink-700/70 hover:bg-ink-700/10",
    panel: "border-ink-700/20 bg-ink-700/5",
    confirm:
      "border-ink-700/30 bg-ink-700/10 text-ink-700/80 hover:bg-ink-700/15",
    input: "focus:border-ink-700/40 focus:ring-ink-700/15",
  },
};

export function SafetyReportActions({
  reportId,
  currentStatus,
}: {
  reportId: string;
  currentStatus: SafetyActionableStatus;
}) {
  const transitions = SAFETY_TRANSITIONS[currentStatus];

  const [selected, setSelected] = useState<SafetyTransition | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function openPanel(transition: SafetyTransition) {
    if (pending) return;
    setSelected(transition);
    setNote("");
    setError(null);
    setSuccess(null);
  }

  function cancel() {
    if (pending) return;
    setSelected(null);
    setNote("");
    setError(null);
  }

  function confirm() {
    if (!selected || pending) return;
    setError(null);

    const trimmed = note.trim();
    const mustHaveNote = safetyNoteRequired(selected.newStatus);

    // Validation client (miroir du serveur ; la base reste l'autorité finale).
    if (mustHaveNote) {
      if (trimmed.length < SAFETY_NOTE_MIN || trimmed.length > SAFETY_NOTE_MAX) {
        setError(
          `La note doit contenir entre ${SAFETY_NOTE_MIN} et ${SAFETY_NOTE_MAX} caractères.`,
        );
        return;
      }
    } else if (trimmed.length > SAFETY_NOTE_MAX) {
      setError(`La note ne doit pas dépasser ${SAFETY_NOTE_MAX} caractères.`);
      return;
    }

    startTransition(async () => {
      const res = await transitionSafetyReportAction({
        reportId,
        expectedStatus: currentStatus,
        newStatus: selected.newStatus,
        note: trimmed,
      });
      if (res.ok) {
        // revalidatePath côté serveur va re-rendre la carte (statut à jour :
        // pour une décision finale ce composant disparaîtra). On ferme le
        // panneau ; le message de succès est transitoire.
        setSelected(null);
        setNote("");
        setSuccess(res.message);
      } else {
        setError(res.error);
      }
    });
  }

  const mustHaveNote = selected ? safetyNoteRequired(selected.newStatus) : false;
  const accent = selected ? TONE_ACCENT[selected.tone] : null;

  return (
    <div className="mt-3 border-t border-champagne-500/20 pt-3">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-700/50">
        Traitement
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {transitions.map((transition) => (
          <button
            key={transition.newStatus}
            type="button"
            onClick={() => openPanel(transition)}
            disabled={pending}
            aria-expanded={selected?.newStatus === transition.newStatus}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${TONE_ACCENT[transition.tone].button}`}
          >
            {transition.label}
          </button>
        ))}
      </div>

      {selected && accent ? (
        <div className={`mt-3 flex flex-col gap-3 rounded-xl border p-3 ${accent.panel}`}>
          <div className="flex items-start gap-2">
            <ShieldQuestion size={15} className="mt-0.5 shrink-0 text-choco-600" />
            <p className="text-xs text-choco-700">
              Confirmer l’action{" "}
              <span className="font-semibold">« {selected.label} »</span> ?
            </p>
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor={`note-${reportId}`}
              className="text-[11px] text-ink-700/60"
            >
              {mustHaveNote
                ? `Note de décision (obligatoire, entre ${SAFETY_NOTE_MIN} et ${SAFETY_NOTE_MAX} caractères)`
                : `Note (facultative, ${SAFETY_NOTE_MAX} caractères maximum)`}
            </label>
            <textarea
              id={`note-${reportId}`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={pending}
              required={mustHaveNote}
              minLength={mustHaveNote ? SAFETY_NOTE_MIN : undefined}
              maxLength={SAFETY_NOTE_MAX}
              rows={3}
              placeholder={
                mustHaveNote
                  ? "Expliquez la décision (conservée dans l’historique)."
                  : "Ajouter une note (facultatif)."
              }
              className={`w-full resize-y whitespace-pre-wrap break-words rounded-lg border border-champagne-500/30 bg-cream-50/80 px-3 py-2 text-sm text-ink-800 outline-none focus:ring-2 disabled:opacity-60 ${accent.input}`}
            />
            <span className="self-end text-[11px] text-ink-700/50">
              {note.trim().length}/{SAFETY_NOTE_MAX}
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
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${accent.confirm}`}
            >
              {pending ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Check size={13} />
              )}
              {pending ? "Traitement…" : "Confirmer"}
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="mt-2 text-xs font-medium text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      {success && !selected ? (
        <p
          className="mt-2 text-xs font-medium text-emerald-700"
          role="status"
        >
          {success}
        </p>
      ) : null}
    </div>
  );
}
