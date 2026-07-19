"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  Church,
  Globe,
  Loader2,
  Moon,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import type { DiscoveryUniverse } from "@/lib/types/database";

/**
 * « Choisir mon univers de découverte » (L3C-C).
 *
 * Permet au membre d'enregistrer une PRÉFÉRENCE VOLONTAIRE d'espace de
 * découverte et d'entrer dans la page dédiée correspondante.
 *
 * Confidentialité / sécurité (contraintes absolues) :
 *   - lit UNIQUEMENT le profil du membre connecté (`.eq("id", user.id)`) ;
 *   - écrit UNIQUEMENT son propre profil (`update(...).eq("id", user.id)`) —
 *     jamais d'update global non filtré ;
 *   - ne liste JAMAIS d'autres profils, n'active aucun matching/chat/paiement.
 *
 * Cette préférence n'est pas une religion déclarée publiquement : elle reste
 * privée et modifiable, et n'est pas exposée aux autres membres dans cette phase.
 */

type Universe = {
  value: DiscoveryUniverse;
  title: string;
  subtitle: string | null;
  route: string;
  Icon: typeof Church;
  points: string[];
};

const UNIVERSES: Universe[] = [
  {
    value: "christian_marriage",
    title: "Rencontre / Mariage chrétien",
    subtitle: null,
    route: "/discover/chretien",
    Icon: Church,
    points: [
      "Profils partageant une vision chrétienne du mariage",
      "Valeurs familiales et engagement sérieux",
      "Projet de foyer stable",
      "Compatibilité de ville / pays",
      "Attentes matrimoniales renseignées",
    ],
  },
  {
    value: "islamic_marriage",
    title: "Rencontre / Mariage islamique",
    subtitle: null,
    route: "/discover/islamique",
    Icon: Moon,
    points: [
      "Profils orientés vers un mariage conforme aux valeurs islamiques",
      "Pudeur, confidentialité et respect du cadre familial",
      "Projet de mariage sérieux",
      "Compatibilité de ville / pays",
      "Attentes matrimoniales renseignées",
    ],
  },
  {
    value: "open_marriage",
    title: "Rencontre / Mariage pour tous",
    subtitle: "Sans distinction de religion",
    route: "/discover/pour-tous",
    Icon: Globe,
    points: [
      "Profils ouverts à une démarche de mariage sérieuse",
      "Valeurs personnelles et projet de vie",
      "Respect mutuel et stabilité",
      "Compatibilité de ville / pays",
      "Attentes matrimoniales renseignées",
    ],
  },
];

function buttonLabel(
  value: DiscoveryUniverse,
  current: DiscoveryUniverse | null,
): string {
  if (!current) return "Choisir cet univers";
  if (current === value) return "Entrer dans cet espace";
  return "Modifier mon choix";
}

export function DiscoverUniverses() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState<DiscoveryUniverse | null>(null);
  // Valeur en cours d'enregistrement (verrouille les boutons → anti double-clic).
  const [pending, setPending] = useState<DiscoveryUniverse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (active) setLoading(false);
        return;
      }

      // Lecture du SEUL profil du membre connecté.
      const { data, error: readError } = await supabase
        .from("profiles")
        .select("discovery_universe")
        .eq("id", user.id)
        .maybeSingle();

      if (!active) return;
      if (readError) {
        console.error("[discover-universes] lecture échouée:", readError.message);
      } else {
        setCurrent(
          (data?.discovery_universe as DiscoveryUniverse | null) ?? null,
        );
      }
      setLoading(false);
    }

    load();
    return () => {
      active = false;
    };
  }, []);

  async function handleChoose(universe: Universe) {
    if (pending) return; // anti double-clic
    setError(null);

    // Déjà l'univers enregistré → on entre directement sans réécriture.
    if (current === universe.value) {
      router.push(universe.route);
      return;
    }

    setPending(universe.value);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("Session expirée. Veuillez vous reconnecter.");
      setPending(null);
      return;
    }

    // Écriture STRICTEMENT filtrée sur le profil du membre connecté.
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ discovery_universe: universe.value })
      .eq("id", user.id);

    if (updateError) {
      console.error("[discover-universes] enregistrement échoué:", updateError.message);
      setError("Enregistrement impossible pour le moment. Réessayez.");
      setPending(null);
      return;
    }

    setCurrent(universe.value);
    router.push(universe.route);
  }

  return (
    <section className="flex flex-col gap-5">
      <div>
        <h2 className="font-serif text-xl font-semibold text-choco-700">
          Choisir mon univers de découverte
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-700/75">
          Choisissez un univers pour ouvrir immédiatement son flux de profils
          compatibles. L’accès aux cartes reste réservé aux membres dont le
          profil a été vérifié.
        </p>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-800"
        >
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        {UNIVERSES.map((u) => {
          const selected = current === u.value;
          const isPending = pending === u.value;
          return (
            <article
              key={u.value}
              className={`flex flex-col rounded-3xl border p-6 shadow-card transition-colors ${
                selected
                  ? "border-choco-500/40 bg-champagne-400/15"
                  : "border-champagne-500/30 bg-cream-50/60"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-champagne-400/20 text-choco-600">
                  <u.Icon size={20} />
                </span>
                {selected ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-choco-500/30 bg-choco-600/10 px-2.5 py-1 text-xs font-medium text-choco-700">
                    <Check size={12} />
                    Univers actuel
                  </span>
                ) : null}
              </div>

              <h3 className="mt-3 font-serif text-lg font-semibold text-choco-700">
                {u.title}
              </h3>
              {u.subtitle ? (
                <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-champagne-600">
                  {u.subtitle}
                </p>
              ) : null}

              <ul className="mt-3 flex flex-1 flex-col gap-1.5">
                {u.points.map((point) => (
                  <li
                    key={point}
                    className="flex items-start gap-2 text-sm text-ink-700/75"
                  >
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-champagne-500" />
                    {point}
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={() => handleChoose(u)}
                disabled={pending !== null}
                aria-busy={isPending}
                className="mt-5 inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-br from-choco-600 to-choco-800 px-5 py-2.5 text-sm font-semibold text-cream-50 shadow-[0_12px_30px_-12px_rgba(43,26,18,0.8)] ring-1 ring-inset ring-champagne-400/30 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
              >
                {isPending ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Enregistrement…
                  </>
                ) : loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Chargement…
                  </>
                ) : (
                  <>
                    {buttonLabel(u.value, current)}
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
