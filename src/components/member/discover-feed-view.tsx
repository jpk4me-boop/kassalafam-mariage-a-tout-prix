"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BadgeCheck,
  Check,
  Heart,
  Loader2,
  Lock,
  MapPin,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import type {
  DiscoverCandidateWithPhoto,
  DiscoveryUniverse,
  ExpressInterestResult,
  MaritalStatus,
} from "@/lib/types/database";
import { UNIVERSE_LABEL } from "@/lib/discovery/universe";

/**
 * L3D-B PR2/PR3 — Affichage des cartes de découverte (Client Component).
 *
 * Ne reçoit QUE des données sûres (10 champs + `signedUrl`).
 *   - « Exprimer un intérêt » (PR3) : SEULE écriture, via la RPC contrôlée
 *     `express_interest` (aucun insert/update direct de `matches`) ;
 *   - « Passer ce profil » masque la carte LOCALEMENT (aucune persistance) ;
 *   - photo affichée seulement si `signedUrl` ; sinon placeholder « Photo protégée »
 *     (`is_blurred`) ou neutre (pas de photo). `storage_path` n'existe pas ici.
 *
 * `initialStates` ne révèle QUE les intérêts sortants du viewer (`sent`) et les
 * intérêts mutuels (`matched`) ; jamais un intérêt entrant en attente.
 */

const TUTO_KEY = "kassalafam_discover_tuto_dismissed";

type InterestState =
  | "idle"
  | "sending"
  | "created"
  | "already"
  | "matched"
  | "error";

function InterestButton({
  targetId,
  universe,
  initial,
}: {
  targetId: string;
  universe: DiscoveryUniverse;
  initial?: "sent" | "matched";
}) {
  const [state, setState] = useState<InterestState>(
    initial === "matched" ? "matched" : initial === "sent" ? "already" : "idle",
  );

  const clickable = state === "idle" || state === "error";

  async function express() {
    if (!clickable) return;
    setState("sending");
    const supabase = createClient();
    const { data, error } = await supabase.rpc("express_interest", {
      p_target: targetId,
      p_universe: universe,
    });
    if (error) {
      console.error("[discover-feed] express_interest échoué:", error.message);
      setState("error");
      return;
    }
    const result = data as ExpressInterestResult;
    setState(
      result === "matched"
        ? "matched"
        : result === "created"
          ? "created"
          : "already",
    );
  }

  const label =
    state === "sending"
      ? "Envoi…"
      : state === "created"
        ? "Intérêt exprimé"
        : state === "already"
          ? "Intérêt déjà exprimé"
          : state === "matched"
            ? "Intérêt mutuel"
            : "Exprimer un intérêt";

  const done = state === "created" || state === "already" || state === "matched";

  const softMessage =
    state === "created"
      ? "Votre intérêt a été enregistré avec respect."
      : state === "matched"
        ? "L’intérêt est mutuel. Les prochaines étapes arriveront bientôt."
        : state === "error"
          ? "Impossible d’enregistrer cet intérêt pour le moment."
          : null;

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={express}
        disabled={!clickable}
        aria-busy={state === "sending"}
        className={
          done
            ? "inline-flex cursor-default items-center justify-center gap-2 rounded-full border border-emerald-600/30 bg-emerald-600/10 px-4 py-2 text-sm font-medium text-emerald-700"
            : "inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-br from-choco-600 to-choco-800 px-4 py-2 text-sm font-semibold text-cream-50 shadow-[0_12px_30px_-12px_rgba(43,26,18,0.8)] ring-1 ring-inset ring-champagne-400/30 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
        }
      >
        {state === "sending" ? (
          <Loader2 size={14} className="animate-spin" />
        ) : done ? (
          <Check size={14} />
        ) : (
          <Heart size={14} />
        )}
        {label}
      </button>
      {softMessage ? (
        <p
          className={`px-1 text-xs ${
            state === "error" ? "text-red-700" : "text-ink-700/60"
          }`}
        >
          {softMessage}
        </p>
      ) : null}
    </div>
  );
}

const MARITAL_LABEL: Record<MaritalStatus, string> = {
  celibataire: "Célibataire",
  divorce: "Divorcé(e)",
  veuf: "Veuf / Veuve",
  separe: "Séparé(e)",
};

export function DiscoverFeedView({
  candidates,
  universe,
  initialStates,
}: {
  candidates: DiscoverCandidateWithPhoto[];
  universe: DiscoveryUniverse;
  initialStates: Record<string, "sent" | "matched">;
}) {
  const [showTuto, setShowTuto] = useState(false);
  const [passed, setPassed] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Lecture localStorage après montage (évite tout décalage d'hydratation).
    let dismissed = true;
    try {
      dismissed = window.localStorage.getItem(TUTO_KEY) !== null;
    } catch {
      // localStorage indisponible : on n'affiche simplement pas le tuto.
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!dismissed) setShowTuto(true);
  }, []);

  function dismissTuto() {
    setShowTuto(false);
    try {
      window.localStorage.setItem(TUTO_KEY, "1");
    } catch {
      // ignore
    }
  }

  function skip(id: string) {
    setPassed((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }

  const visible = candidates.filter((c) => !passed.has(c.id));

  // État vide initial (aucun candidat compatible).
  if (candidates.length === 0) {
    return (
      <section className="flex flex-col items-start gap-3 rounded-3xl border border-dashed border-champagne-500/40 bg-cream-100/30 p-6 text-center sm:p-8">
        <div className="w-full">
          <h2 className="font-serif text-xl font-semibold text-choco-700">
            Aucun profil compatible pour le moment.
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-ink-700/70">
            De nouveaux membres rejoignent Kassalafam régulièrement. Revenez
            bientôt — et soignez votre profil pour de meilleures rencontres.
          </p>
          <Link
            href="/profile"
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-choco-600 to-choco-800 px-5 py-2.5 text-sm font-semibold text-cream-50 shadow-[0_12px_30px_-12px_rgba(43,26,18,0.8)] ring-1 ring-inset ring-champagne-400/30 transition-transform hover:-translate-y-0.5"
          >
            <UserRound size={16} />
            Compléter mon profil
          </Link>
        </div>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Mini-tutoriel premier usage (fermable, mémorisé). */}
      {showTuto ? (
        <div className="relative flex items-start gap-3 rounded-2xl border border-champagne-500/30 bg-champagne-400/10 p-4 pr-10">
          <Sparkles size={18} className="mt-0.5 shrink-0 text-choco-600" />
          <p className="text-sm text-ink-700/80">
            Voici des profils compatibles avec votre univers. Prenez le temps :
            ici, on privilégie le sérieux, le respect et le projet de foyer.
          </p>
          <button
            type="button"
            onClick={dismissTuto}
            aria-label="Fermer le message"
            className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full text-ink-700/50 transition-colors hover:bg-cream-100/60 hover:text-ink-800"
          >
            <X size={16} />
          </button>
        </div>
      ) : null}

      {visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-champagne-500/40 bg-cream-100/30 p-6 text-center text-sm text-ink-700/60">
          Vous avez parcouru tous les profils proposés pour le moment.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {visible.map((c) => (
            <li
              key={c.id}
              className="flex flex-col overflow-hidden rounded-3xl border border-champagne-500/30 bg-cream-50/60 shadow-card"
            >
              {/* Média */}
              <div className="relative aspect-[4/5] bg-cream-100/50">
                {c.signedUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={c.signedUrl}
                    alt={`Photo de ${c.first_name ?? "ce membre"}`}
                    className="h-full w-full object-cover"
                  />
                ) : c.is_blurred ? (
                  // Le membre a des photos mais a choisi de les garder privées.
                  <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-center text-ink-700/45">
                    <Lock size={26} />
                    <span className="text-sm font-medium text-ink-700/70">
                      Photo protégée
                    </span>
                    <span className="text-xs text-ink-700/55">
                      Ce membre a choisi de garder ses photos privées pour
                      l’instant.
                    </span>
                  </div>
                ) : (
                  // Aucune photo encore ajoutée — placeholder neutre.
                  <div className="flex h-full w-full items-center justify-center text-ink-700/30">
                    <UserRound size={32} />
                  </div>
                )}

                {/* Badge univers */}
                <span className="absolute left-2 top-2 inline-flex items-center rounded-full bg-choco-700/85 px-2.5 py-1 text-xs font-medium text-cream-50">
                  {UNIVERSE_LABEL[universe]}
                </span>
                {/* Badge vérifié */}
                <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full border border-emerald-600/30 bg-emerald-600/15 px-2.5 py-1 text-xs font-medium text-emerald-800 backdrop-blur">
                  <BadgeCheck size={12} />
                  Profil vérifié
                </span>
              </div>

              {/* Corps */}
              <div className="flex flex-1 flex-col gap-2 p-4">
                <h3 className="font-serif text-lg font-semibold text-choco-700">
                  {c.first_name ?? "Membre"}
                  {typeof c.age === "number" ? `, ${c.age}` : ""}
                </h3>

                {c.city || c.country ? (
                  <p className="flex items-center gap-1.5 text-sm text-ink-700/70">
                    <MapPin size={14} className="shrink-0 text-choco-600" />
                    {[c.city, c.country].filter(Boolean).join(" · ")}
                  </p>
                ) : null}

                {c.marital_status ? (
                  <span className="inline-flex w-fit items-center rounded-full border border-champagne-500/40 bg-cream-100/50 px-2.5 py-1 text-xs font-medium text-choco-700">
                    {MARITAL_LABEL[c.marital_status]}
                  </span>
                ) : null}

                {/* Actions */}
                <div className="mt-auto flex flex-col gap-2 pt-2">
                  <InterestButton
                    targetId={c.id}
                    universe={universe}
                    initial={initialStates[c.id]}
                  />
                  <button
                    type="button"
                    onClick={() => skip(c.id)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium text-ink-700/60 transition-colors hover:bg-cream-100/60 hover:text-ink-800"
                  >
                    <X size={14} />
                    Passer ce profil
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
