"use client";

import {
  useEffect,
  useState,
} from "react";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Loader2,
  Lock,
  MapPin,
  Sparkles,
  UserRound,
} from "lucide-react";

import {
  DISCOVER_PATH_BY_UNIVERSE,
  UNIVERSE_LABEL,
} from "@/lib/discovery/universe";
import type {
  DiscoverCandidateWithPhoto,
  DiscoveryUniverse,
  MaritalStatus,
} from "@/lib/types/database";

type ReadySelectionResponse = Readonly<{
  status: "ready";
  universe: DiscoveryUniverse;
  candidates: DiscoverCandidateWithPhoto[];
}>;

type GuardSelectionStatus =
  | "needs_verification"
  | "needs_profile"
  | "needs_universe"
  | "unavailable";

type GuardSelectionResponse = {
  [Status in GuardSelectionStatus]: Readonly<{
    status: Status;
  }>;
}[GuardSelectionStatus];

type SelectionResponse =
  | ReadySelectionResponse
  | GuardSelectionResponse;

const MARITAL_LABEL: Record<
  MaritalStatus,
  string
> = {
  celibataire: "Célibataire",
  divorce: "Divorcé(e)",
  veuf: "Veuf / Veuve",
  separe: "Séparé(e)",
};

function SelectionSkeleton() {
  return (
    <section
      aria-live="polite"
      aria-busy="true"
      className="rounded-[2rem] border border-champagne-500/30 bg-cream-50/60 p-6 shadow-card sm:p-8"
    >
      <div className="flex items-center gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-champagne-400/20 text-choco-600">
          <Loader2
            size={20}
            className="animate-spin"
          />
        </span>

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-champagne-600">
            La sélection KASSALAFAM
          </p>

          <h2 className="mt-1 font-serif text-xl font-semibold text-choco-700 sm:text-2xl">
            Recherche de profils compatibles…
          </h2>
        </div>
      </div>

      <p className="mt-4 max-w-2xl text-sm leading-6 text-ink-700/70">
        Nous consultons votre univers matrimonial afin de vous présenter les profils réellement disponibles.
      </p>
    </section>
  );
}

function SelectionState({
  title,
  text,
  href,
  label,
}: {
  title: string;
  text: string;
  href: string;
  label: string;
}) {
  return (
    <section className="rounded-[2rem] border border-dashed border-champagne-500/40 bg-cream-100/35 p-6 sm:p-8">
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-champagne-400/20 text-choco-600">
        <Sparkles size={20} />
      </span>

      <h2 className="mt-4 font-serif text-2xl font-semibold text-choco-700">
        {title}
      </h2>

      <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-700/70">
        {text}
      </p>

      <Link
        href={href}
        className="mt-5 inline-flex items-center gap-2 rounded-full border border-champagne-500/40 bg-cream-50 px-5 py-2.5 text-sm font-semibold text-choco-700 transition-colors hover:bg-champagne-400/15"
      >
        {label}
        <ArrowRight size={16} />
      </Link>
    </section>
  );
}

function CandidateMedia({
  candidate,
  universe,
}: {
  candidate: DiscoverCandidateWithPhoto;
  universe: DiscoveryUniverse;
}) {
  return (
    <div className="relative aspect-[4/5] bg-cream-100/50">
      {candidate.signedUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={candidate.signedUrl}
          alt={
            "Photo de " +
            (candidate.first_name ?? "ce membre")
          }
          className="h-full w-full object-cover"
        />
      ) : candidate.is_blurred ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-center text-ink-700/45">
          <Lock size={25} />

          <span className="text-sm font-medium text-ink-700/70">
            Photo protégée
          </span>
        </div>
      ) : (
        <div className="flex h-full w-full items-center justify-center text-ink-700/30">
          <UserRound size={32} />
        </div>
      )}

      <span className="absolute left-2 top-2 rounded-full bg-choco-700/85 px-2.5 py-1 text-xs font-medium text-cream-50">
        {UNIVERSE_LABEL[universe]}
      </span>

      <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full border border-emerald-600/30 bg-emerald-600/15 px-2.5 py-1 text-xs font-medium text-emerald-800 backdrop-blur">
        <BadgeCheck size={12} />
        Vérifié
      </span>
    </div>
  );
}

export function DashboardSelection() {
  const [result, setResult] =
    useState<SelectionResponse | null>(null);

  const [failed, setFailed] =
    useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const response = await fetch(
          "/api/dashboard/selection",
          {
            cache: "no-store",
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          throw new Error(
            "La sélection n'est pas disponible.",
          );
        }

        const payload =
          (await response.json()) as SelectionResponse;

        setResult(payload);
      }
      catch (error) {
        if (
          error instanceof DOMException &&
          error.name === "AbortError"
        ) {
          return;
        }

        setFailed(true);
      }
    }

    void load();

    return () => {
      controller.abort();
    };
  }, []);

  if (failed) {
    return (
      <SelectionState
        title="La sélection est momentanément indisponible"
        text="Vos profils compatibles ne peuvent pas être chargés pour le moment. Vous pouvez toujours ouvrir lespace Découverte."
        href="/discover"
        label="Ouvrir Découverte"
      />
    );
  }

  if (!result) {
    return <SelectionSkeleton />;
  }

  if (result.status === "unavailable") {
    return (
      <SelectionState
        title="La sélection est momentanément indisponible"
        text="Vos profils compatibles ne peuvent pas être chargés pour le moment. Vous pouvez toujours ouvrir lespace Découverte."
        href="/discover"
        label="Ouvrir Découverte"
      />
    );
  }

  if (result.status === "needs_verification") {
    return (
      <SelectionState
        title="Votre sélection arrive bientôt"
        text="La sélection de profils est accessible après la vérification de votre profil par notre équipe."
        href="/profile"
        label="Voir mon profil"
      />
    );
  }

  if (result.status === "needs_profile") {
    return (
      <SelectionState
        title="Complétez votre profil"
        text="Certaines informations sont nécessaires avant de pouvoir proposer des profils réellement compatibles."
        href="/profile"
        label="Compléter mon profil"
      />
    );
  }

  if (result.status === "needs_universe") {
    return (
      <SelectionState
        title="Choisissez votre univers matrimonial"
        text="Votre univers permet à KASSALAFAM de sélectionner des profils cohérents avec votre démarche."
        href="/discover"
        label="Choisir mon univers"
      />
    );
  }

  const discoverHref =
    DISCOVER_PATH_BY_UNIVERSE[result.universe];

  if (result.candidates.length === 0) {
    return (
      <SelectionState
        title="Aucun profil compatible pour le moment"
        text="De nouveaux membres rejoignent progressivement KASSALAFAM. Revenez bientôt pour découvrir de nouvelles suggestions."
        href={discoverHref}
        label="Voir lespace Découverte"
      />
    );
  }

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-champagne-600">
            La sélection KASSALAFAM
          </p>

          <h2 className="mt-2 font-serif text-2xl font-semibold text-choco-700 sm:text-3xl">
            Des profils choisis pour toi
          </h2>

          <p className="mt-2 max-w-2xl text-sm text-ink-700/70">
            Une sélection limitée de profils vérifiés correspondant à votre univers matrimonial.
          </p>
        </div>

        <Link
          href={discoverHref}
          className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-choco-700 transition-colors hover:text-choco-800"
        >
          Voir tous les profils
          <ArrowRight size={16} />
        </Link>
      </div>

      <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {result.candidates.map((candidate) => (
          <li
            key={candidate.id}
            className="flex flex-col overflow-hidden rounded-3xl border border-champagne-500/30 bg-cream-50/60 shadow-card"
          >
            <CandidateMedia
              candidate={candidate}
              universe={result.universe}
            />

            <div className="flex flex-1 flex-col gap-2 p-4">
              <h3 className="font-serif text-lg font-semibold text-choco-700">
                {candidate.first_name ?? "Membre"}
                {typeof candidate.age === "number"
                  ? ", " + candidate.age
                  : ""}
              </h3>

              {candidate.city || candidate.country ? (
                <p className="flex items-center gap-1.5 text-sm text-ink-700/70">
                  <MapPin
                    size={14}
                    className="shrink-0 text-choco-600"
                  />

                  {[candidate.city, candidate.country]
                    .filter(Boolean)
                    .join("  ")}
                </p>
              ) : null}

              <div className="mt-auto flex flex-wrap gap-2 pt-2">
                {candidate.marital_status ? (
                  <span className="rounded-full border border-champagne-500/40 bg-cream-100/50 px-2.5 py-1 text-xs font-medium text-choco-700">
                    {
                      MARITAL_LABEL[
                        candidate.marital_status
                      ]
                    }
                  </span>
                ) : null}

                <span className="rounded-full border border-champagne-500/40 bg-cream-100/50 px-2.5 py-1 text-xs font-medium text-choco-700">
                  Mariage sérieux
                </span>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
