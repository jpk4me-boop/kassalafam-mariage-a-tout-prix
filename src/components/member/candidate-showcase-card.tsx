"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  ExternalLink,
  Globe2,
  Image as ImageIcon,
  Loader2,
  ShieldCheck,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { FormError } from "@/components/ui/field";

/**
 * Vitrine publique des candidats — carte de pilotage du MEMBRE.
 *
 * Le back-end complet existe depuis les migrations `candidate_showcase_*`
 * (consentement, publication, retrait, projection publique `/candidats`) :
 * cette carte est la seule pièce manquante côté membre. Elle n'ajoute AUCUNE
 * règle : toutes les décisions restent prises en base par les RPC
 * `SECURITY DEFINER`, l'interface se contente de les exposer et de traduire
 * le motif d'inéligibilité en action concrète.
 *
 * Rien n'est publié sans deux gestes explicites et séparés du membre :
 * d'abord le consentement, puis la publication avec choix de la photo. Le
 * retrait est disponible en permanence et dépublie immédiatement.
 */

const BUCKET = "profile-photos";
const SIGNED_URL_TTL = 3600;

const CONSENT_TEXT =
  "J’autorise KASSALAFAM à présenter publiquement une version limitée de mon profil (prénom, âge, ville, pays, intention, courte présentation et la photo que je choisis) sur la vitrine des candidats, accessible sans compte et référençable par les moteurs de recherche. Je peux retirer cette autorisation à tout moment : ma présentation disparaît alors immédiatement du site. Je comprends qu’une page ou une image déjà récupérée par un moteur de recherche ou un réseau social peut subsister quelques jours dans leur propre cache, hors du contrôle de KASSALAFAM.";

/**
 * Motifs renvoyés par `candidate_showcase_eligibility_reason`, traduits en
 * message + action. Toute valeur inconnue retombe sur un message générique :
 * l'interface ne prétend jamais savoir mieux que la base.
 */
const ELIGIBILITY_MESSAGES: Record<
  string,
  { message: string; actionLabel?: string; actionHref?: string }
> = {
  account_suspended: {
    message:
      "Votre compte est momentanément suspendu : la vitrine publique n’est pas accessible.",
  },
  verification_required: {
    message:
      "Votre profil doit d’abord être vérifié par notre équipe. Cette étape protège la qualité de la vitrine.",
  },
  onboarding_incomplete: {
    message: "Terminez votre inscription pour pouvoir figurer dans la vitrine.",
    actionLabel: "Terminer mon inscription",
    actionHref: "/onboarding",
  },
  profile_incomplete: {
    message:
      "Certaines informations manquent encore : présentation, attentes, ville, pays ou univers de découverte.",
    actionLabel: "Compléter mon profil",
    actionHref: "/profile",
  },
  photo_privacy_enabled: {
    message:
      "Vos photos sont floutées par défaut. Pour figurer dans la vitrine publique, votre photo doit être visible — vous gardez la maîtrise de ce réglage.",
    actionLabel: "Modifier le floutage ci-dessus",
  },
  consent_required: {
    message:
      "Il vous reste à donner votre autorisation ci-dessous pour rejoindre la vitrine.",
  },
  photo_required: {
    message: "Choisissez la photo qui vous représentera dans la vitrine.",
  },
  photo_invalid: {
    message:
      "La photo choisie ne convient pas (format ou taille). Choisissez-en une autre, au format JPEG, PNG ou WebP.",
  },
  profile_not_found: {
    message: "Votre profil n’a pas pu être chargé. Réessayez plus tard.",
  },
};

type PhotoOption = {
  id: string;
  signedUrl: string | null;
  isPrimary: boolean;
};

type ShowcaseStatus = {
  consentActive: boolean;
  publicSlug: string | null;
  selectedPhotoId: string | null;
  effectivelyPublic: boolean;
  publishedAt: string | null;
  eligibilityReason: string | null;
};

type CardState =
  | { kind: "loading" }
  | { kind: "ready"; status: ShowcaseStatus };

/** Résultat d'un chargement : données brutes, AUCUN état React touché. */
type LoadedShowcase = {
  photos: PhotoOption[];
  status: ShowcaseStatus;
  error: string | null;
};

/**
 * Récupération PURE de l'état de vitrine — volontairement définie hors du
 * composant et sans aucun `setState` : l'effet se contente d'appliquer le
 * résultat dans un callback de promesse, jamais dans son corps synchrone
 * (règle `react-hooks/set-state-in-effect`, qui protège des rendus en
 * cascade).
 */
async function fetchShowcaseState(): Promise<LoadedShowcase> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      photos: [],
      status: emptyStatus(),
      error: "Votre session a expiré. Veuillez vous reconnecter.",
    };
  }

  const [photosResult, statusResult] = await Promise.all([
    supabase
      .from("photos")
      .select("id, storage_path, is_primary")
      .eq("profile_id", user.id)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true }),
    supabase.rpc("get_my_candidate_showcase_status"),
  ]);

  const photoRows = photosResult.data ?? [];
  const urlByPath = new Map<string, string>();

  if (photoRows.length > 0) {
    const { data: signedRows } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(
        photoRows.map((photo) => photo.storage_path),
        SIGNED_URL_TTL,
      );

    for (const signed of signedRows ?? []) {
      if (signed.path && signed.signedUrl) {
        urlByPath.set(signed.path, signed.signedUrl);
      }
    }
  }

  const photos: PhotoOption[] = photoRows.map((photo) => ({
    id: photo.id,
    signedUrl: urlByPath.get(photo.storage_path) ?? null,
    isPrimary: photo.is_primary,
  }));

  if (statusResult.error) {
    return {
      photos,
      status: emptyStatus(),
      error: "Impossible de charger votre statut de vitrine.",
    };
  }

  const row = Array.isArray(statusResult.data)
    ? statusResult.data[0]
    : statusResult.data;

  return {
    photos,
    status: row
      ? {
          consentActive: Boolean(row.consent_active),
          publicSlug: row.public_slug ?? null,
          selectedPhotoId: row.selected_photo_id ?? null,
          effectivelyPublic: Boolean(row.effectively_public),
          publishedAt: row.published_at ?? null,
          eligibilityReason: row.eligibility_reason ?? null,
        }
      : emptyStatus(),
    error: photosResult.error
      ? "Impossible de charger vos photos. Réessayez."
      : null,
  };
}

export function CandidateShowcaseCard() {
  const [state, setState] = useState<CardState>({ kind: "loading" });
  const [photos, setPhotos] = useState<PhotoOption[]>([]);
  const [selectedPhotoId, setSelectedPhotoId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /** Application du résultat à l'état React — jamais appelée dans le corps
   *  synchrone d'un effet. */
  const applyLoaded = useCallback((loaded: LoadedShowcase) => {
    setPhotos(loaded.photos);
    setSelectedPhotoId(
      loaded.status.selectedPhotoId ??
        loaded.photos.find((photo) => photo.isPrimary)?.id ??
        loaded.photos[0]?.id ??
        "",
    );
    setError(loaded.error);
    setState({ kind: "ready", status: loaded.status });
  }, []);

  useEffect(() => {
    let mounted = true;

    void fetchShowcaseState().then((loaded) => {
      if (mounted) applyLoaded(loaded);
    });

    return () => {
      mounted = false;
    };
  }, [applyLoaded]);

  async function runRpc(
    action: "grant" | "withdraw" | "publish" | "unpublish",
  ) {
    setError(null);
    setNotice(null);
    setPending(true);

    const supabase = createClient();
    let rpcError: { message: string } | null = null;

    if (action === "grant") {
      ({ error: rpcError } = await supabase.rpc(
        "grant_my_candidate_showcase_consent",
      ));
    } else if (action === "withdraw") {
      ({ error: rpcError } = await supabase.rpc(
        "withdraw_my_candidate_showcase_consent",
      ));
    } else if (action === "publish") {
      ({ error: rpcError } = await supabase.rpc(
        "publish_my_candidate_showcase",
        { p_photo_id: selectedPhotoId },
      ));
    } else {
      ({ error: rpcError } = await supabase.rpc(
        "unpublish_my_candidate_showcase",
      ));
    }

    if (rpcError) {
      // Le statut peut avoir changé côté base : on le relit dans tous les cas,
      // puis on réaffiche le message d'échec (applyLoaded remet `error` à jour).
      const loaded = await fetchShowcaseState();
      applyLoaded(loaded);
      setPending(false);
      setError(
        action === "publish"
          ? "La publication n’a pas abouti. Vérifiez les conditions ci-dessus et réessayez."
          : "L’opération n’a pas abouti. Réessayez.",
      );
      return;
    }

    // La base reste l'autorité : on relit le statut plutôt que de le deviner.
    const loaded = await fetchShowcaseState();
    applyLoaded(loaded);
    setPending(false);

    setNotice(
      {
        grant: "Autorisation enregistrée. Vous pouvez maintenant publier votre profil.",
        withdraw:
          "Autorisation retirée. Votre profil ne figure plus dans la vitrine publique.",
        publish: "Votre profil est en ligne dans la vitrine des candidats.",
        unpublish:
          "Votre profil a été retiré de la vitrine. Votre autorisation reste enregistrée.",
      }[action],
    );
  }

  if (state.kind === "loading") {
    return (
      <section className="glass flex items-center justify-center rounded-3xl p-6 shadow-card sm:p-8">
        <Loader2 className="animate-spin text-ink-700/50" aria-hidden />
      </section>
    );
  }

  const { status } = state;
  const reason = status.eligibilityReason;
  const isEligible = reason === "eligible";
  const blocking =
    reason && reason !== "eligible" && reason !== "consent_required"
      ? ELIGIBILITY_MESSAGES[reason] ?? {
          message:
            "Votre profil ne remplit pas encore les conditions de la vitrine publique.",
        }
      : null;

  return (
    <section className="glass rounded-3xl p-6 shadow-card sm:p-8">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-champagne-400/20 text-choco-600">
          <Globe2 size={20} aria-hidden />
        </span>

        <div>
          <h2 className="font-serif text-xl font-semibold text-choco-700">
            Vitrine publique des candidats
          </h2>

          <p className="mt-1 text-sm leading-relaxed text-ink-700/75">
            Figurez sur la page <strong>/candidats</strong>, visible sans
            compte : c’est ce qui donne envie aux visiteurs de rejoindre
            KASSALAFAM. Vous choisissez la photo, et vous pouvez vous retirer à
            tout moment.
          </p>
        </div>
      </div>

      {error ? (
        <div className="mt-4">
          <FormError message={error} />
        </div>
      ) : null}

      {notice ? (
        <p
          role="status"
          className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
        >
          {notice}
        </p>
      ) : null}

      {/* État EN LIGNE : lien public + retrait. */}
      {status.effectivelyPublic && status.publicSlug ? (
        <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
            <Check size={16} aria-hidden />
            Votre profil est en ligne dans la vitrine.
          </p>

          <Link
            href={`/candidats/${status.publicSlug}`}
            target="_blank"
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-emerald-900 underline decoration-emerald-300 underline-offset-2"
          >
            Voir ma présentation publique
            <ExternalLink size={14} aria-hidden />
          </Link>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={pending}
              onClick={() => void runRpc("unpublish")}
              className="inline-flex items-center gap-2 rounded-full border border-emerald-300 px-5 py-2.5 text-sm font-semibold text-emerald-900 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? <Loader2 size={15} className="animate-spin" /> : null}
              Me retirer de la vitrine
            </button>
          </div>
        </div>
      ) : null}

      {/* Condition bloquante : message + action concrète. */}
      {blocking ? (
        <div className="mt-5 rounded-2xl border border-champagne-500/30 bg-cream-100/50 p-4">
          <p className="text-sm leading-relaxed text-ink-700/80">
            {blocking.message}
          </p>

          {blocking.actionHref ? (
            <Link
              href={blocking.actionHref}
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-choco-700 underline decoration-champagne-500/50 underline-offset-2"
            >
              {blocking.actionLabel}
              <ArrowRight size={14} aria-hidden />
            </Link>
          ) : blocking.actionLabel ? (
            <p className="mt-2 text-xs font-medium text-choco-700">
              {blocking.actionLabel}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Consentement — premier geste explicite. */}
      {!status.consentActive ? (
        <div className="mt-5">
          <div className="flex items-start gap-2.5 rounded-2xl border border-champagne-500/30 bg-cream-100/40 p-4">
            <ShieldCheck
              size={16}
              className="mt-0.5 shrink-0 text-emerald-700"
              aria-hidden
            />
            <p className="text-xs leading-relaxed text-ink-700/75">
              {CONSENT_TEXT}
            </p>
          </div>

          <button
            type="button"
            disabled={pending || Boolean(blocking)}
            onClick={() => void runRpc("grant")}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-choco-600 to-choco-800 px-6 py-3 text-sm font-semibold text-cream-50 transition-transform enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? <Loader2 size={15} className="animate-spin" /> : null}
            J’autorise la présentation publique
          </button>
        </div>
      ) : null}

      {/* Publication — second geste explicite, avec choix de la photo. */}
      {status.consentActive && !status.effectivelyPublic ? (
        <div className="mt-5">
          <p className="text-sm font-semibold text-choco-700">
            Choisissez la photo de votre présentation publique
          </p>

          {photos.length === 0 ? (
            <p className="mt-2 text-sm text-ink-700/70">
              Ajoutez d’abord une photo à votre profil pour pouvoir publier.
            </p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-3">
              {photos.map((photo) => {
                const selected = photo.id === selectedPhotoId;

                return (
                  <button
                    key={photo.id}
                    type="button"
                    onClick={() => setSelectedPhotoId(photo.id)}
                    aria-pressed={selected}
                    disabled={pending}
                    className={`relative h-24 w-24 overflow-hidden rounded-2xl border-2 transition-colors ${
                      selected
                        ? "border-champagne-600"
                        : "border-champagne-500/30 hover:border-champagne-500/60"
                    }`}
                  >
                    {photo.signedUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={photo.signedUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-ink-700/40">
                        <ImageIcon size={20} aria-hidden />
                      </span>
                    )}

                    {selected ? (
                      <span className="absolute bottom-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-choco-700 text-cream-50">
                        <Check size={13} strokeWidth={3} aria-hidden />
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={pending || !selectedPhotoId || !isEligible}
              onClick={() => void runRpc("publish")}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-choco-600 to-choco-800 px-6 py-3 text-sm font-semibold text-cream-50 transition-transform enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? <Loader2 size={15} className="animate-spin" /> : null}
              Publier mon profil
            </button>

            <button
              type="button"
              disabled={pending}
              onClick={() => void runRpc("withdraw")}
              className="inline-flex items-center gap-2 rounded-full border border-champagne-500/40 px-5 py-2.5 text-sm font-semibold text-choco-700 transition-colors hover:bg-champagne-300/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Retirer mon autorisation
            </button>
          </div>
        </div>
      ) : null}

      {/* Retrait de l'autorisation, accessible même une fois en ligne. */}
      {status.consentActive && status.effectivelyPublic ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => void runRpc("withdraw")}
          className="mt-4 text-sm font-medium text-choco-600 underline decoration-champagne-500/50 underline-offset-2 transition-colors hover:text-choco-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Retirer mon autorisation et quitter la vitrine
        </button>
      ) : null}
    </section>
  );
}

function emptyStatus(): ShowcaseStatus {
  return {
    consentActive: false,
    publicSlug: null,
    selectedPhotoId: null,
    effectivelyPublic: false,
    publishedAt: null,
    eligibilityReason: null,
  };
}
