/**
 * Contenu des notifications membre liées à la vérification du profil (L3-C).
 * Fonction pure (importable client/serveur) ; aucun accès DB ici.
 */

export type VerificationNotificationStatus = "approved" | "rejected" | "paused";

const TEXTS: Record<
  VerificationNotificationStatus,
  { type: string; title: string; body: string }
> = {
  approved: {
    type: "verification_approved",
    title: "Profil approuvé",
    body: "Votre profil a été approuvé. Vous pouvez maintenant poursuivre votre parcours sur Mariage à Tout Prix.",
  },
  rejected: {
    type: "verification_rejected",
    title: "Profil à corriger",
    body: "Votre profil doit être corrigé avant validation. Consultez le motif indiqué puis mettez votre profil à jour.",
  },
  paused: {
    type: "verification_paused",
    title: "Vérification en pause",
    body: "Votre vérification est en pause. Notre équipe effectue une revue complémentaire ou attend un complément d’information.",
  },
};

export function buildVerificationNotification(
  status: VerificationNotificationStatus,
  motif?: string | null,
): { type: string; title: string; body: string } {
  const base = TEXTS[status];
  const m = (motif ?? "").trim();
  // Le motif (rejet / pause) est ajouté en fin de corps, sur une ligne dédiée.
  const body = m ? `${base.body}\nMotif : ${m}` : base.body;
  return { type: base.type, title: base.title, body };
}
