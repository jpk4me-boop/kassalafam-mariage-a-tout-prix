/**
 * Types de la base de données KASSALAFAM — schéma MVP matrimonial.
 *
 * Tenus à la main pour le socle L2 (profiles, photos, matches, messages).
 * Ils peuvent être régénérés ultérieurement via la CLI Supabase
 * (`supabase gen types typescript`) une fois la migration appliquée.
 */

export type Gender = "homme" | "femme";
export type MaritalStatus = "celibataire" | "divorce" | "veuf" | "separe";
/**
 * Préférence VOLONTAIRE d'espace de découverte choisie par le membre (L3C-C).
 * Ce n'est PAS une religion déclarée publiquement : valeur privée, modifiable,
 * jamais déduite automatiquement ni exposée aux autres membres.
 */
export type DiscoveryUniverse =
  | "christian_marriage"
  | "islamic_marriage"
  | "open_marriage";
export type MatchStatus = "pending" | "accepted" | "rejected";
export type ProfileVerificationStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "paused";

/**
 * L3F-C3A — Sanction de compte, INDÉPENDANTE de la vérification de profil.
 * `active` : compte normal ; `suspended` : interactions restreintes (les effets
 * d'enforcement — découverte, intérêts, messagerie, photos — arrivent en
 * C3B–C3D). Écrit EXCLUSIVEMENT par la RPC `admin_set_account_status`
 * (service_role) ; jamais par le membre (garde `guard_profiles_admin_fields`).
 */
export type AccountStatus = "active" | "suspended";

/**
 * Onboarding « Comment nous as-tu découverts ? » — canal d'acquisition déclaré
 * par le membre, à valeurs CONTRÔLÉES (doivent correspondre exactement au CHECK
 * `profiles_acquisition_source_check` en base). Enregistré UNE SEULE FOIS
 * (write-once) via la RPC [[record_acquisition_source]] : la première réponse est
 * immuable, pour la fiabilité des futures statistiques d'acquisition.
 */
export type AcquisitionSource =
  | "tiktok"
  | "instagram"
  | "facebook"
  | "youtube"
  | "whatsapp_recommendation"
  | "google"
  | "other";

/**
 * Résultat de la RPC `public.record_acquisition_source` :
 *   - `recorded`         : première réponse enregistrée à l'instant ;
 *   - `already_recorded` : une réponse DIFFÉRENTE existait déjà (conservée) ;
 *   - `unchanged`        : réponse identique déjà enregistrée (idempotent).
 */
export type RecordAcquisitionSourceResult =
  | "recorded"
  | "already_recorded"
  | "unchanged";

/**
 * Champs matrimoniaux étendus du wizard d'onboarding (migration
 * 20260707090000_add_profile_extended_matrimonial_fields). Colonnes `text`
 * contraintes par CHECK côté base (PAS des enums PostgreSQL) : ces unions
 * TypeScript DOIVENT rester alignées sur les valeurs autorisées par la
 * migration. Toutes librement éditables par le membre (upsert direct de sa
 * propre ligne), contrairement aux champs write-once / admin.
 */
export type EducationLevel =
  | "secondary"
  | "high_school"
  | "bachelor"
  | "master"
  | "doctorate"
  | "vocational"
  | "other";

/** marriage_goals : 2 à 3 valeurs UNIQUES de cette liste (contrainte base). */
export type MarriageGoal =
  | "build_family"
  | "stable_home"
  | "life_partner"
  | "grow_together"
  | "mutual_support"
  | "serenity";

/** desired_partner_traits : 2 à 3 valeurs UNIQUES de cette liste (contrainte base). */
export type PartnerTrait =
  | "kindness"
  | "sincerity"
  | "ambition"
  | "family_oriented"
  | "cultured"
  | "sense_of_humor"
  | "calm_mature";

export type PolygamyPreference = "yes" | "no" | "discuss";

export type ChildrenIntent =
  | "wants_children"
  | "does_not_want_children"
  | "has_children"
  | "discuss";

export type ProfileRow = {
  id: string;
  first_name: string | null;
  gender: Gender | null;
  birth_date: string | null;
  country: string | null;
  city: string | null;
  marital_status: MaritalStatus | null;
  intention: string;
  bio: string | null;
  partner_expectations: string | null;
  // Champs matrimoniaux étendus (wizard d'onboarding) — LIBREMENT éditables par
  // le membre via upsert. NULL pour les profils historiques. Valeurs contrôlées
  // par CHECK en base (voir 20260707090000_add_profile_extended_matrimonial_fields).
  profession: string | null;
  education_level: EducationLevel | null;
  height_cm: number | null;
  origin_country: string | null;
  region: string | null;
  marriage_goals: MarriageGoal[] | null;
  desired_partner_traits: PartnerTrait[] | null;
  polygamy_preference: PolygamyPreference | null;
  children_intent: ChildrenIntent | null;
  blur_photos: boolean;
  is_premium: boolean;
  // Préférence volontaire d'espace de découverte (L3C-C). NULL = aucun choix.
  // Privée : jamais exposée aux autres membres dans cette phase.
  discovery_universe: DiscoveryUniverse | null;
  // Onboarding « Comment nous as-tu découverts ? » — LECTURE SEULE côté membre.
  // Write-once : posés une seule fois par la RPC record_acquisition_source, puis
  // IMMUABLES. Protégés en base par le trigger trg_profiles_guard_acquisition_fields
  // (toute écriture directe est rejetée). NULL tant qu'aucune réponse ; `*_other`
  // n'est renseigné QUE si acquisition_source === "other" ; `*_recorded_at` sert
  // de témoin « déjà répondu » (renseigné ⇔ acquisition_source non NULL).
  // Volontairement ABSENTS de ProfileInsert / ProfileUpdate : le front ne peut
  // (ni ne doit) les écrire via un upsert — la base rejetterait l'opération.
  acquisition_source: AcquisitionSource | null;
  acquisition_source_other: string | null;
  acquisition_source_recorded_at: string | null;
  // Fin EXPLICITE du parcours d'onboarding — LECTURE SEULE côté membre.
  // Write-once : posé une seule fois par la RPC complete_member_onboarding(),
  // puis IMMUABLE (garde trg_profiles_guard_onboarding_completion : toute
  // écriture directe est rejetée). NULL = parcours initial non finalisé.
  // Volontairement ABSENT de ProfileInsert / ProfileUpdate.
  onboarding_completed_at: string | null;
  // Vérification admin — LECTURE SEULE côté membre.
  // Protégée en base par le trigger trg_profiles_guard_verification :
  // un membre ne peut jamais écrire ces champs. Ne jamais les inclure
  // dans un upsert côté front.
  verification_status: ProfileVerificationStatus;
  verification_reviewed_at: string | null;
  verification_reviewed_by: string | null;
  verification_rejection_reason: string | null;
  // L3F-C3A — Sanction de compte. LECTURE SEULE côté membre (protégée en base
  // par la garde trg_profiles_guard_admin_fields, INSERT + UPDATE). Ne jamais
  // les inclure dans un upsert côté front.
  account_status: AccountStatus;
  suspended_at: string | null;
  suspended_by: string | null;
  suspension_reason: string | null;
  created_at: string;
  updated_at: string;
}

export type ProfileInsert = {
  id: string;
  first_name?: string | null;
  gender?: Gender | null;
  birth_date?: string | null;
  country?: string | null;
  city?: string | null;
  marital_status?: MaritalStatus | null;
  intention?: string;
  bio?: string | null;
  partner_expectations?: string | null;
  // Champs matrimoniaux étendus (wizard d'onboarding) — écrivables par le membre.
  profession?: string | null;
  education_level?: EducationLevel | null;
  height_cm?: number | null;
  origin_country?: string | null;
  region?: string | null;
  marriage_goals?: MarriageGoal[] | null;
  desired_partner_traits?: PartnerTrait[] | null;
  polygamy_preference?: PolygamyPreference | null;
  children_intent?: ChildrenIntent | null;
  blur_photos?: boolean;
  is_premium?: boolean;
  discovery_universe?: DiscoveryUniverse | null;
  // NB : acquisition_source / _other / _recorded_at sont VOLONTAIREMENT absents
  // de Insert (et donc de Update). Ils sont write-once via la RPC
  // record_acquisition_source et rejetés en écriture directe par un trigger de
  // garde en base. Les inclure ici laisserait croire qu'un upsert peut les poser.
  // Réservés au back-office (service_role serveur). Le front membre ne doit
  // JAMAIS renseigner ces champs : ils sont rejetés par le trigger de garde
  // (verification_* ET account_* — L3F-C3A, INSERT + UPDATE).
  verification_status?: ProfileVerificationStatus;
  verification_reviewed_at?: string | null;
  verification_reviewed_by?: string | null;
  verification_rejection_reason?: string | null;
  account_status?: AccountStatus;
  suspended_at?: string | null;
  suspended_by?: string | null;
  suspension_reason?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type ProfileUpdate = Partial<Omit<ProfileInsert, "id">>;

export type PhotoRow = {
  id: string;
  profile_id: string;
  storage_path: string;
  is_primary: boolean;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
  updated_at: string;
}

/**
 * Candidat de découverte (L3D-B PR1) — projection SÛRE renvoyée par la RPC
 * `public.discover_candidates`. Ne contient JAMAIS birth_date (seul `age`
 * calculé est exposé), storage_path, verification_*, email, bio ni
 * partner_expectations. Voir la migration 20260630020000_discover_candidates_rpc.
 */
export type DiscoverCandidate = {
  id: string;
  first_name: string | null;
  age: number | null;
  city: string | null;
  country: string | null;
  marital_status: MaritalStatus | null;
  intention: string;
  discovery_universe: DiscoveryUniverse | null;
  has_photo: boolean;
  is_blurred: boolean;
};

/**
 * Candidat enrichi côté SERVEUR d'une URL signée éphémère de sa photo
 * principale (TTL court). `signedUrl` est `null` si le candidat n'a pas de
 * photo (`has_photo=false`) ou a choisi de flouter (`is_blurred=true`).
 * `storage_path` n'est JAMAIS inclus dans cette charge utile exposable.
 */
export type DiscoverCandidateWithPhoto = DiscoverCandidate & {
  signedUrl: string | null;
};

/**
 * Résultat de la RPC `public.express_interest` (L3D-B PR3) :
 *   - `created` : intérêt enregistré (viewer → cible, `pending`) ;
 *   - `already` : intérêt déjà exprimé par le viewer (ou paire `rejected`) ;
 *   - `matched` : intérêt mutuel (la cible avait déjà exprimé le sien → `accepted`).
 */
export type ExpressInterestResult = "created" | "already" | "matched";

export type MatchRow = {
  id: string;
  user_a: string;
  user_b: string;
  status: MatchStatus;
  created_at: string;
  updated_at: string;
}

/**
 * L3D-C — Nature d'une relation renvoyée par `public.list_my_relationships` :
 *   - `received` : intérêt entrant EN ATTENTE (l'autre m'a exprimé un intérêt) ;
 *   - `sent`     : intérêt sortant EN ATTENTE (je l'ai exprimé, sans réponse) ;
 *   - `matched`  : intérêt mutuel accepté.
 */
export type RelationshipKind = "received" | "sent" | "matched";

/**
 * Projection SÛRE d'une relation (L3D-C) renvoyée par `list_my_relationships`.
 * Décrit UNIQUEMENT l'autre membre via des champs non sensibles (jamais
 * birth_date — seul `age` calculé —, storage_path, verification_*, email, bio,
 * partner_expectations). `match_id` sert à répondre via `respond_to_interest`.
 */
export type RelationshipItem = {
  match_id: string;
  other_id: string;
  kind: RelationshipKind;
  status: MatchStatus;
  first_name: string | null;
  age: number | null;
  city: string | null;
  country: string | null;
  marital_status: MaritalStatus | null;
  intention: string;
  has_photo: boolean;
  is_blurred: boolean;
  // L3E-PR3 — aperçu messagerie (null / 0 pour les relations non 'matched').
  last_message_content: string | null;
  last_message_at: string | null;
  unread_count: number;
  // L3F-A — sécurité messagerie (colonnes ajoutées EN FIN, après les 15
  // historiques). `blocked_by_me` : true UNIQUEMENT si l'appelant a créé le
  // blocage (sert à décider l'affichage de « Débloquer »). Il n'existe
  // volontairement AUCUN champ « blocked_by_other ». `messaging_available` :
  // false dès qu'un blocage existe dans un sens OU l'autre — état NEUTRE qui ne
  // révèle jamais l'origine du blocage. L'historique reste toujours lisible.
  blocked_by_me: boolean;
  messaging_available: boolean;
};

/**
 * Relation enrichie côté SERVEUR d'une URL signée éphémère de la photo
 * principale de l'autre membre (même règle que la découverte : `signedUrl` est
 * `null` si pas de photo ou si l'autre a choisi de flouter). `storage_path`
 * n'est JAMAIS inclus dans cette charge utile exposable.
 */
export type RelationshipItemWithPhoto = RelationshipItem & {
  signedUrl: string | null;
};

/**
 * Résultat de la RPC `public.respond_to_interest` (L3D-C) : le statut résultant
 * du match. Idempotent côté UX — une 2e réponse renvoie l'état déjà figé.
 */
export type RespondInterestResult = "accepted" | "rejected";

/**
 * L3F-A — Motifs de signalement d'un message (`public.report_message`).
 * Valeurs techniques STRICTES : elles doivent correspondre exactement au CHECK
 * de `safety_reports.reason` en base. Les libellés français sont une couche UI.
 */
export type SafetyReportReason =
  | "harassment"
  | "sexual_content"
  | "scam"
  | "hate"
  | "threat"
  | "impersonation"
  | "spam"
  | "other";

/**
 * L3F-A / L3F-C1 — Cycle de vie d'un signalement (`safety_reports.status`).
 * Valeurs techniques STRICTES : elles correspondent exactement au CHECK
 * `safety_reports_status_valid` en base. Les libellés français sont une couche
 * UI (voir `src/lib/admin/safety-reports.ts`).
 */
export type SafetyReportStatus =
  | "open"
  | "reviewing"
  | "resolved"
  | "dismissed";

/**
 * L3F-C1 — Ligne de `public.safety_reports` telle que lue par le back-office
 * (client `service_role`, SERVEUR uniquement — la table a RLS activée sans
 * aucune policy et ses privilèges membres sont révoqués).
 *
 * Le contenu et la date du message signalé sont des SNAPSHOTS pris au moment du
 * signalement : ils restent lisibles même après suppression du message, du
 * match ou du profil (FK en ON DELETE SET NULL). Ne JAMAIS relire `messages`
 * en live pour reconstituer le contenu — le snapshot fait foi.
 */
export type SafetyReportRow = {
  id: string;
  reporter_id: string | null;
  reported_user_id: string | null;
  match_id: string | null;
  message_id: string | null;
  reason: SafetyReportReason;
  details: string | null;
  message_content_snapshot: string;
  message_created_at_snapshot: string;
  status: SafetyReportStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  resolution_note: string | null;
  created_at: string;
};

/**
 * L3F-C2A — Ligne du journal APPEND-ONLY `public.safety_report_actions` : une
 * entrée par transition de statut d'un signalement, écrite EXCLUSIVEMENT par la
 * fonction transactionnelle `admin_transition_safety_report` (service_role).
 *
 * `new_status` ne peut jamais être `open` (aucune réouverture au MVP).
 * `actor_id` (auth.users.id) peut devenir NULL si le compte admin est supprimé
 * (FK ON DELETE SET NULL) ; `actor_email_snapshot` conserve alors la trace de
 * l'acteur. La table est immuable : aucune UPDATE/DELETE possible.
 */
export type SafetyReportActionRow = {
  id: string;
  report_id: string;
  actor_id: string | null;
  actor_email_snapshot: string | null;
  previous_status: SafetyReportStatus;
  new_status: Exclude<SafetyReportStatus, "open">;
  note: string | null;
  created_at: string;
};

/**
 * L3F-C3A — Ligne du journal APPEND-ONLY `public.account_moderation_actions` :
 * une entrée par transition de compte (`active` ↔ `suspended`), écrite
 * EXCLUSIVEMENT par la RPC `admin_set_account_status` (service_role). DISTINCT
 * de [[safety_report_actions]] (cycle de vie des signalements).
 *
 * CONFIDENTIALITÉ : aucun email du membre sanctionné n'est stocké —
 * `profile_id_snapshot` (UUID) est la référence d'audit minimale et survit à la
 * suppression du profil (`profile_id` FK ON DELETE SET NULL). `actor_id`
 * (auth.users.id) peut devenir NULL si l'admin est supprimé ;
 * `actor_email_snapshot` conserve alors la trace. `report_id` lie éventuellement
 * la sanction à un signalement d'origine. Table immuable (trigger).
 */
export type AccountModerationActionRow = {
  id: string;
  profile_id: string | null;
  profile_id_snapshot: string;
  actor_id: string | null;
  actor_email_snapshot: string | null;
  report_id: string | null;
  previous_status: AccountStatus;
  new_status: AccountStatus;
  reason: string;
  created_at: string;
};

/**
 * L3G — Type d'action journalisée dans `public.admin_audit_log`. Pour l'instant
 * une seule valeur : les décisions de VÉRIFICATION de profil (approve / reject /
 * pause), seul historique administratif qui manquait. Les suspensions et le
 * traitement des signalements possèdent leurs propres journaux immuables
 * ([[account_moderation_actions]] / [[safety_report_actions]]) et ne sont PAS
 * redupliqués ici.
 */
export type AdminAuditActionType = "verification_set";

/**
 * L3G — Ligne du journal APPEND-ONLY `public.admin_audit_log`, écrite
 * EXCLUSIVEMENT par la RPC `admin_set_verification_status` (service_role).
 * Immuable (trigger). LECTURE SEULE côté back-office.
 *
 * `new_status` est un `ProfileVerificationStatus` pour l'action
 * `verification_set` (jamais `pending`). `target_profile_id` (FK) peut devenir
 * NULL si le profil est supprimé ; `target_profile_id_snapshot` conserve la
 * trace. `actor_id` peut devenir NULL si l'admin est supprimé ;
 * `actor_email_snapshot` conserve alors l'identité de l'acteur.
 */
export type AdminAuditLogRow = {
  id: string;
  action_type: AdminAuditActionType;
  actor_id: string | null;
  actor_email_snapshot: string | null;
  target_profile_id: string | null;
  target_profile_id_snapshot: string;
  previous_status: string | null;
  new_status: string | null;
  reason: string | null;
  created_at: string;
};

/**
 * Partage PR1 — Ligne de `public.profile_share_consents` : consentement du
 * membre au partage public limité de son profil. HISTORIQUE conservé : le
 * retrait renseigne `withdrawn_at`/`withdrawn_by` sans supprimer la ligne ;
 * au plus une ligne ACTIVE (`withdrawn_at IS NULL`) par profil. Écritures
 * EXCLUSIVEMENT via les RPC `grant_my_profile_share_consent` /
 * `withdraw_my_profile_share_consent` (texte et version définis côté serveur).
 * Le membre ne LIT que ses propres lignes (RLS select_own).
 */
export type ProfileShareConsentRow = {
  id: string;
  profile_id: string;
  policy_version: string;
  consent_text: string;
  consented_at: string;
  withdrawn_at: string | null;
  withdrawn_by: string | null;
  created_at: string;
};

/**
 * Partage PR1 — Résultat de la RPC `public.grant_my_profile_share_consent()` :
 * le consentement actif (créé à l'instant, ou réutilisé si déjà actif —
 * `was_already_active` distingue les deux cas, aucun doublon possible).
 */
export type GrantProfileShareConsentResult = {
  consent_id: string;
  policy_version: string;
  consented_at: string;
  was_already_active: boolean;
};

/**
 * L3G — Une ligne renvoyée par la RPC `public.admin_list_members` (service_role,
 * SERVEUR uniquement). Projection de MODÉRATION : champs strictement utiles +
 * agrégats calculés en base. Ne contient JAMAIS d'email (auth.users), de
 * storage_path, de bio ni de contenu privé. `total_count` est identique sur
 * toutes les lignes de la page (nombre total AVANT pagination).
 */
export type AdminMemberListItem = {
  id: string;
  first_name: string | null;
  /** Email `auth.users` du membre, joint STRICTEMENT côté serveur par la RPC
   *  `admin_list_members` (service_role). Rendu uniquement en contexte admin. */
  email: string | null;
  gender: Gender | null;
  birth_date: string | null;
  country: string | null;
  city: string | null;
  account_status: AccountStatus;
  verification_status: ProfileVerificationStatus;
  is_complete: boolean;
  has_photo: boolean;
  photos_count: number;
  interests_count: number;
  matches_count: number;
  reports_count: number;
  created_at: string;
  updated_at: string;
  total_count: number;
};

/**
 * L3G — Une ligne renvoyée par la RPC `public.admin_list_audit_events` : un
 * événement d'administration NORMALISÉ, issu de l'UNION des trois journaux
 * immuables (vérification / compte / signalement), paginé et filtré EN BASE.
 * `total_count` est identique sur toutes les lignes de la page.
 */
export type AdminAuditEventRow = {
  source: "verification" | "account" | "report";
  event_id: string;
  actor_email: string | null;
  target_profile_id: string | null;
  previous_status: string | null;
  new_status: string | null;
  note: string | null;
  created_at: string;
  total_count: number;
};

export type MessageRow = {
  id: string;
  match_id: string;
  sender_id: string;
  content: string;
  read_at: string | null;
  created_at: string;
}

export type MemberNotificationRow = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  verification_status: ProfileVerificationStatus | null;
  related_profile_id: string | null;
  read_at: string | null;
  created_at: string;
}

export type MemberNotificationInsert = {
  id?: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  verification_status?: ProfileVerificationStatus | null;
  related_profile_id?: string | null;
  read_at?: string | null;
  created_at?: string;
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: ProfileInsert;
        Update: ProfileUpdate;
        Relationships: [];
      };
      photos: {
        Row: PhotoRow;
        Insert: Omit<PhotoRow, "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<PhotoRow>;
        Relationships: [];
      };
      matches: {
        Row: MatchRow;
        Insert: Omit<MatchRow, "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<MatchRow>;
        Relationships: [];
      };
      messages: {
        Row: MessageRow;
        Insert: Omit<MessageRow, "id" | "created_at" | "read_at"> & {
          id?: string;
          read_at?: string | null;
          created_at?: string;
        };
        Update: Partial<MessageRow>;
        Relationships: [];
      };
      member_notifications: {
        Row: MemberNotificationRow;
        Insert: MemberNotificationInsert;
        Update: Partial<MemberNotificationInsert>;
        Relationships: [];
      };
      // L3F-C1 — LECTURE SEULE côté back-office (client service_role serveur).
      // Aucune écriture directe via ce client : les seules écritures légitimes
      // passent par les RPC SECURITY DEFINER (report_message). Insert/Update
      // sont volontairement `never` pour INTERDIRE STATIQUEMENT toute écriture
      // accidentelle (.insert()/.update()) via le client Supabase typé.
      safety_reports: {
        Row: SafetyReportRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      // L3F-C2A — journal append-only, LECTURE SEULE côté back-office
      // (service_role). Écriture uniquement via la RPC
      // admin_transition_safety_report ; jamais d'écriture directe via ce
      // client typé (d'où Insert/Update = never). Immuable en base (trigger).
      safety_report_actions: {
        Row: SafetyReportActionRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      // L3F-C3A — journal append-only de modération des comptes, LECTURE SEULE
      // côté back-office (service_role). Écriture uniquement via la RPC
      // admin_set_account_status ; jamais d'écriture directe via ce client typé
      // (d'où Insert/Update = never). Immuable en base (trigger).
      account_moderation_actions: {
        Row: AccountModerationActionRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      // L3G — journal append-only des décisions administratives non journalisées
      // ailleurs (vérification de profil). LECTURE SEULE côté back-office
      // (service_role). Écriture uniquement via la RPC
      // admin_set_verification_status ; jamais d'écriture directe via ce client
      // typé (d'où Insert/Update = never). Immuable en base (trigger).
      admin_audit_log: {
        Row: AdminAuditLogRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      // Partage PR1 — consentement au partage public limité. LECTURE SEULE via
      // ce client (RLS select_own) ; écritures uniquement via les RPC
      // grant/withdraw_my_profile_share_consent (d'où Insert/Update = never).
      profile_share_consents: {
        Row: ProfileShareConsentRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      // L3D-B PR1 — lecture sécurisée des candidats de découverte.
      discover_candidates: {
        Args: { p_universe: string; p_limit?: number; p_offset?: number };
        Returns: DiscoverCandidate[];
      };
      // L3D-B PR3 — expression d'un intérêt (écriture contrôlée dans matches).
      express_interest: {
        Args: { p_target: string; p_universe: string };
        Returns: ExpressInterestResult;
      };
      // L3D-C — réponse à un intérêt reçu (seule la cible, sur un match pending).
      respond_to_interest: {
        Args: { p_match: string; p_decision: string };
        Returns: RespondInterestResult;
      };
      // L3D-C — lecture curée des relations de l'appelant (reçus/envoyés/matches).
      list_my_relationships: {
        Args: Record<string, never>;
        Returns: RelationshipItem[];
      };
      // Onboarding — enregistrement WRITE-ONCE de la source d'acquisition du
      // membre authentifié. p_other requis ⇔ p_source === "other". N'écrase
      // jamais une première réponse. auth.uid() côté serveur ; aucun user_id
      // accepté du client. Retourne recorded | already_recorded | unchanged.
      record_acquisition_source: {
        Args: { p_source: string; p_other?: string | null };
        Returns: RecordAcquisitionSourceResult;
      };
      // Onboarding — FIN EXPLICITE du parcours. Revérifie côté serveur toutes
      // les exigences (acquisition, champs requis, photo principale) puis pose
      // onboarding_completed_at (write-once). Idempotente : un second appel
      // renvoie le premier horodatage. auth.uid() côté serveur uniquement.
      complete_member_onboarding: {
        Args: Record<string, never>;
        Returns: string;
      };
      // Partage PR1 — consentement au partage public limité du profil.
      // Idempotente : réutilise le consentement actif s'il existe. Texte et
      // version définis côté serveur ; auth.uid() uniquement, aucun paramètre.
      grant_my_profile_share_consent: {
        Args: Record<string, never>;
        Returns: GrantProfileShareConsentResult[];
      };
      // Partage PR1 — retrait du consentement actif (historique conservé).
      // Idempotente : retourne false si aucun consentement actif.
      withdraw_my_profile_share_consent: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      // L3E-PR1 — envoi contrôlé d'un message (seul chemin d'écriture ; match accepté).
      send_message: {
        Args: { p_match: string; p_content: string };
        Returns: MessageRow;
      };
      // L3E-PR1 — lecture ordonnée du fil d'un match accepté (garde can_message).
      get_conversation_messages: {
        Args: { p_match: string };
        Returns: MessageRow[];
      };
      // L3E-PR1 — marque comme lus les messages REÇUS d'un match accepté.
      // Retourne le nombre de messages marqués. Ne modifie jamais le contenu.
      mark_conversation_read: {
        Args: { p_match: string };
        Returns: number;
      };
      // L3F-A — bloque l'AUTRE participant d'un match. Le client ne transmet que
      // le matchId ; blocker_id (= auth.uid()) et l'autre membre sont déduits
      // côté serveur. Insert idempotent.
      block_match_participant: {
        Args: { p_match: string };
        Returns: undefined;
      };
      // L3F-A — retire UNIQUEMENT le blocage créé par l'appelant vers p_target.
      // Ne peut jamais supprimer le blocage créé par l'autre membre. Idempotent.
      unblock_profile: {
        Args: { p_target: string };
        Returns: undefined;
      };
      // L3F-A — signale un message REÇU. Le serveur vérifie toutes les
      // appartenances et déduit reporter_id / reported_user_id / match_id ; le
      // client ne transmet QUE p_message, p_reason et p_details facultatif.
      // Retourne l'id du signalement (idempotent : même id si déjà signalé).
      report_message: {
        Args: { p_message: string; p_reason: string; p_details?: string | null };
        Returns: string;
      };
      // L3F-C2A — transition transactionnelle d'un signalement (service_role
      // uniquement, jamais authenticated). p_expected_status porte l'état vu par
      // l'admin (garde de concurrence optimiste). L'email de l'acteur est relu
      // côté serveur depuis auth.users, jamais transmis par le client. Erreurs
      // métier stables : REPORT_NOT_FOUND, REPORT_STATUS_CONFLICT,
      // INVALID_REPORT_TRANSITION, REPORT_ALREADY_FINAL, NOTE_REQUIRED,
      // NOTE_LENGTH_INVALID, ACTOR_NOT_FOUND.
      admin_transition_safety_report: {
        Args: {
          p_report_id: string;
          p_expected_status: string;
          p_new_status: string;
          p_note: string | null;
          p_actor_id: string;
        };
        Returns: SafetyReportRow;
      };
      // L3F-C3A — suspension/réactivation transactionnelle d'un compte
      // (service_role uniquement, jamais authenticated). p_expected_status porte
      // l'état vu par l'admin (concurrence optimiste). p_actor_id vient de
      // requireAdmin() côté serveur ; son email est relu depuis auth.users.
      // p_report_id (option) doit viser p_profile_id. Erreurs métier stables :
      // PROFILE_NOT_FOUND, ACCOUNT_STATUS_CONFLICT, INVALID_ACCOUNT_STATUS,
      // INVALID_ACCOUNT_TRANSITION, REASON_REQUIRED, REASON_LENGTH_INVALID,
      // ACTOR_NOT_FOUND, REPORT_NOT_FOUND, REPORT_PROFILE_MISMATCH.
      admin_set_account_status: {
        Args: {
          p_profile_id: string;
          p_expected_status: string;
          p_new_status: string;
          p_reason: string;
          p_actor_id: string;
          p_report_id?: string | null;
        };
        Returns: ProfileRow;
      };
      // L3G — décision de vérification transactionnelle (service_role
      // uniquement). p_new_status ∈ approved|rejected|paused ; p_expected_status
      // porte l'état vu par l'admin (concurrence optimiste). Motif obligatoire
      // (5..500) pour rejected|paused, ignoré pour approved. Met à jour
      // verification_* ET écrit une ligne admin_audit_log dans la MÊME
      // transaction. L'email de l'acteur est relu depuis auth.users. Erreurs
      // métier stables : PROFILE_NOT_FOUND, VERIFICATION_STATUS_CONFLICT,
      // INVALID_VERIFICATION_STATUS, INVALID_VERIFICATION_TRANSITION,
      // REASON_REQUIRED, REASON_LENGTH_INVALID, ACTOR_NOT_FOUND.
      admin_set_verification_status: {
        Args: {
          p_profile_id: string;
          p_expected_status: string;
          p_new_status: string;
          p_reason: string | null;
          p_actor_id: string;
        };
        Returns: ProfileRow;
      };
      // L3G — lecture paginée des membres (service_role uniquement). Filtres,
      // tri et agrégats par membre calculés en base ; total_count via fenêtre.
      // Ne renvoie jamais d'email ni de contenu privé.
      admin_list_members: {
        Args: {
          p_search?: string | null;
          p_account_status?: string | null;
          p_verification_status?: string | null;
          p_completeness?: string | null;
          p_has_photo?: string | null;
          p_country?: string | null;
          p_city?: string | null;
          p_sort?: string | null;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: AdminMemberListItem[];
      };
      // L3G — journal d'administration unifié, paginé EN BASE (UNION ALL des 3
      // journaux immuables). service_role uniquement. Aucune duplication.
      admin_list_audit_events: {
        Args: {
          p_source?: string | null;
          p_actor?: string | null;
          p_target?: string | null;
          p_since?: string | null;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: AdminAuditEventRow[];
      };
      // L3G — emails distincts des acteurs (filtre « administrateur » du journal).
      admin_audit_actors: {
        Args: Record<string, never>;
        Returns: { actor_email: string }[];
      };
    };
    Enums: {
      gender: Gender;
      match_status: MatchStatus;
      profile_verification_status: ProfileVerificationStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}
