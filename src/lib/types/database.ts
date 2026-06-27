/**
 * Types de la base de données KASSALAFAM — schéma MVP matrimonial.
 *
 * Tenus à la main pour le socle L2 (profiles, photos, matches, messages).
 * Ils peuvent être régénérés ultérieurement via la CLI Supabase
 * (`supabase gen types typescript`) une fois la migration appliquée.
 */

export type Gender = "homme" | "femme";
export type MatchStatus = "pending" | "accepted" | "rejected";

export type ProfileRow = {
  id: string;
  first_name: string | null;
  gender: Gender | null;
  birth_date: string | null;
  country: string | null;
  city: string | null;
  intention: string;
  bio: string | null;
  blur_photos: boolean;
  is_premium: boolean;
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
  intention?: string;
  bio?: string | null;
  blur_photos?: boolean;
  is_premium?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type ProfileUpdate = Partial<Omit<ProfileInsert, "id">>;

export type PhotoRow = {
  id: string;
  profile_id: string;
  storage_path: string;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
}

export type MatchRow = {
  id: string;
  user_a: string;
  user_b: string;
  status: MatchStatus;
  created_at: string;
  updated_at: string;
}

export type MessageRow = {
  id: string;
  match_id: string;
  sender_id: string;
  content: string;
  read_at: string | null;
  created_at: string;
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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      gender: Gender;
      match_status: MatchStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}
