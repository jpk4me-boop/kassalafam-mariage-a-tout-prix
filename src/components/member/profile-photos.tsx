"use client";

import { useEffect, useRef, useState } from "react";
import {
  Camera,
  Check,
  ImagePlus,
  Loader2,
  ShieldCheck,
  Star,
  Trash2,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { PhotoRow } from "@/lib/types/database";

/**
 * Gestion PRIVÉE des photos de profil du membre connecté (L3D-A).
 *
 * Confidentialité (contraintes absolues) :
 *   - lit/écrit UNIQUEMENT les photos du membre connecté
 *     (`.eq("profile_id", user.id)`, garanti aussi par la RLS de `photos`) ;
 *   - upload/lecture/suppression Storage dans le SEUL dossier {user.id}/...
 *     (bucket PRIVÉ `profile-photos`, RLS storage owner-only) ;
 *   - aperçu via URL SIGNÉE temporaire (aucune URL publique permanente) ;
 *   - ne liste jamais les photos d'autres membres, n'affiche rien à des tiers.
 *
 * Aucun matching, chat, paiement, IA, ni traitement biométrique.
 */

const BUCKET = "profile-photos";
const MAX_PHOTOS = 5;
const MAX_SIZE = 2 * 1024 * 1024; // 2 Mo
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const SIGNED_URL_TTL = 3600; // 1 h

type PhotoItem = { row: PhotoRow; signedUrl: string | null };

type Status = "loading" | "ready" | "error";

/** État agrégé remonté au parent (utilisé par le wizard d'onboarding pour gater
 *  la soumission finale sur l'existence d'une photo principale). */
export type ProfilePhotosState = { count: number; hasPrimary: boolean };

/**
 * @param bare        masque le cadre « carte » externe et l'en-tête, pour une
 *                    intégration dans un conteneur existant (wizard). La logique
 *                    d'upload / storage reste STRICTEMENT identique (aucune
 *                    duplication).
 * @param onStateChange notifié après chaque (re)chargement des photos.
 * @param onBusyChange notifié quand une opération photo (upload / changement de
 *                    principale / suppression) démarre ou se termine. Permet au
 *                    wizard de masquer « Continuer plus tard » pendant une
 *                    écriture en cours. N'altère aucune logique de stockage.
 */
export function ProfilePhotos({
  bare = false,
  onStateChange,
  onBusyChange,
}: {
  bare?: boolean;
  onStateChange?: (state: ProfilePhotosState) => void;
  onBusyChange?: (busy: boolean) => void;
} = {}) {
  const [status, setStatus] = useState<Status>("loading");
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [blurPhotos, setBlurPhotos] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function reload() {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setStatus("error");
      return;
    }

    // Réglage de confidentialité (affichage informatif).
    const { data: profile } = await supabase
      .from("profiles")
      .select("blur_photos")
      .eq("id", user.id)
      .maybeSingle();
    setBlurPhotos(profile?.blur_photos ?? null);

    // Photos du SEUL membre connecté.
    const { data: rows, error: readError } = await supabase
      .from("photos")
      .select(
        "id, profile_id, storage_path, is_primary, mime_type, size_bytes, created_at, updated_at",
      )
      .eq("profile_id", user.id)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true });

    if (readError) {
      console.error("[profile-photos] lecture échouée:", readError.message);
      setStatus("error");
      return;
    }

    const list = (rows as PhotoRow[] | null) ?? [];
    const paths = list.map((r) => r.storage_path);

    // Aperçu propriétaire via URLs signées (bucket privé).
    const signedByPath = new Map<string, string>();
    if (paths.length > 0) {
      const { data: signed } = await supabase.storage
        .from(BUCKET)
        .createSignedUrls(paths, SIGNED_URL_TTL);
      (signed ?? []).forEach((s) => {
        if (s.signedUrl && s.path) signedByPath.set(s.path, s.signedUrl);
      });
    }

    setPhotos(
      list.map((row) => ({
        row,
        signedUrl: signedByPath.get(row.storage_path) ?? null,
      })),
    );
    setStatus("ready");
    onStateChange?.({
      count: list.length,
      hasPrimary: list.some((row) => row.is_primary),
    });
  }

  useEffect(() => {
    // reload() est asynchrone : ses setState ont lieu après des await (jamais de
    // façon synchrone). Chargement initial des photos au montage.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, []);

  // Reporte l'état d'occupation au parent (lecture seule d'un état déjà géré
  // ici) : aucune écriture, aucune modification de la logique de stockage.
  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  function triggerFilePicker() {
    if (busy) return;
    setError(null);
    setSuccess(null);
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // réautorise la re-sélection du même fichier
    if (!file || busy) return;

    setError(null);
    setSuccess(null);

    if (!ALLOWED_TYPES.includes(file.type as (typeof ALLOWED_TYPES)[number])) {
      setError("Format non autorisé. Utilisez JPEG, PNG ou WebP.");
      return;
    }
    if (file.size > MAX_SIZE) {
      setError("Fichier trop lourd. 2 Mo maximum.");
      return;
    }
    if (photos.length >= MAX_PHOTOS) {
      setError(`Vous avez atteint la limite de ${MAX_PHOTOS} photos.`);
      return;
    }

    setBusy(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("Session expirée. Veuillez vous reconnecter.");
      setBusy(false);
      return;
    }

    const ext = EXT[file.type];
    const photoId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}`;
    // Dossier == identité du membre : la RLS storage l'exige.
    const path = `${user.id}/${photoId}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (upErr) {
      console.error("[profile-photos] upload échoué:", upErr.message);
      setError("Téléversement impossible pour le moment. Réessayez.");
      setBusy(false);
      return;
    }

    const isFirst = photos.length === 0;
    const { error: insErr } = await supabase.from("photos").insert({
      profile_id: user.id, // jamais l'id d'un autre membre
      storage_path: path,
      is_primary: isFirst,
      mime_type: file.type,
      size_bytes: file.size,
    });
    if (insErr) {
      // Rollback de l'objet Storage pour éviter un orphelin.
      await supabase.storage.from(BUCKET).remove([path]);
      console.error("[profile-photos] insertion échouée:", insErr.message);
      setError("Enregistrement impossible pour le moment. Réessayez.");
      setBusy(false);
      return;
    }

    setSuccess("Photo ajoutée.");
    await reload();
    setBusy(false);
  }

  async function handleSetPrimary(item: PhotoItem) {
    if (busy || item.row.is_primary) return;
    setBusy(true);
    setError(null);
    setSuccess(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("Session expirée. Veuillez vous reconnecter.");
      setBusy(false);
      return;
    }

    // 1) Retirer l'ancienne principale (filtré sur le membre connecté).
    const { error: clearErr } = await supabase
      .from("photos")
      .update({ is_primary: false })
      .eq("profile_id", user.id)
      .eq("is_primary", true);
    if (clearErr) {
      console.error("[profile-photos] reset principale échoué:", clearErr.message);
      setError("Mise à jour impossible pour le moment. Réessayez.");
      setBusy(false);
      return;
    }

    // 2) Définir la nouvelle principale (filtré sur le membre connecté).
    const { error: setErr } = await supabase
      .from("photos")
      .update({ is_primary: true })
      .eq("id", item.row.id)
      .eq("profile_id", user.id);
    if (setErr) {
      console.error("[profile-photos] set principale échoué:", setErr.message);
      setError("Mise à jour impossible pour le moment. Réessayez.");
      setBusy(false);
      return;
    }

    setSuccess("Photo principale mise à jour.");
    await reload();
    setBusy(false);
  }

  async function handleDelete(item: PhotoItem) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setSuccess(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("Session expirée. Veuillez vous reconnecter.");
      setBusy(false);
      return;
    }

    // Objet Storage d'abord, puis ligne DB (filtrée sur le membre connecté).
    const { error: rmErr } = await supabase.storage
      .from(BUCKET)
      .remove([item.row.storage_path]);
    if (rmErr) {
      console.error("[profile-photos] suppression storage échouée:", rmErr.message);
      setError("Suppression impossible pour le moment. Réessayez.");
      setBusy(false);
      return;
    }

    const { error: delErr } = await supabase
      .from("photos")
      .delete()
      .eq("id", item.row.id)
      .eq("profile_id", user.id);
    if (delErr) {
      console.error("[profile-photos] suppression DB échouée:", delErr.message);
      setError("Suppression incomplète. Réessayez.");
      setBusy(false);
      return;
    }

    setSuccess("Photo supprimée.");
    await reload();
    setBusy(false);
  }

  return (
    <section
      className={cn(
        "flex flex-col gap-5",
        !bare && "glass rounded-3xl p-6 shadow-card sm:p-8",
      )}
    >
      {!bare ? (
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-champagne-400/20 text-choco-600">
            <Camera size={20} />
          </span>
          <div className="flex-1">
            <h2 className="font-serif text-xl font-semibold text-choco-700">
              Photos de profil
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-ink-700/75">
              Vos photos restent privées dans cette étape. Elles serviront plus
              tard à préparer l’affichage progressif de votre profil matrimonial.
            </p>
          </div>
        </div>
      ) : null}

      {/* Réglage de confidentialité (informatif) */}
      <div className="flex items-start gap-2.5 rounded-2xl border border-champagne-500/30 bg-cream-100/40 p-4">
        <ShieldCheck size={16} className="mt-0.5 shrink-0 text-choco-600" />
        <p className="text-sm text-ink-700/75">
          Photos floutées par défaut :{" "}
          <span className="font-medium text-ink-800">
            {blurPhotos === null
              ? "—"
              : blurPhotos
                ? "activé"
                : "désactivé"}
          </span>
          . Modifiable dans le formulaire ci-dessus. L’affichage aux autres
          membres viendra plus tard, progressivement.
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
      {success ? (
        <div
          role="status"
          className="rounded-2xl border border-emerald-600/30 bg-emerald-600/10 px-4 py-3 text-sm text-emerald-800"
        >
          {success}
        </div>
      ) : null}

      {/* Zone d'ajout */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleFileChange}
            disabled={busy}
          />
          <button
            type="button"
            onClick={triggerFilePicker}
            disabled={busy || photos.length >= MAX_PHOTOS}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-choco-600 to-choco-800 px-5 py-2.5 text-sm font-semibold text-cream-50 shadow-[0_12px_30px_-12px_rgba(43,26,18,0.8)] ring-1 ring-inset ring-champagne-400/30 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
          >
            {busy ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <ImagePlus size={16} />
            )}
            Ajouter une photo
          </button>
          <span className="text-xs text-ink-700/55">
            JPEG, PNG ou WebP — 2 Mo maximum · {photos.length}/{MAX_PHOTOS}
          </span>
        </div>
      </div>

      {/* Grille / états */}
      {status === "loading" ? (
        <div className="flex items-center gap-2 text-sm text-ink-700/60">
          <Loader2 size={16} className="animate-spin" />
          Chargement de vos photos…
        </div>
      ) : status === "error" ? (
        <p className="text-sm text-ink-700/60">
          Vos photos sont momentanément indisponibles. Réessayez plus tard.
        </p>
      ) : photos.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-champagne-500/40 bg-cream-100/30 p-6 text-center text-sm text-ink-700/60">
          Aucune photo ajoutée pour le moment.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {photos.map((item) => (
            <li
              key={item.row.id}
              className="flex flex-col overflow-hidden rounded-2xl border border-champagne-500/30 bg-cream-50/60"
            >
              <div className="relative aspect-square bg-cream-100/50">
                {item.signedUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.signedUrl}
                    alt="Votre photo de profil"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-ink-700/40">
                    <Camera size={24} />
                  </div>
                )}
                {item.row.is_primary ? (
                  <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-choco-700/85 px-2.5 py-1 text-xs font-medium text-cream-50">
                    <Star size={12} />
                    Photo principale
                  </span>
                ) : null}
              </div>

              <div className="flex flex-col gap-2 p-3">
                {!item.row.is_primary ? (
                  <button
                    type="button"
                    onClick={() => handleSetPrimary(item)}
                    disabled={busy}
                    className="inline-flex items-center justify-center gap-1.5 rounded-full border border-champagne-500/40 bg-cream-50/60 px-3 py-1.5 text-xs font-medium text-choco-700 transition-colors hover:bg-champagne-400/15 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Star size={13} />
                    Définir comme principale
                  </button>
                ) : (
                  <span className="inline-flex items-center justify-center gap-1.5 rounded-full bg-emerald-600/10 px-3 py-1.5 text-xs font-medium text-emerald-700">
                    <Check size={13} />
                    Principale
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => handleDelete(item)}
                  disabled={busy}
                  className="inline-flex items-center justify-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/5 px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Trash2 size={13} />
                  Supprimer
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
