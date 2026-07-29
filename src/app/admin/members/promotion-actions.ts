"use server";

import { revalidatePath } from "next/cache";

import {
  createProfilePromotionShareLink,
  revokeProfilePromotionShareLink,
} from "@/lib/server/profile-promotion-share-links";
import {
  isPromotionChannel,
  isPromotionDuration,
  shareLinkExpiryIso,
  promotionUrlFromToken,
  type PromotionChannel,
} from "@/lib/admin/profile-promotion";

/**
 * Server Actions « Promotion du profil » (PR #82) — SERVEUR UNIQUEMENT.
 *
 * Modèle de sécurité :
 *  - l'identité admin est résolue DANS les helpers serveur réutilisés
 *    (`resolveAdminActor` via `createProfilePromotionShareLink` /
 *    `revokeProfilePromotionShareLink`) : l'acteur ne vient JAMAIS du
 *    navigateur ;
 *  - le navigateur n'envoie ni photo_id ni consent_id : la RPC les dérive du
 *    consentement actif du membre ;
 *  - l'expiration est recalculée côté serveur à partir d'une durée fermée ;
 *  - le jeton en clair n'existe que dans la réponse de cette action — jamais
 *    journalisé, jamais persisté côté client.
 */

export type CreatePromotionLinkState =
  | {
      ok: true;
      /** URL publique complète, construite sur le domaine canonique. */
      url: string;
      channel: PromotionChannel;
      expiresAt: string;
    }
  | { ok: false; error: string };

export async function createPromotionLinkAction(input: {
  profileId: string;
  channel: string;
  durationMinutes: number;
}): Promise<CreatePromotionLinkState> {
  // Validation d'entrée fermée ; la RPC revalide toutes les contraintes
  // (consentement actif, canal autorisé, éligibilité, bornes de durée).
  if (!isPromotionChannel(input.channel)) {
    return { ok: false, error: "Ce réseau social n’est pas pris en charge." };
  }
  if (!isPromotionDuration(input.durationMinutes)) {
    return { ok: false, error: "Cette durée n’est pas proposée." };
  }

  const result = await createProfilePromotionShareLink({
    profileId: input.profileId,
    channel: input.channel,
    expiresAt: shareLinkExpiryIso(new Date(), input.durationMinutes),
  });

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  // Rafraîchit l'historique et les compteurs ; la réponse — seule porteuse du
  // jeton — reste dans l'état du formulaire côté client.
  revalidatePath(`/admin/members/${input.profileId}`);
  revalidatePath("/admin/members");

  return {
    ok: true,
    url: promotionUrlFromToken(result.data.token),
    channel: result.data.channel,
    expiresAt: result.data.expires_at,
  };
}

export type RevokePromotionLinkState =
  | { ok: true; alreadyRevoked: boolean }
  | { ok: false; error: string };

const DEFAULT_REVOCATION_REASON =
  "Révocation manuelle depuis le back-office KASSALAFAM.";

export async function revokePromotionLinkAction(input: {
  linkId: string;
  reason?: string | null;
}): Promise<RevokePromotionLinkState> {
  const reason = input.reason?.trim() || DEFAULT_REVOCATION_REASON;
  if (reason.length > 500) {
    return { ok: false, error: "Le motif ne peut pas dépasser 500 caractères." };
  }

  // L'UUID du lien est validé par le helper (isUuid) ; l'acteur vient de la
  // session admin résolue côté serveur, jamais du client. La fiche est
  // rafraîchie par `router.refresh()` côté client après succès.
  const result = await revokeProfilePromotionShareLink({
    linkId: input.linkId,
    reason,
  });

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  revalidatePath("/admin/members");

  return { ok: true, alreadyRevoked: result.data.alreadyRevoked };
}
