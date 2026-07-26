"use client";

import { useEffect, useState } from "react";
import {
  Check,
  Clock,
  Image as ImageIcon,
  Loader2,
  Megaphone,
  ShieldCheck,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import type {
  ProfilePromotionChannel,
  ProfilePromotionConsentRow,
  ProfilePromotionDurationDays,
} from "@/lib/types/database";
import { FormError, Select } from "@/components/ui/field";

const BUCKET = "profile-photos";
const SIGNED_URL_TTL = 3600;

const CONSENT_TEXT =
  "J’autorise KASSALAFAM à utiliser la photo que je sélectionne et une présentation limitée de mon profil à des fins de promotion de la plateforme sur les réseaux sociaux que je choisis, pendant la durée indiquée. Je peux retirer cette autorisation à tout moment pour les nouvelles publications.";

const CHANNEL_OPTIONS: {
  value: ProfilePromotionChannel;
  label: string;
}[] = [
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "snapchat", label: "Snapchat" },
  { value: "whatsapp", label: "WhatsApp" },
];

const DURATION_OPTIONS: {
  value: ProfilePromotionDurationDays;
  label: string;
}[] = [
  { value: 7, label: "7 jours" },
  { value: 30, label: "30 jours" },
  { value: 90, label: "90 jours" },
];

const CHANNEL_LABELS: Record<ProfilePromotionChannel, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  snapchat: "Snapchat",
  whatsapp: "WhatsApp",
};

const DATE_FORMAT = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "long",
  timeStyle: "short",
});

type PhotoOption = {
  id: string;
  signedUrl: string | null;
  isPrimary: boolean;
};

type ActiveConsent = {
  id: string;
  photoId: string | null;
  channels: ProfilePromotionChannel[];
  durationDays: ProfilePromotionDurationDays;
  consentedAt: string;
  expiresAt: string;
};

type ConsentState =
  | { kind: "loading" }
  | { kind: "inactive" }
  | { kind: "active"; consent: ActiveConsent };

function formatDate(value: string): string {
  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "Date indisponible"
    : DATE_FORMAT.format(date);
}

function isDurationDays(value: number): value is ProfilePromotionDurationDays {
  return value === 7 || value === 30 || value === 90;
}

function isPromotionChannel(
  value: string,
): value is ProfilePromotionChannel {
  return (
    value === "facebook" ||
    value === "instagram" ||
    value === "snapchat" ||
    value === "whatsapp"
  );
}

export function ProfilePromotionConsentCard() {
  const [state, setState] = useState<ConsentState>({ kind: "loading" });
  const [photos, setPhotos] = useState<PhotoOption[]>([]);
  const [selectedPhotoId, setSelectedPhotoId] = useState("");
  const [channels, setChannels] = useState<ProfilePromotionChannel[]>([]);
  const [durationDays, setDurationDays] =
    useState<ProfilePromotionDurationDays>(30);

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      const supabase = createClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!mounted) return;

      if (!user) {
        setState({ kind: "inactive" });
        setError("Votre session a expiré. Veuillez vous reconnecter.");
        return;
      }

      const [photosResult, consentResult] = await Promise.all([
        supabase
          .from("photos")
          .select("id, storage_path, is_primary")
          .eq("profile_id", user.id)
          .order("is_primary", { ascending: false })
          .order("created_at", { ascending: true }),

        supabase
          .from("profile_promotion_consents")
          .select(
            "id, photo_id, channels, duration_days, consented_at, expires_at",
          )
          .eq("profile_id", user.id)
          .is("withdrawn_at", null)
          .order("consented_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (!mounted) return;

      if (photosResult.error) {
        setState({ kind: "inactive" });
        setError("Impossible de charger vos photos. Réessayez.");
        return;
      }

      const photoRows = photosResult.data ?? [];
      const paths = photoRows.map((photo) => photo.storage_path);
      const urlByPath = new Map<string, string>();

      if (paths.length > 0) {
        const { data: signedRows } = await supabase.storage
          .from(BUCKET)
          .createSignedUrls(paths, SIGNED_URL_TTL);

        for (const signed of signedRows ?? []) {
          if (signed.path && signed.signedUrl) {
            urlByPath.set(signed.path, signed.signedUrl);
          }
        }
      }

      const loadedPhotos: PhotoOption[] = photoRows.map((photo) => ({
        id: photo.id,
        signedUrl: urlByPath.get(photo.storage_path) ?? null,
        isPrimary: photo.is_primary,
      }));

      setPhotos(loadedPhotos);

      if (consentResult.error) {
        setState({ kind: "inactive" });
        setSelectedPhotoId(
          loadedPhotos.find((photo) => photo.isPrimary)?.id ??
            loadedPhotos[0]?.id ??
            "",
        );
        setError("Impossible de charger votre autorisation promotionnelle.");
        return;
      }

      const rawConsent = consentResult.data as Pick<
        ProfilePromotionConsentRow,
        | "id"
        | "photo_id"
        | "channels"
        | "duration_days"
        | "consented_at"
        | "expires_at"
      > | null;

      const consentStillValid =
        rawConsent !== null &&
        new Date(rawConsent.expires_at).getTime() > Date.now();

      if (
        consentStillValid &&
        isDurationDays(rawConsent.duration_days) &&
        rawConsent.channels.every(isPromotionChannel)
      ) {
        const activeConsent: ActiveConsent = {
          id: rawConsent.id,
          photoId: rawConsent.photo_id,
          channels: rawConsent.channels,
          durationDays: rawConsent.duration_days,
          consentedAt: rawConsent.consented_at,
          expiresAt: rawConsent.expires_at,
        };

        setState({
          kind: "active",
          consent: activeConsent,
        });

        setSelectedPhotoId(
          rawConsent.photo_id &&
            loadedPhotos.some((photo) => photo.id === rawConsent.photo_id)
            ? rawConsent.photo_id
            : loadedPhotos.find((photo) => photo.isPrimary)?.id ??
                loadedPhotos[0]?.id ??
                "",
        );

        setChannels(activeConsent.channels);
        setDurationDays(activeConsent.durationDays);
        return;
      }

      setState({ kind: "inactive" });
      setSelectedPhotoId(
        loadedPhotos.find((photo) => photo.isPrimary)?.id ??
          loadedPhotos[0]?.id ??
          "",
      );
    }

    void load();

    return () => {
      mounted = false;
    };
  }, []);

  function toggleChannel(channel: ProfilePromotionChannel) {
    setError(null);
    setNotice(null);

    setChannels((current) =>
      current.includes(channel)
        ? current.filter((item) => item !== channel)
        : [...current, channel],
    );
  }

  async function saveConsent() {
    setError(null);
    setNotice(null);

    if (!selectedPhotoId) {
      setError("Sélectionnez une photo à utiliser pour la promotion.");
      return;
    }

    if (channels.length === 0) {
      setError("Sélectionnez au moins un réseau social.");
      return;
    }

    setPending(true);

    const supabase = createClient();

    const { data, error: rpcError } = await supabase.rpc(
      "set_my_profile_promotion_consent",
      {
        p_photo_id: selectedPhotoId,
        p_channels: channels,
        p_duration_days: durationDays,
      },
    );

    setPending(false);

    const result = data?.[0];

    if (rpcError || !result) {
      setError(
        "L’autorisation promotionnelle n’a pas pu être enregistrée. Réessayez.",
      );
      return;
    }

    setState({
      kind: "active",
      consent: {
        id: result.consent_id,
        photoId: result.photo_id,
        channels: result.channels,
        durationDays: result.duration_days,
        consentedAt: result.consented_at,
        expiresAt: result.expires_at,
      },
    });

    setNotice(
      result.replaced_previous
        ? "Votre autorisation promotionnelle a été mise à jour."
        : "Votre autorisation promotionnelle a été enregistrée.",
    );
  }

  async function withdrawConsent() {
    setError(null);
    setNotice(null);
    setPending(true);

    const supabase = createClient();

    const { data, error: rpcError } = await supabase.rpc(
      "withdraw_my_profile_promotion_consent",
    );

    setPending(false);

    if (rpcError) {
      setError("Le retrait de l’autorisation a échoué. Réessayez.");
      return;
    }

    setState({ kind: "inactive" });
    setNotice(
      data
        ? "Votre autorisation a été retirée. Aucune nouvelle promotion ne pourra être créée."
        : "Aucune autorisation active n’était enregistrée.",
    );
  }

  const activeConsent =
    state.kind === "active" ? state.consent : null;

  return (
    <section className="glass rounded-3xl p-6 shadow-card sm:p-8">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-champagne-400/20 text-choco-600">
          <Megaphone size={20} aria-hidden />
        </span>

        <div>
          <h2 className="font-serif text-xl font-semibold text-choco-700">
            Promotion de mon profil
          </h2>

          <p className="mt-1 text-sm leading-relaxed text-ink-700/75">
            Autorisez séparément KASSALAFAM à préparer des publications
            promotionnelles de votre profil sur les réseaux sociaux que vous
            choisissez.
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-start gap-2.5 rounded-2xl border border-champagne-500/30 bg-cream-100/40 p-4">
        <ShieldCheck
          size={17}
          className="mt-0.5 shrink-0 text-choco-600"
          aria-hidden
        />

        <p className="text-sm leading-relaxed text-ink-700/75">
          Cette autorisation est distincte du lien public limité de votre profil.
          Votre nom complet, vos coordonnées, vos messages et vos données
          administratives ne seront pas inclus.
        </p>
      </div>

      {activeConsent ? (
        <div className="mt-4 rounded-2xl border border-emerald-600/30 bg-emerald-600/5 p-4">
          <p className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-800">
            <Check size={16} aria-hidden />
            Autorisation promotionnelle active
          </p>

          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-ink-700/45">
                Réseaux autorisés
              </dt>
              <dd className="mt-1 text-ink-800">
                {activeConsent.channels
                  .map((channel) => CHANNEL_LABELS[channel])
                  .join(", ")}
              </dd>
            </div>

            <div>
              <dt className="text-xs uppercase tracking-wide text-ink-700/45">
                Fin de l’autorisation
              </dt>
              <dd className="mt-1 inline-flex items-center gap-1.5 text-ink-800">
                <Clock size={14} aria-hidden />
                {formatDate(activeConsent.expiresAt)}
              </dd>
            </div>
          </dl>
        </div>
      ) : null}

      {error ? (
        <div className="mt-4">
          <FormError message={error} />
        </div>
      ) : null}

      {notice ? (
        <p
          role="status"
          className="mt-4 rounded-2xl border border-emerald-600/25 bg-emerald-600/5 p-4 text-sm text-emerald-800"
        >
          {notice}
        </p>
      ) : null}

      {state.kind === "loading" ? (
        <p className="mt-5 inline-flex items-center gap-2 text-sm text-ink-700/60">
          <Loader2 size={16} className="animate-spin" aria-hidden />
          Chargement de votre autorisation promotionnelle
        </p>
      ) : photos.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-champagne-500/40 bg-cream-100/30 p-5 text-center">
          <ImageIcon
            size={23}
            className="mx-auto text-ink-700/40"
            aria-hidden
          />

          <p className="mt-2 text-sm font-medium text-choco-700">
            Une photo est nécessaire
          </p>

          <p className="mt-1 text-xs text-ink-700/60">
            Ajoutez d’abord une photo dans la section « Photos de profil »
            ci-dessus.
          </p>
        </div>
      ) : (
        <div className="mt-5 flex flex-col gap-5">
          <fieldset>
            <legend className="text-sm font-semibold text-choco-700">
              1. Photo autorisée
            </legend>

            <p className="mt-1 text-xs text-ink-700/55">
              Cette photo précise sera la seule utilisable pour cette
              autorisation.
            </p>

            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {photos.map((photo) => {
                const selected = selectedPhotoId === photo.id;

                return (
                  <label
                    key={photo.id}
                    className={`relative cursor-pointer overflow-hidden rounded-2xl border bg-cream-50/60 p-1.5 transition ${
                      selected
                        ? "border-choco-600 ring-2 ring-choco-600/20"
                        : "border-champagne-500/30 hover:border-champagne-500/60"
                    }`}
                  >
                    <input
                      type="radio"
                      name="promotion-photo"
                      value={photo.id}
                      checked={selected}
                      onChange={() => {
                        setSelectedPhotoId(photo.id);
                        setError(null);
                        setNotice(null);
                      }}
                      disabled={pending}
                      className="sr-only"
                    />

                    <span className="relative block aspect-square overflow-hidden rounded-xl bg-cream-100/60">
                      {photo.signedUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={photo.signedUrl}
                          alt="Photo proposée pour la promotion"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="flex h-full items-center justify-center text-ink-700/35">
                          <ImageIcon size={23} aria-hidden />
                        </span>
                      )}

                      {selected ? (
                        <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-choco-700 text-cream-50 shadow">
                          <Check size={14} aria-hidden />
                        </span>
                      ) : null}
                    </span>

                    <span className="mt-1.5 block text-center text-[11px] font-medium text-ink-700/65">
                      {photo.isPrimary ? "Photo principale" : "Photo du profil"}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-semibold text-choco-700">
              2. Réseaux autorisés
            </legend>

            <p className="mt-1 text-xs text-ink-700/55">
              Seuls les réseaux cochés pourront être utilisés.
            </p>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {CHANNEL_OPTIONS.map((option) => {
                const checked = channels.includes(option.value);

                return (
                  <label
                    key={option.value}
                    className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-sm transition ${
                      checked
                        ? "border-choco-600/40 bg-choco-600/5 text-choco-700"
                        : "border-champagne-500/30 bg-cream-100/30 text-ink-700/75"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleChannel(option.value)}
                      disabled={pending}
                      className="h-4 w-4 rounded border-champagne-500/50 accent-choco-600"
                    />

                    <span className="font-medium">{option.label}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div>
            <label
              htmlFor="promotion-duration"
              className="text-sm font-semibold text-choco-700"
            >
              3. Durée de l’autorisation
            </label>

            <Select
              id="promotion-duration"
              value={String(durationDays)}
              onChange={(event) => {
                const value = Number(event.target.value);

                if (isDurationDays(value)) {
                  setDurationDays(value);
                  setError(null);
                  setNotice(null);
                }
              }}
              disabled={pending}
              className="mt-2 sm:max-w-xs"
            >
              {DURATION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>

          <blockquote className="rounded-2xl border border-champagne-500/30 bg-cream-100/40 p-4 text-sm italic leading-relaxed text-ink-800">
             « {CONSENT_TEXT} »
          </blockquote>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={saveConsent}
              disabled={pending}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-gradient-to-br from-choco-600 to-choco-800 px-6 py-2.5 text-sm font-semibold text-cream-50 shadow-[0_12px_30px_-12px_rgba(43,26,18,0.8)] ring-1 ring-inset ring-champagne-400/30 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
            >
              {pending ? (
                <Loader2 size={16} className="animate-spin" aria-hidden />
              ) : (
                <Megaphone size={16} aria-hidden />
              )}

              {activeConsent
                ? "Mettre à jour mon autorisation"
                : "Autoriser la promotion"}
            </button>

            {activeConsent ? (
              <button
                type="button"
                onClick={withdrawConsent}
                disabled={pending}
                className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-red-500/30 bg-red-500/5 px-5 py-2.5 text-sm font-semibold text-red-700 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Retirer mon autorisation
              </button>
            ) : null}
          </div>

          <p className="text-xs leading-relaxed text-ink-700/55">
            Le retrait empêche toute nouvelle publication promotionnelle. Cette
            étape ne publie rien automatiquement : elle enregistre uniquement
            votre autorisation.
          </p>
        </div>
      )}
    </section>
  );
}
