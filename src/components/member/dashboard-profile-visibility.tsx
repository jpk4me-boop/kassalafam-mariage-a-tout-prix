import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  Eye,
  EyeOff,
  ImageOff,
  LockKeyhole,
  ShieldAlert,
} from "lucide-react";

import {
  DISCOVER_PATH_BY_UNIVERSE,
  UNIVERSE_LABEL,
} from "@/lib/discovery/universe";
import type {
  AccountStatus,
  DiscoveryUniverse,
  ProfileVerificationStatus,
} from "@/lib/types/database";

type DashboardProfileVisibilityProps = Readonly<{
  accountStatus: AccountStatus | null;
  verificationStatus: ProfileVerificationStatus;
  complete: boolean;
  discoveryUniverse: DiscoveryUniverse | null;
  blurPhotos: boolean;
  hasPrimaryPhoto: boolean;
}>;

type VisibilityPresentation = Readonly<{
  title: string;
  text: string;
  href: string;
  label: string;
  visible: boolean;
}>;

const VERIFICATION_LABEL: Record<
  ProfileVerificationStatus,
  string
> = {
  pending: "Vérification en attente",
  approved: "Profil vérifié",
  rejected: "Vérification à reprendre",
  paused: "Vérification en pause",
};

function getVisibilityPresentation({
  accountStatus,
  verificationStatus,
  complete,
  discoveryUniverse,
}: Pick<
  DashboardProfileVisibilityProps,
  | "accountStatus"
  | "verificationStatus"
  | "complete"
  | "discoveryUniverse"
>): VisibilityPresentation {
  if (accountStatus == null) {
    return {
      title: "État de visibilité indisponible",
      text: "Létat actuel du compte na pas pu être déterminé. Aucun statut de visibilité nest affirmé.",
      href: "/profile",
      label: "Voir mon profil",
      visible: false,
    };
  }

  if (accountStatus === "suspended") {
    return {
      title: "Compte restreint",
      text: "Un compte suspendu ne peut pas être proposé dans les espaces de découverte.",
      href: "/account-suspended",
      label: "Voir la restriction",
      visible: false,
    };
  }

  if (verificationStatus === "pending") {
    return {
      title: "En attente de vérification",
      text: "Votre profil ne sera proposé dans la Découverte quaprès sa validation par léquipe KASSALAFAM.",
      href: "/profile",
      label: "Voir mon profil",
      visible: false,
    };
  }

  if (verificationStatus === "rejected") {
    return {
      title: "Vérification à reprendre",
      text: "Votre profil doit répondre aux demandes de vérification avant de pouvoir être proposé.",
      href: "/profile",
      label: "Consulter mon profil",
      visible: false,
    };
  }

  if (verificationStatus === "paused") {
    return {
      title: "Visibilité en pause",
      text: "La vérification de votre profil est actuellement en pause. Il nest pas proposé dans la Découverte.",
      href: "/profile",
      label: "Voir mon profil",
      visible: false,
    };
  }

  if (!discoveryUniverse) {
    return {
      title: "Univers matrimonial à choisir",
      text: "Choisissez votre univers matrimonial pour permettre des propositions cohérentes avec votre démarche.",
      href: "/discover",
      label: "Choisir mon univers",
      visible: false,
    };
  }

  if (!complete) {
    return {
      title: "Profil à compléter",
      text: "Les informations essentielles et la photo principale doivent être complétées avant une visibilité pleinement active.",
      href: "/profile",
      label: "Compléter mon profil",
      visible: false,
    };
  }

  return {
    title: "Visible dans la Découverte",
    text:
      "Votre profil remplit les conditions actuellement connues pour être proposé aux membres compatibles de lunivers " +
      UNIVERSE_LABEL[discoveryUniverse].toLowerCase() +
      ".",
    href:
      DISCOVER_PATH_BY_UNIVERSE[
        discoveryUniverse
      ],
    label: "Ouvrir mon univers",
    visible: true,
  };
}

function Requirement({
  satisfied,
  label,
}: {
  satisfied: boolean;
  label: string;
}) {
  const Icon = satisfied
    ? CheckCircle2
    : Circle;

  return (
    <li className="flex items-center gap-2 text-sm text-ink-700/72">
      <Icon
        size={16}
        className={
          satisfied
            ? "shrink-0 text-emerald-700"
            : "shrink-0 text-champagne-600/65"
        }
      />
      {label}
    </li>
  );
}

export function DashboardProfileVisibility(
  props: DashboardProfileVisibilityProps,
) {
  const presentation =
    getVisibilityPresentation(props);

  const accountActive =
    props.accountStatus === "active";

  const approved =
    props.verificationStatus === "approved";

  const universeChosen =
    props.discoveryUniverse != null;

  const StatusIcon = presentation.visible
    ? Eye
    : props.accountStatus === "suspended"
      ? ShieldAlert
      : EyeOff;

  let photoTitle =
    "Aucune photo principale";

  let photoText =
    "Ajoutez une photo principale afin de compléter votre profil matrimonial.";

  let PhotoIcon = ImageOff;

  if (props.hasPrimaryPhoto && props.blurPhotos) {
    photoTitle = "Photos protégées";
    photoText =
      "Votre photo reste masquée dans la Découverte et un emplacement protégé est présenté aux autres membres.";

    PhotoIcon = LockKeyhole;
  }
  else if (
    props.hasPrimaryPhoto &&
    !props.blurPhotos
  ) {
    photoTitle =
      "Photo visible aux membres autorisés";

    photoText =
      "Votre photo principale peut être affichée dans les espaces de découverte protégés, selon les règles daccès existantes.";

    PhotoIcon = Eye;
  }

  return (
    <section className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]">
      <article className="rounded-[2rem] border border-champagne-500/30 bg-cream-50/65 p-6 shadow-card sm:p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-champagne-600">
              Visibilité du profil
            </p>

            <div className="mt-3 flex items-center gap-3">
              <span
                className={
                  presentation.visible
                    ? "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-600/10 text-emerald-700"
                    : "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-champagne-400/20 text-choco-600"
                }
              >
                <StatusIcon size={21} />
              </span>

              <div>
                <h2 className="font-serif text-2xl font-semibold text-choco-700">
                  {presentation.title}
                </h2>

                <p
                  className={
                    presentation.visible
                      ? "mt-1 text-sm font-medium text-emerald-700"
                      : "mt-1 text-sm font-medium text-choco-600"
                  }
                >
                  État calculé en lecture seule
                </p>
              </div>
            </div>

            <p className="mt-4 max-w-2xl text-sm leading-6 text-ink-700/72">
              {presentation.text}
            </p>
          </div>

          <Link
            href={presentation.href}
            className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-choco-700 transition-colors hover:text-choco-800"
          >
            {presentation.label}
            <ArrowRight size={16} />
          </Link>
        </div>

        <ul className="mt-6 grid gap-3 border-t border-champagne-500/20 pt-5 sm:grid-cols-2">
          <Requirement
            satisfied={accountActive}
            label={
              accountActive
                ? "Compte actif"
                : "Compte non actif"
            }
          />

          <Requirement
            satisfied={approved}
            label={
              VERIFICATION_LABEL[
                props.verificationStatus
              ]
            }
          />

          <Requirement
            satisfied={props.complete}
            label={
              props.complete
                ? "Profil essentiel complet"
                : "Profil essentiel incomplet"
            }
          />

          <Requirement
            satisfied={universeChosen}
            label={
              props.discoveryUniverse
                ? UNIVERSE_LABEL[
                    props.discoveryUniverse
                  ]
                : "Univers non choisi"
            }
          />
        </ul>
      </article>

      <article className="rounded-[2rem] border border-champagne-500/30 bg-cream-100/45 p-6 shadow-card sm:p-7">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-champagne-400/20 text-choco-600">
          <PhotoIcon size={21} />
        </span>

        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.22em] text-champagne-600">
          Confidentialité des photos
        </p>

        <h2 className="mt-2 font-serif text-2xl font-semibold text-choco-700">
          {photoTitle}
        </h2>

        <p className="mt-3 text-sm leading-6 text-ink-700/72">
          {photoText}
        </p>

        <Link
          href="/profile"
          className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-choco-700 transition-colors hover:text-choco-800"
        >
          Gérer mes photos
          <ArrowRight size={16} />
        </Link>

        <p className="mt-5 border-t border-champagne-500/20 pt-4 text-xs leading-5 text-ink-700/55">
          Le partage public par lien est une fonction séparée. Cet état de découverte ne crée ni ne publie aucun lien public.
        </p>
      </article>
    </section>
  );
}
