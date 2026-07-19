"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import type { AcquisitionSource } from "@/lib/types/database";
import { FormError, Label, PrimaryButton } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { ChoiceCard } from "@/components/onboarding/choice-card";
import { StepShell } from "@/components/onboarding/step-shell";

/**
 * Étape 1 du wizard — « Comment nous avez-vous découverts ? » (source
 * d'acquisition).
 *
 * Enregistre la réponse EXCLUSIVEMENT via la RPC write-once
 * `public.record_acquisition_source(p_source, p_other)` (exigence 2) — jamais
 * d'écriture directe dans les colonnes acquisition_* (rejetée en base par le
 * trigger de garde). La première réponse est immuable et la RPC est idempotente :
 * `recorded` / `unchanged` / `already_recorded` signifient tous « source
 * enregistrée » → on appelle `onRecorded()` pour laisser le wizard décider de la
 * suite (avancer en Mode A, ou rediriger en Mode B).
 */

/** Longueur maximale de la précision « Autre » — MIROIR de la contrainte SQL
 *  `profiles_acquisition_source_other_check` (char_length(btrim(...)) <= 120)
 *  et de la RPC. Toute divergence ferait échouer l'écriture côté base. */
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

type Status = "idle" | "saving";

export function AcquisitionStep({
  onRecorded,
  disabled,
}: {
  /** Appelé après un enregistrement réussi (recorded / unchanged / already). */
  onRecorded: () => void;
  disabled?: boolean;
}) {
  const router = useRouter();

  const [source, setSource] = useState<AcquisitionSource | null>(null);
  const [other, setOther] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const otherTrimmed = other.trim();
  const otherTooLong = otherTrimmed.length > OTHER_MAX_LENGTH;

  // Validité identique aux garde-fous de la RPC : une source choisie, et si
  // « other » une précision non vide (après trim) et ≤ 120 caractères.
  const isValid = useMemo(() => {
    if (!source) return false;
    if (source === "other") {
      return otherTrimmed.length > 0 && !otherTooLong;
    }
    return true;
  }, [source, otherTrimmed, otherTooLong]);

  const busy = disabled || status === "saving";

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!source || !isValid || busy) return;

    setError(null);
    setStatus("saving");

    const supabase = createClient();

    // Défense supplémentaire : la session doit être valide. Sans elle, la RPC
    // (auth.uid()) lèverait « not authenticated » — on court-circuite proprement.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.replace(`/login?redirect=${encodeURIComponent("/onboarding")}`);
      return;
    }

    const { error: rpcError } = await supabase.rpc("record_acquisition_source", {
      p_source: source,
      p_other: source === "other" ? otherTrimmed : null,
    });

    if (rpcError) {
      // Seul chemin d'écriture. On ne gère ici que les vraies erreurs (réseau,
      // session, validation) sans exposer de détail technique au membre.
      setStatus("idle");
      setError(
        "Enregistrement impossible pour le moment. Vérifiez votre connexion et réessayez.",
      );
      return;
    }

    // La RPC est idempotente et write-once : tous les cas de succès signifient
    // « la source est enregistrée » → on laisse le wizard poursuivre.
    onRecorded();
  }

  return (
    <StepShell
      title="Comment nous avez-vous découverts ?"
      description="Votre réponse nous aide simplement à mieux vous connaître. Elle n'est enregistrée qu'une seule fois."
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
        {error ? <FormError message={error} /> : null}

        <div
          role="radiogroup"
          aria-label="Comment nous avez-vous découverts ?"
          className="grid grid-cols-1 gap-2.5 sm:grid-cols-2"
        >
          {OPTIONS.map((option) => (
            <ChoiceCard
              key={option.value}
              selected={source === option.value}
              disabled={busy}
              onSelect={() => {
                setSource(option.value);
                setError(null);
                if (option.value !== "other") setOther("");
              }}
              title={option.label}
            />
          ))}
        </div>

        {source === "other" ? (
          <div>
            <Label htmlFor="acquisition_other">Précisez, s’il vous plaît</Label>
            <textarea
              id="acquisition_other"
              name="acquisition_other"
              required
              rows={2}
              maxLength={OTHER_MAX_LENGTH}
              value={other}
              onChange={(e) => {
                setOther(e.target.value);
                setError(null);
              }}
              disabled={busy}
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
              <span className={otherTooLong ? "text-red-700" : "text-ink-700/55"}>
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

        <PrimaryButton type="submit" disabled={!isValid || busy}>
          {status === "saving" ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Enregistrement…
            </>
          ) : (
            <>
              Continuer
              <ArrowRight size={16} />
            </>
          )}
        </PrimaryButton>
      </form>
    </StepShell>
  );
}
