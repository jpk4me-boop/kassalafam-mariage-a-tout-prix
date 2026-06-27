-- =============================================================================
-- KASSALAFAM — MARIAGE À TOUT PRIX
-- Migration : schéma cœur MVP (profiles, photos, matches, messages)
-- Date      : 2026-06-27
--
-- Sécurité  : RLS activé sur toutes les tables, policies minimales et strictes.
--             Aucune donnée fictive. À ne PAS appliquer automatiquement en prod.
-- =============================================================================

-- Extensions nécessaires (gen_random_uuid).
create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Fonction utilitaire : maintien automatique de updated_at
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Types énumérés
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'gender') then
    create type public.gender as enum ('homme', 'femme');
  end if;
  if not exists (select 1 from pg_type where typname = 'match_status') then
    create type public.match_status as enum ('pending', 'accepted', 'rejected');
  end if;
end;
$$;

-- =============================================================================
-- TABLE : profiles
-- 1 ligne par utilisateur authentifié (clé = auth.users.id)
-- =============================================================================
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  first_name  text,
  gender      public.gender,
  birth_date  date,
  country     text,
  city        text,
  intention   text not null default 'mariage_serieux',
  bio         text,
  blur_photos boolean not null default true,
  is_premium  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint profiles_bio_len check (bio is null or char_length(bio) <= 2000),
  constraint profiles_birth_date_past check (birth_date is null or birth_date < current_date)
);

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

-- Un utilisateur ne voit et ne modifie QUE son propre profil.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own"
  on public.profiles for delete
  to authenticated
  using (auth.uid() = id);

-- =============================================================================
-- TABLE : photos
-- Photos rattachées au profil propriétaire.
-- =============================================================================
create table if not exists public.photos (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles (id) on delete cascade,
  storage_path text not null,
  is_primary   boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists photos_profile_id_idx on public.photos (profile_id);

drop trigger if exists trg_photos_updated_at on public.photos;
create trigger trg_photos_updated_at
  before update on public.photos
  for each row execute function public.set_updated_at();

alter table public.photos enable row level security;

-- Seul le propriétaire du profil manipule ses photos.
drop policy if exists "photos_select_own" on public.photos;
create policy "photos_select_own"
  on public.photos for select
  to authenticated
  using (auth.uid() = profile_id);

drop policy if exists "photos_insert_own" on public.photos;
create policy "photos_insert_own"
  on public.photos for insert
  to authenticated
  with check (auth.uid() = profile_id);

drop policy if exists "photos_update_own" on public.photos;
create policy "photos_update_own"
  on public.photos for update
  to authenticated
  using (auth.uid() = profile_id)
  with check (auth.uid() = profile_id);

drop policy if exists "photos_delete_own" on public.photos;
create policy "photos_delete_own"
  on public.photos for delete
  to authenticated
  using (auth.uid() = profile_id);

-- =============================================================================
-- TABLE : matches
-- Mise en relation entre deux profils. Visible uniquement par les 2 concernés.
-- =============================================================================
create table if not exists public.matches (
  id         uuid primary key default gen_random_uuid(),
  user_a     uuid not null references public.profiles (id) on delete cascade,
  user_b     uuid not null references public.profiles (id) on delete cascade,
  status     public.match_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint matches_distinct_users check (user_a <> user_b),
  -- Paire unique quel que soit l'ordre (a,b) / (b,a).
  constraint matches_unique_pair unique (
    least(user_a, user_b),
    greatest(user_a, user_b)
  )
);

create index if not exists matches_user_a_idx on public.matches (user_a);
create index if not exists matches_user_b_idx on public.matches (user_b);

drop trigger if exists trg_matches_updated_at on public.matches;
create trigger trg_matches_updated_at
  before update on public.matches
  for each row execute function public.set_updated_at();

alter table public.matches enable row level security;

-- Lecture : uniquement les deux personnes concernées.
drop policy if exists "matches_select_participants" on public.matches;
create policy "matches_select_participants"
  on public.matches for select
  to authenticated
  using (auth.uid() = user_a or auth.uid() = user_b);

-- Création : l'initiateur doit être l'un des deux participants.
drop policy if exists "matches_insert_participant" on public.matches;
create policy "matches_insert_participant"
  on public.matches for insert
  to authenticated
  with check (auth.uid() = user_a or auth.uid() = user_b);

-- Mise à jour (ex. accepter/refuser) : réservée aux participants.
drop policy if exists "matches_update_participants" on public.matches;
create policy "matches_update_participants"
  on public.matches for update
  to authenticated
  using (auth.uid() = user_a or auth.uid() = user_b)
  with check (auth.uid() = user_a or auth.uid() = user_b);

-- =============================================================================
-- TABLE : messages
-- Messages d'un match. Visibles uniquement par les participants du match.
-- =============================================================================
create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  match_id   uuid not null references public.matches (id) on delete cascade,
  sender_id  uuid not null references public.profiles (id) on delete cascade,
  content    text not null,
  read_at    timestamptz,
  created_at timestamptz not null default now(),
  constraint messages_content_len check (char_length(content) between 1 and 4000)
);

create index if not exists messages_match_id_idx on public.messages (match_id);
create index if not exists messages_sender_id_idx on public.messages (sender_id);

alter table public.messages enable row level security;

-- Fonction d'aide : l'utilisateur courant participe-t-il à ce match ?
create or replace function public.is_match_participant(p_match_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.matches m
    where m.id = p_match_id
      and (m.user_a = auth.uid() or m.user_b = auth.uid())
  );
$$;

-- Lecture : seulement les participants du match.
drop policy if exists "messages_select_participants" on public.messages;
create policy "messages_select_participants"
  on public.messages for select
  to authenticated
  using (public.is_match_participant(match_id));

-- Envoi : l'auteur doit être lui-même participant et expéditeur réel.
drop policy if exists "messages_insert_participant" on public.messages;
create policy "messages_insert_participant"
  on public.messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_match_participant(match_id)
  );

-- Mise à jour (ex. marquer comme lu) : réservée aux participants du match.
drop policy if exists "messages_update_participants" on public.messages;
create policy "messages_update_participants"
  on public.messages for update
  to authenticated
  using (public.is_match_participant(match_id))
  with check (public.is_match_participant(match_id));
