"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CircleAlert,
  Globe,
  HeartHandshake,
  ListChecks,
  Loader2,
  MapPin,
  ShieldCheck,
  Target,
  UserRound,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import type { MaritalStatus, ProfileRow } from "@/lib/types/database";

/**
 * « Mes critères de découverte » (L3C-C).
 *
 * Aide le membre à PRÉPARER ses critères de découverte à partir des seules
 * informations qu'il a déjà renseignées. IMPORTANT :
 *   - lit UNIQUEMENT le profil du membre connecté (`.eq("id", user.id)`,
 *     garanti aussi par la RLS) — JAMAIS la liste d'autres profils ;
 *   - n'active AUCUN matching, swipe, chat ou mise en relation ;
 *   - se contente d'un résumé sobre + un rappel de ce qui manque.
 *
 * La découverte reste « en préparation » : ces critères serviront plus tard à
 * proposer des profils compatibles, progressivement.
 */

const MARITAL_LABELS: Record<MaritalStatus, string> = {
  celibataire: "Célibataire",
  divorce: "Divorcé(e)",
  veuf: "Veuf / Veuve",
  separe: "Séparé(e)",
};

type Criterion = {
  key: string;
  label: string;
  Icon: typeof MapPin;
  value: string | null;
  /** true si l'information est renseignée par le membre. */
  filled: boolean;
  /** true si le champ peut figurer dans « À compléter » (optionnel/manquant). */
  completable: boolean;
};

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; criteria: Criterion[] };

function buildCriteria(profile: ProfileRow | null): Criterion[] {
  // Origine vs résidence (PR Origine/Résidence) : deux informations
  // DISTINCTES — origin_city/origin_country (origine) et city/country
  // (résidence). Une origine absente (profils historiques) affiche
  // simplement « À compléter », jamais une erreur.
  const origin = [profile?.origin_city, profile?.origin_country]
    .map((v) => (v ?? "").trim())
    .filter(Boolean)
    .join(", ");

  const location = [profile?.city, profile?.country]
    .map((v) => (v ?? "").trim())
    .filter(Boolean)
    .join(", ");

  const marital =
    profile?.marital_status != null
      ? MARITAL_LABELS[profile.marital_status]
      : null;

  // L'intention est toujours définie (projet de mariage sérieux).
  const intention =
    profile?.intention === "mariage_serieux"
      ? "Mariage sérieux"
      : (profile?.intention?.trim() || null);

  const expectations = (profile?.partner_expectations ?? "").trim();

  // blur_photos a toujours une valeur (défaut true).
  const privacy = profile?.blur_photos
    ? "Photos floutées par défaut"
    : "Photos visibles";

  return [
    {
      key: "origin",
      label: "Origine",
      Icon: Globe,
      value: origin || null,
      filled: Boolean(origin),
      completable: true,
    },
    {
      key: "location",
      label: "Résidence",
      Icon: MapPin,
      value: location || null,
      filled: Boolean(location),
      completable: true,
    },
    {
      key: "marital",
      label: "Situation matrimoniale",
      Icon: HeartHandshake,
      value: marital,
      filled: Boolean(marital),
      completable: true,
    },
    {
      key: "intention",
      label: "Projet",
      Icon: Target,
      value: intention,
      filled: Boolean(intention),
      completable: false,
    },
    {
      key: "expectations",
      label: "Vos attentes",
      Icon: ListChecks,
      value: expectations ? "Renseignées" : null,
      filled: Boolean(expectations),
      completable: true,
    },
    {
      key: "privacy",
      label: "Confidentialité",
      Icon: ShieldCheck,
      value: privacy,
      filled: true,
      completable: false,
    },
  ];
}

export function DiscoverCriteria() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let active = true;

    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        // Le middleware redirige normalement déjà les non-connectés.
        if (active) setState({ status: "error" });
        return;
      }

      // Lecture du SEUL profil du membre connecté. Jamais de liste d'autres
      // membres : un unique enregistrement, filtré par son propre id.
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "origin_city, origin_country, city, country, marital_status, intention, partner_expectations, blur_photos",
        )
        .eq("id", user.id)
        .maybeSingle();

      if (!active) return;

      if (error) {
        console.error("[discover-criteria] lecture échouée:", error.message);
        setState({ status: "error" });
        return;
      }

      setState({
        status: "ready",
        criteria: buildCriteria((data as ProfileRow | null) ?? null),
      });
    }

    load();
    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="rounded-3xl border border-champagne-500/30 bg-cream-50/60 p-6 shadow-card sm:p-8">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-champagne-400/20 text-choco-600">
          <Target size={20} />
        </span>
        <div className="flex-1">
          <h2 className="font-serif text-xl font-semibold text-choco-700">
            Mes critères de découverte
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-700/75">
            Voici un résumé de vos informations actuelles. Elles serviront plus
            tard à vous proposer des profils compatibles, progressivement —
            aucune mise en relation n’est encore active.
          </p>
        </div>
      </div>

      {state.status === "loading" ? (
        <div className="mt-6 flex items-center gap-2 text-sm text-ink-700/60">
          <Loader2 size={16} className="animate-spin" />
          Chargement de vos informations…
        </div>
      ) : null}

      {state.status === "error" ? (
        <p className="mt-6 text-sm text-ink-700/60">
          Vos informations sont momentanément indisponibles. Réessayez plus
          tard.
        </p>
      ) : null}

      {state.status === "ready" ? (
        <DiscoverCriteriaBody criteria={state.criteria} />
      ) : null}
    </section>
  );
}

function DiscoverCriteriaBody({ criteria }: { criteria: Criterion[] }) {
  const missing = criteria.filter((c) => c.completable && !c.filled);

  return (
    <>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {criteria.map(({ key, label, Icon, value, filled }) => (
          <li
            key={key}
            className="flex items-start gap-3 rounded-2xl border border-champagne-500/25 bg-cream-100/40 p-4"
          >
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-champagne-400/20 text-choco-600">
              <Icon size={16} />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-700/55">
                {label}
              </p>
              {filled && value ? (
                <p className="mt-0.5 text-sm font-medium text-ink-800">
                  {value}
                </p>
              ) : (
                <p className="mt-0.5 text-sm text-ink-700/45">À compléter</p>
              )}
            </div>
          </li>
        ))}
      </ul>

      {missing.length > 0 ? (
        <div className="mt-6 rounded-2xl border border-champagne-500/35 bg-champagne-400/10 p-5">
          <div className="flex items-start gap-2.5">
            <CircleAlert
              size={18}
              className="mt-0.5 shrink-0 text-choco-600"
            />
            <div>
              <p className="font-medium text-choco-700">
                À compléter pour de meilleures propositions plus tard
              </p>
              <p className="mt-1 text-sm text-ink-700/75">
                Renseigner ces éléments aidera à vous proposer des profils plus
                compatibles, le moment venu :
              </p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {missing.map((c) => (
                  <li
                    key={c.key}
                    className="rounded-full border border-champagne-500/40 bg-cream-50/70 px-3 py-1 text-xs font-medium text-choco-700"
                  >
                    {c.label}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-6 text-sm text-ink-700/70">
          Vos informations essentielles sont renseignées. Vous pourrez les
          ajuster à tout moment.
        </p>
      )}

      <Link
        href="/profile"
        className="mt-6 inline-flex items-center gap-2 self-start rounded-full bg-gradient-to-br from-choco-600 to-choco-800 px-5 py-2.5 text-sm font-semibold text-cream-50 shadow-[0_12px_30px_-12px_rgba(43,26,18,0.8)] ring-1 ring-inset ring-champagne-400/30 transition-transform hover:-translate-y-0.5"
      >
        <UserRound size={16} />
        Compléter mon profil
        <ArrowRight size={16} />
      </Link>
    </>
  );
}
