"use client";

import { useMemo, useState } from "react";
import { Loader2, Megaphone } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import type {
  AcquisitionSource,
  RecordAcquisitionSourceResult,
} from "@/lib/types/database";
import { cn } from "@/lib/utils";
import { FormError, Label } from "@/components/ui/field";

/**
 * Carte membre « Comment nous as-tu découverts ? » (onboarding acquisition).
 *
 * Enregistre la source d'acquisition EXCLUSIVEMENT via la RPC write-once
 * `public.record_acquisition_source(p_source, p_other)` — jamais d'écriture
 * directe dans les colonnes `acquisition_*` (rejetée en base par le trigger de
 * garde). La première réponse est immuable et la RPC est idempotente : les trois
 * résultats possibles (`recorded` / `unchanged` / `already_recorded`) signifient
 * tous « la source est enregistrée ». On appelle alors `onRecorded()` pour que le
 * dashboard masque immédiatement la carte, sans rechargement.
 *
 * `already_recorded` indique que l'écran s'appuyait probablement sur une donnée
 * devenue obsolète : on ne tente donc JAMAIS d'écraser la réponse existante — la
 * carte est simplement masquée.
 */

/** Longueur maximale de la précision « Autre » — MIROIR de la contrainte SQL
 *  `profiles_acquisition_source_other_check` (char_length(btrim(...)) <= 120)
 *  et des garde-fous de la RPC. Toute divergence ferait échouer l'écriture. */
const OTHER_MAX_LENGTH = 120;

const OPTIONS: { value: AcquisitionSource; label: string }[] = [
  { value: "tiktok", label: "TikTok" },
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "youtube", label: "YouTube" },
  { value: "whatsapp_recommendation", label: "WhatsApp / recommandation" },
  { value: "google", label: "Google" },
  { value: "other", label: "Autre" },
];

/** Les trois retours de la RPC valent tous « source enregistrée » → masquer. */
const SUCCESS_RESULTS: RecordAcquisitionSourceResult[] = [
  "recorded",
  "unchanged",
  "already_recorded",
];

export function AcquisitionSourceCard({
  onRecorded,
}: {
  /** Appelé après un enregistrement réussi (recorded / unchanged / already). */
  onRecorded: () => void;
}) {
  const [source, setSource] = useState<AcquisitionSource | null>(null);
  const [other, setOther] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const otherTrimmed = other.trim();
  const otherTooLong = otherTrimmed.length > OTHER_MAX_LENGTH;

  // Validité identique aux garde-fous de la RPC : une source choisie, et si
  // « other » une précision non vide (après trim) et ≤ 120 caractères.
  const isValid = useMemo(() => {
    if (!source) return false;
    if (source === "other") return otherTrimmed.length > 0 && !otherTooLong;
    return true;
  }, [source, otherTrimmed, otherTooLong]);

  function selectSource(value: AcquisitionSource) {
    setSource(value);
    setError(null);
    // Exigence : le champ « Autre » est ignoré / vidé dès qu'un autre choix
    // est sélectionné (jamais envoyé si la source n'est pas « other »).
    if (value !== "other") setOther("");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Anti double-clic : on court-circuite tout envoi concurrent ou invalide.
    if (!source || !isValid || saving) return;

    setError(null);
    setSaving(true);

    const supabase = createClient();
    const { data, error: rpcError } = await supabase.rpc(
      "record_acquisition_source",
      {
        p_source: source,
        p_other: source === "other" ? otherTrimmed : null,
      },
    );

    if (
      rpcError ||
      !SUCCESS_RESULTS.includes(data as RecordAcquisitionSourceResult)
    ) {
      // Seul chemin d'écriture. Message sobre, sans exposer de détail technique.
      setSaving(false);
      setError(
        "Enregistrement impossible pour le moment. Vérifie ta connexion et réessaie.",
      );
      return;
    }

    // recorded | unchanged | already_recorded → la carte est masquée par le
    // parent. On laisse `saving` à true : le composant est démonté juste après.
    onRecorded();
  }

  return (
    <section className="rounded-3xl border border-champagne-500/30 bg-cream-100/50 p-6 shadow-card sm:p-8">
      <form onSubmit={handleSubmit} noValidate className="flex flex-col">
        <fieldset disabled={saving} className="m-0 min-w-0 border-0 p-0">
          <legend className="flex items-center gap-2.5 font-serif text-xl font-semibold text-choco-700">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-champagne-400/20 text-choco-600">
              <Megaphone size={18} />
            </span>
            Comment nous as-tu découverts ?
          </legend>

          <p className="mt-3 max-w-xl text-sm text-ink-700/75">
            Ta réponse aide KASSALAFAM à mieux faire connaître la plateforme.
            Elle n’est enregistrée qu’une seule fois.
          </p>

          <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {OPTIONS.map((option) => {
              const checked = source === option.value;
              return (
                <label
                  key={option.value}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-sm transition focus-within:ring-2 focus-within:ring-champagne-400/50",
                    checked
                      ? "border-champagne-500 bg-champagne-400/15 shadow-inner"
                      : "border-champagne-500/30 bg-cream-50/70 hover:border-champagne-500/60",
                    saving && "cursor-not-allowed opacity-60",
                  )}
                >
                  <input
                    type="radio"
                    name="acquisition_source"
                    value={option.value}
                    checked={checked}
                    onChange={() => selectSource(option.value)}
                    className="h-4 w-4 shrink-0 accent-choco-600"
                  />
                  <span className="font-medium text-ink-800">
                    {option.label}
                  </span>
                </label>
              );
            })}
          </div>

          {source === "other" ? (
            <div className="mt-4">
              <Label htmlFor="acquisition_other">
                Précise, s’il te plaît
              </Label>
              <textarea
                id="acquisition_other"
                name="acquisition_other"
                required
                rows={2}
                maxLength={OTHER_MAX_LENGTH}
                value={other}
                onChange={(event) => {
                  setOther(event.target.value);
                  setError(null);
                }}
                placeholder="Par exemple : un ami, une affiche, un article…"
                aria-describedby="acquisition_other_help"
                className={cn(
                  "w-full resize-y rounded-xl border bg-cream-50/80 px-4 py-3 text-sm text-ink-800 shadow-inner outline-none transition placeholder:text-ink-700/40 focus:ring-2 focus:ring-champagne-400/40 disabled:cursor-not-allowed disabled:opacity-60",
                  otherTooLong
                    ? "border-red-500/50 focus:border-red-500"
                    : "border-champagne-500/30 focus:border-champagne-500",
                )}
              />
              <div
                id="acquisition_other_help"
                className="mt-1.5 flex items-center justify-between text-xs"
              >
                <span
                  className={otherTooLong ? "text-red-700" : "text-ink-700/55"}
                >
                  {otherTooLong ? "120 caractères maximum." : "Champ obligatoire."}
                </span>
                <span
                  className={cn(
                    "tabular-nums",
                    otherTooLong ? "text-red-700" : "text-ink-700/55",
                  )}
                >
                  {otherTrimmed.length}/{OTHER_MAX_LENGTH}
                </span>
              </div>
            </div>
          ) : null}
        </fieldset>

        {error ? (
          <div className="mt-5">
            <FormError message={error} />
          </div>
        ) : null}

        <button
          type="submit"
          disabled={!isValid || saving}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-br from-choco-600 to-choco-800 px-6 py-3 text-sm font-semibold text-cream-50 shadow-[0_14px_34px_-14px_rgba(43,26,18,0.85)] ring-1 ring-inset ring-champagne-400/30 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 sm:w-auto sm:self-start"
        >
          {saving ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Enregistrement…
            </>
          ) : (
            "Enregistrer ma réponse"
          )}
        </button>
      </form>
    </section>
  );
}
