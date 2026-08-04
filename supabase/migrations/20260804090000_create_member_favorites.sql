-- =============================================================================
-- KASSALAFAM — MARIAGE À TOUT PRIX
-- Migration : favoris membre (table + RPC add_favorite / list_favorites)
-- Date      : 2026-08-04
--
-- Objet     : permettre à un membre de conserver des profils en favoris et de
--             les retrouver sur /favorites. Aucun impact sur matches, la
--             messagerie ou les RPC existantes.
--
-- Sécurité  : - RLS activée. SELECT et DELETE limités à auth.uid() = user_id.
--             - INSERT uniquement via la RPC add_favorite (SECURITY DEFINER,
--               search_path fixé) : mêmes gardes que express_interest
--               (viewer approuvé/actif, cible approuvée/active/complète,
--               genre opposé, pas de self). Aucune policy INSERT.
--             - list_favorites (SECURITY DEFINER) ne renvoie QUE les champs
--               sûrs du modèle DiscoverCandidate + favorited_at, et REVALIDE
--               la visibilité de la cible à chaque lecture : un profil
--               suspendu ou dé-approuvé disparaît automatiquement.
--             - Grants explicites (les privilèges par défaut sont durcis
--               depuis 20260724045658) : authenticated = SELECT + DELETE sur
--               la table, EXECUTE sur les 2 RPC. Rien pour public/anon.
--             - Idempotent (if not exists / drop policy if exists /
--               create or replace).
--
-- ⚠️ À NE PAS appliquer automatiquement : attendre le GO explicite.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Table.
-- ---------------------------------------------------------------------------
create table if not exists public.member_favorites (
  user_id           uuid not null references auth.users (id) on delete cascade,
  target_profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at        timestamptz not null default now(),
  primary key (user_id, target_profile_id),
  constraint member_favorites_no_self check (user_id <> target_profile_id)
);

alter table public.member_favorites enable row level security;

create index if not exists member_favorites_user_created_idx
  on public.member_favorites (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Policies : lecture et retrait par le propriétaire uniquement.
-- ---------------------------------------------------------------------------
drop policy if exists "Members can read their own favorites"
  on public.member_favorites;
create policy "Members can read their own favorites"
  on public.member_favorites
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Members can remove their own favorites"
  on public.member_favorites;
create policy "Members can remove their own favorites"
  on public.member_favorites
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Grants (conformes au durcissement des privilèges).
-- ---------------------------------------------------------------------------
revoke all privileges on table public.member_favorites from public, anon;
revoke all privileges on table public.member_favorites from authenticated;
grant select, delete on table public.member_favorites to authenticated;

-- ---------------------------------------------------------------------------
-- RPC add_favorite : UNIQUE chemin d'ajout. Retour : 'added' | 'already'.
-- ---------------------------------------------------------------------------
create or replace function public.add_favorite(
  p_target uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_gender public.gender;
  v_status public.profile_verification_status;
  v_account public.account_status;
begin
  -- Garde viewer : authentifié, approuvé, actif, genre connu.
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select gender, verification_status, account_status
    into v_gender, v_status, v_account
    from public.profiles
    where id = v_uid;

  if v_status is distinct from 'approved'
     or v_gender is null
     or v_account is distinct from 'active'::public.account_status then
    raise exception 'viewer not eligible' using errcode = '42501';
  end if;

  if p_target = v_uid then
    raise exception 'self not allowed' using errcode = '22023';
  end if;

  -- Validation cible : mêmes prédicats de visibilité que la découverte.
  if not exists (
    select 1
    from public.profiles c
    where c.id = p_target
      and c.verification_status = 'approved'
      and c.account_status = 'active'::public.account_status
      and c.gender = (case v_gender when 'homme' then 'femme' else 'homme' end)::public.gender
      and c.first_name is not null
      and btrim(c.first_name) <> ''
      and c.birth_date is not null
  ) then
    raise exception 'invalid target' using errcode = '42501';
  end if;

  insert into public.member_favorites (user_id, target_profile_id)
    values (v_uid, p_target)
    on conflict (user_id, target_profile_id) do nothing;

  if found then
    return 'added';
  end if;

  return 'already';
end
$$;

revoke all on function public.add_favorite(uuid) from public;
revoke all on function public.add_favorite(uuid) from anon;
grant execute on function public.add_favorite(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC list_favorites : lecture curée des favoris ENCORE visibles.
-- Champs sûrs uniquement (modèle DiscoverCandidate) + favorited_at.
-- ---------------------------------------------------------------------------
create or replace function public.list_favorites()
returns table (
  id uuid,
  first_name text,
  age int,
  city text,
  country text,
  marital_status text,
  intention text,
  discovery_universe text,
  has_photo boolean,
  is_blurred boolean,
  favorited_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with viewer as (
    select v.id, v.gender, v.verification_status, v.account_status
    from public.profiles v
    where v.id = (select auth.uid())
  )
  select
    c.id,
    c.first_name,
    date_part('year', age(c.birth_date))::int as age,
    c.city,
    c.country,
    c.marital_status,
    c.intention,
    c.discovery_universe,
    exists (
      select 1
      from public.photos ph
      where ph.profile_id = c.id
        and ph.is_primary
    ) as has_photo,
    c.blur_photos as is_blurred,
    f.created_at as favorited_at
  from public.member_favorites f
  cross join viewer vw
  join public.profiles c on c.id = f.target_profile_id
  where
    f.user_id = (select auth.uid())
    -- Gardes viewer : authentifié, approuvé, actif (sinon 0 ligne).
    and (select auth.uid()) is not null
    and vw.verification_status = 'approved'
    and vw.account_status = 'active'::public.account_status
    -- Revalidation de la cible à chaque lecture.
    and c.verification_status = 'approved'
    and c.account_status = 'active'::public.account_status
    and c.first_name is not null
    and btrim(c.first_name) <> ''
    and c.birth_date is not null
  order by f.created_at desc;
$$;

revoke all on function public.list_favorites() from public;
revoke all on function public.list_favorites() from anon;
grant execute on function public.list_favorites() to authenticated;
