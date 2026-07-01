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
  blur_photos: boolean;
  is_premium: boolean;
  // Préférence volontaire d'espace de découverte (L3C-C). NULL = aucun choix.
  // Privée : jamais exposée aux autres membres dans cette phase.
  discovery_universe: DiscoveryUniverse | null;
  // Vérification admin — LECTURE SEULE côté membre.
  // Protégée en base par le trigger trg_profiles_guard_verification :
  // un membre ne peut jamais écrire ces champs. Ne jamais les inclure
  // dans un upsert côté front.
  verification_status: ProfileVerificationStatus;
  verification_reviewed_at: string | null;
  verification_reviewed_by: string | null;
  verification_rejection_reason: string | null;
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
  blur_photos?: boolean;
  is_premium?: boolean;
  discovery_universe?: DiscoveryUniverse | null;
  // Réservés au back-office (service_role serveur). Le front membre ne doit
  // JAMAIS renseigner ces champs : ils sont rejetés par le trigger de garde.
  verification_status?: ProfileVerificationStatus;
  verification_reviewed_at?: string | null;
  verification_reviewed_by?: string | null;
  verification_rejection_reason?: string | null;
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
    };
    Enums: {
      gender: Gender;
      match_status: MatchStatus;
      profile_verification_status: ProfileVerificationStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}
