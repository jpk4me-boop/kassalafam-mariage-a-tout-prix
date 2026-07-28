import { Megaphone } from "lucide-react";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  ELIGIBILITY_MESSAGES,
  getProfilePromotionShareStatuses,
  listProfilePromotionShareLinks,
  type AdminProfilePromotionShareLinkItem,
  type AdminProfilePromotionShareStatus,
} from "@/lib/server/profile-promotion-share-links";
import {
  formatPromotionDate,
  PROMOTION_CHANNEL_LABELS,
  PROMOTION_LINK_STATUS_LABELS,
  promotionSummary,
} from "@/lib/admin/profile-promotion";
import { PromotionLinkForm } from "@/components/admin/promotion-link-form";
import { PromotionRevokeButton } from "@/components/admin/promotion-revoke-button";

/**
 * Section « Promotion du profil » de la fiche membre (PR #82) — rendue côté
 * serveur. Réutilise exclusivement les helpers serveur existants (statuts
 * groupés, historique) ; la photo affichée est EXACTEMENT celle autorisée par
 * le consentement (photo_id du consentement, jamais la photo principale par
 * défaut), signée côté serveur avec un TTL court. `storage_path`, hash et
 * jetons complets n'atteignent jamais le navigateur.
 */

const BUCKET = "profile-photos";
const SIGNED_URL_TTL = 300; // 5 min
const MAX_PHOTO_BYTES = 3145728;
const ALLOWED_PHOTO_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const SUMMARY_TONE_CLASSES = {
  ok: "border-emerald-600/25 bg-emerald-600/5 text-emerald-700",
  muted: "border-champagne-500/30 bg-champagne-400/10 text-ink-700/60",
  warn: "border-amber-600/30 bg-amber-500/10 text-amber-800",
} as const;

const LINK_STATUS_CLASSES: Record<string, string> = {
  active: "bg-emerald-600/10 text-emerald-700",
  expired: "bg-champagne-400/15 text-ink-700/65",
  revoked: "bg-red-500/10 text-red-700",
  invalidated: "bg-amber-500/15 text-amber-800",
};

function FieldItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[11px] uppercase tracking-wide text-ink-700/45">
        {label}
      </dt>
      <dd className="text-sm text-ink-800">{value ?? "—"}</dd>
    </div>
  );
}

/**
 * Charge et signe la photo EXACTE du consentement. Best-effort : toute
 * invalidité renvoie null sans faire échouer la section.
 */
async function loadConsentPhotoUrl(
  profileId: string,
  photoId: string | null,
): Promise<string | null> {
  if (!photoId) return null;
  try {
    const admin = createAdminClient();
    const { data: photo } = await admin
      .from("photos")
      .select("storage_path, mime_type, size_bytes")
      .eq("id", photoId)
      .eq("profile_id", profileId)
      .maybeSingle();

    if (
      !photo?.storage_path ||
      !photo.storage_path.startsWith(`${profileId}/`) ||
      !photo.mime_type ||
      !ALLOWED_PHOTO_MIME_TYPES.has(photo.mime_type) ||
      photo.size_bytes == null ||
      photo.size_bytes < 1 ||
      photo.size_bytes > MAX_PHOTO_BYTES
    ) {
      return null;
    }

    const { data: signed } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(photo.storage_path, SIGNED_URL_TTL);
    return signed?.signedUrl ?? null;
  } catch {
    return null;
  }
}

function HistoryRow({ link }: { link: AdminProfilePromotionShareLinkItem }) {
  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <code className="rounded bg-champagne-400/15 px-1.5 py-0.5 text-xs text-choco-700">
            {link.token_prefix}…
          </code>
          <span className="font-medium text-choco-700">
            {PROMOTION_CHANNEL_LABELS[link.channel]}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
              LINK_STATUS_CLASSES[link.status] ?? LINK_STATUS_CLASSES.expired
            }`}
          >
            {PROMOTION_LINK_STATUS_LABELS[link.status] ?? link.status}
          </span>
        </p>
        <p className="mt-1 text-[11px] text-ink-700/60">
          Créé le {formatPromotionDate(link.created_at)} · expire le{" "}
          {formatPromotionDate(link.expires_at)}
          {link.revoked_at
            ? ` · révoqué le ${formatPromotionDate(link.revoked_at)}`
            : ""}
        </p>
        {link.revocation_reason?.trim() ? (
          <p className="mt-0.5 text-[11px] italic text-ink-700/55">
            {link.revocation_reason}
          </p>
        ) : null}
      </div>
      {link.status === "active" ? (
        <PromotionRevokeButton
          linkId={link.link_id}
          tokenPrefix={link.token_prefix}
        />
      ) : null}
    </li>
  );
}

export async function MemberPromotionSection({
  profileId,
}: {
  profileId: string;
}) {
  let status: AdminProfilePromotionShareStatus | null = null;
  let links: AdminProfilePromotionShareLinkItem[] = [];
  let loadError: string | null = null;

  const statusResult = await getProfilePromotionShareStatuses({
    profileIds: [profileId],
  });
  if (statusResult.ok) {
    status = statusResult.data[0] ?? null;
  } else {
    loadError = statusResult.error;
  }

  const linksResult = await listProfilePromotionShareLinks({ profileId });
  if (linksResult.ok) {
    links = linksResult.data;
  } else if (!loadError) {
    loadError = linksResult.error;
  }

  const summary = status ? promotionSummary(status) : null;
  const eligible = status?.eligibility_reason === "eligible";
  const photoUrl = status
    ? await loadConsentPhotoUrl(profileId, status.photo_id)
    : null;

  return (
    <section className="rounded-2xl border border-champagne-500/25 bg-cream-50/60 p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="inline-flex items-center gap-2 font-serif text-lg font-semibold text-choco-700">
          <Megaphone size={17} className="text-champagne-600" aria-hidden />
          Promotion du profil
        </h2>
        {summary ? (
          <span
            className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium ${SUMMARY_TONE_CLASSES[summary.tone]}`}
          >
            {summary.label}
          </span>
        ) : null}
      </div>

      {loadError ? (
        <p className="rounded-xl border border-amber-600/25 bg-amber-500/5 px-4 py-3 text-sm text-amber-800">
          Lecture du consentement promotionnel indisponible : {loadError}
        </p>
      ) : status ? (
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-4 sm:flex-row">
            {photoUrl ? (
              <figure className="shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photoUrl}
                  alt="Photo autorisée pour la promotion"
                  className="h-28 w-28 rounded-2xl object-cover ring-1 ring-champagne-500/30"
                />
                <figcaption className="mt-1 text-center text-[10px] text-ink-700/50">
                  Photo autorisée
                </figcaption>
              </figure>
            ) : status.photo_id ? (
              <p className="shrink-0 self-start rounded-xl border border-champagne-500/25 bg-cream-100/40 px-3 py-2 text-xs text-ink-700/55">
                Photo autorisée indisponible.
              </p>
            ) : null}

            <dl className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <FieldItem
                label="Consentement"
                value={
                  status.consent_id
                    ? "Actif (non retiré)"
                    : "Aucun consentement"
                }
              />
              <FieldItem
                label="Consenti le"
                value={formatPromotionDate(status.consented_at)}
              />
              <FieldItem
                label="Expire le"
                value={formatPromotionDate(status.consent_expires_at)}
              />
              <FieldItem
                label="Réseaux autorisés"
                value={
                  status.channels.length > 0
                    ? status.channels
                        .map((c) => PROMOTION_CHANNEL_LABELS[c])
                        .join(", ")
                    : "—"
                }
              />
              <FieldItem
                label="Éligibilité"
                value={
                  eligible ? (
                    <span className="font-medium text-emerald-700">
                      Partageable
                    </span>
                  ) : (
                    <span className="text-amber-800">
                      {ELIGIBILITY_MESSAGES[status.eligibility_reason] ??
                        "Ce profil ne remplit pas les conditions de partage."}
                    </span>
                  )
                }
              />
              <FieldItem
                label="Liens actifs"
                value={String(status.active_link_count)}
              />
            </dl>
          </div>

          <div className="border-t border-champagne-500/15 pt-4">
            {eligible && status.channels.length > 0 ? (
              <PromotionLinkForm
                profileId={profileId}
                channels={status.channels}
                consentExpiresAt={status.consent_expires_at}
              />
            ) : (
              <p className="text-sm text-ink-700/60">
                La création de lien est désactivée tant que le consentement et
                l’éligibilité ne sont pas réunis. Le membre garde le contrôle :
                aucun partage n’est possible sans son autorisation active.
              </p>
            )}
          </div>

          <div className="border-t border-champagne-500/15 pt-4">
            <h3 className="text-sm font-semibold text-choco-700">
              Historique des liens
            </h3>
            {links.length === 0 ? (
              <p className="mt-2 text-sm text-ink-700/55">
                Aucun lien promotionnel créé pour ce membre.
              </p>
            ) : (
              <ul className="mt-1 flex flex-col divide-y divide-champagne-500/15">
                {links.map((link) => (
                  <HistoryRow key={link.link_id} link={link} />
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : (
        <p className="text-sm text-ink-700/55">
          Aucune donnée promotionnelle pour ce membre.
        </p>
      )}
    </section>
  );
}
