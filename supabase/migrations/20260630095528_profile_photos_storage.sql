-- =============================================================================
-- KASSALAFAM — MARIAGE À TOUT PRIX
-- Migration : photos de profil — Storage privé + enrichissements (L3D-A)
-- Date      : 2026-06-30
--
-- Objet     : préparer la gestion PRIVÉE des photos du membre connecté.
--             La table public.photos existe déjà (schéma cœur) avec ses RLS
--             owner-only (auth.uid() = profile_id) — on la RÉUTILISE.
--             Cette migration :
--               1. enrichit public.photos (mime_type, size_bytes, garde 1 seule
--                  photo principale par profil, storage_path unique) ;
--               2. crée un bucket Storage PRIVÉ « profile-photos » ;
--               3. ajoute des policies Storage owner-only (chaque membre n'accède
--                  qu'à son propre dossier {auth.uid()}/...).
--
-- Confidentialité : aucun accès public. Aucune lecture croisée. Les photos d'un
--             membre ne sont jamais lisibles par un autre membre (RLS table +
--             RLS storage filtrées sur l'identité). Aucun affichage à des tiers.
--
-- Sécurité  : ADDITIVE et NON destructive. Colonnes nullable. Index/contraintes
--             idempotents. Aucune donnée supprimée. Aucune RLS existante affaiblie.
--
-- ⚠️ À NE PAS appliquer automatiquement : attendre le GO explicite.
-- =============================================================================

-- 1. Enrichissement de public.photos (additif) -------------------------------
alter table public.photos
  add column if not exists mime_type  text,
  add column if not exists size_bytes integer;

-- Au plus UNE photo principale par profil (index unique partiel).
create unique index if not exists photos_one_primary_per_profile
  on public.photos (profile_id)
  where is_primary;

-- Unicité du chemin de stockage (évite les doublons / collisions).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'photos_storage_path_key'
      and conrelid = 'public.photos'::regclass
  ) then
    alter table public.photos
      add constraint photos_storage_path_key unique (storage_path);
  end if;
end;
$$;

-- 2. Bucket Storage privé « profile-photos » ---------------------------------
--    public = false → aucune URL publique permanente. Limite 3 Mo, images only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-photos',
  'profile-photos',
  false,
  3145728, -- 3 Mo (le client valide à 2 Mo ; ceci est un garde-fou serveur)
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- 3. Policies Storage owner-only sur storage.objects -------------------------
--    Chaque membre n'accède qu'au dossier portant son propre auth.uid().
--    Chemin attendu : {auth.uid()}/{photo_id}.{ext}
drop policy if exists "profile_photos_select_own" on storage.objects;
create policy "profile_photos_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "profile_photos_insert_own" on storage.objects;
create policy "profile_photos_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "profile_photos_update_own" on storage.objects;
create policy "profile_photos_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "profile_photos_delete_own" on storage.objects;
create policy "profile_photos_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
