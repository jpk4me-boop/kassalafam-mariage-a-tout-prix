-- =============================================================================
-- KASSALAFAM — MARIAGE À TOUT PRIX
-- Migration : visites de profil (Lot 3) + correctif pseudo sur list_favorites
-- Date      : 2026-08-04
--
-- Objet     : 1) réglage profiles.discreet_visits (visites discrètes) ;
--             2) table profile_visits (compteur par paire, RPC uniquement) ;
--             3) RPC view_candidate_details : détail sûr d'une carte
--                (bio, partner_expectations) + enregistrement de la visite ;
--             4) RPC list_profile_visitors : visiteurs de MON profil ;
--             5) CORRECTIF Lot 2 : list_favorites affichait first_name brut —
--                recréée avec coalesce(pseudo, first_name) (règle migration 53).
--
-- Sécurité  : - profile_visits : RLS activée, AUCUN grant à authenticated —
--               lecture et écriture passent exclusivement par les RPC.
--             - view_candidate_details (SECURITY DEFINER, search_path fixé) :
--               gardes identiques à la découverte (viewer et cible approuvés,
--               actifs, complets, genre opposé). N'expose QUE bio et
--               partner_expectations (déjà exposés dans la vitrine publique).
--               La religion n'est PAS exposée (décision documentée).
--               Aucune trace si le viewer est en visites discrètes.
--             - list_profile_visitors : exclut les visiteurs en mode discret,
--               revalide leur visibilité à chaque lecture, applique la règle
--               pseudo, ne renvoie que les champs sûrs du modèle carte.
--             - Idempotent (if not exists / create or replace / drop policy).
--
-- ⚠️ À NE PAS appliquer automatiquement : attendre le GO explicite.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Réglage « visites discrètes » — librement éditable par le membre
--    (même statut que blur_photos).
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists discreet_visits boolean not null default false;

comment on column public.profiles.discreet_visits is
  'Visites discrètes : si true, les consultations de profils par ce membre ne '
  'sont ni enregistrées ni visibles chez les membres consultés.';

-- ---------------------------------------------------------------------------
-- 2) Table des visites (une ligne par paire visiteur → visité).
-- ---------------------------------------------------------------------------
create table if not exists public.profile_visits (
  visitor_id         uuid not null references auth.users (id) on delete cascade,
  visited_profile_id uuid not null references public.profiles (id) on delete cascade,
  first_visited_at   timestamptz not null default now(),
  last_visited_at    timestamptz not null default now(),
  visit_count        int not null default 1,
  primary key (visitor_id, visited_profile_id),
  constraint profile_visits_no_self check (visitor_id <> visited_profile_id)
);

alter table public.profile_visits enable row level security;

create index if not exists profile_visits_visited_last_idx
  on public.profile_visits (visited_profile_id, last_visited_at desc);

-- Aucun accès direct : ni policy permissive, ni grant à authenticated/anon.
revoke all privileges on table public.profile_visits from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) RPC view_candidate_details : détail sûr + enregistrement de la visite.
--    Retour : 1 ligne (bio, partner_expectations) ou 0 ligne si cible invalide.
-- ---------------------------------------------------------------------------
create or replace function public.view_candidate_details(
  p_target uuid
)
returns table (
  bio text,
  partner_expectations text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_gender public.gender;
  v_status public.profile_verification_status;
  v_account public.account_status;
  v_discreet boolean;
begin
  -- Garde viewer : authentifié, approuvé, actif, genre connu.
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select p.gender, p.verification_status, p.account_status, p.discreet_visits
    into v_gender, v_status, v_account, v_discreet
    from public.profiles p
    where p.id = v_uid;

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
    -- 0 ligne, sans erreur : la carte côté client affichera un état neutre.
    return;
  end if;

  -- Enregistrement de la visite — sauf visites discrètes (aucune trace).
  if not coalesce(v_discreet, false) then
    insert into public.profile_visits (visitor_id, visited_profile_id)
      values (v_uid, p_target)
      on conflict (visitor_id, visited_profile_id) do update
        set last_visited_at = now(),
            visit_count = public.profile_visits.visit_count + 1;
  end if;

  return query
    select c.bio, c.partner_expectations
    from public.profiles c
    where c.id = p_target;
end
$$;

revoke all on function public.view_candidate_details(uuid) from public;
revoke all on function public.view_candidate_details(uuid) from anon;
grant execute on function public.view_candidate_details(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) RPC list_profile_visitors : qui a consulté MON profil.
--    Exclut les visiteurs en mode discret ; revalide la visibilité ; règle
--    pseudo appliquée (coalesce). Champs sûrs uniquement + last_visited_at.
-- ---------------------------------------------------------------------------
create or replace function public.list_profile_visitors()
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
  last_visited_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with viewer as (
    select v.id, v.verification_status, v.account_status
    from public.profiles v
    where v.id = (select auth.uid())
  )
  select
    c.id,
    coalesce(nullif(btrim(c.pseudo), ''), c.first_name) as first_name,
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
    pv.last_visited_at
  from public.profile_visits pv
  cross join viewer vw
  join public.profiles c on c.id = pv.visitor_id
  where
    pv.visited_profile_id = (select auth.uid())
    and (select auth.uid()) is not null
    and vw.verification_status = 'approved'
    and vw.account_status = 'active'::public.account_status
    -- Visites discrètes : jamais affichées (réglage ACTUEL du visiteur).
    and c.discreet_visits = false
    -- Revalidation du visiteur à chaque lecture.
    and c.verification_status = 'approved'
    and c.account_status = 'active'::public.account_status
    and c.first_name is not null
    and btrim(c.first_name) <> ''
    and c.birth_date is not null
  order by pv.last_visited_at desc
  limit 100;
$$;

revoke all on function public.list_profile_visitors() from public;
revoke all on function public.list_profile_visitors() from anon;
grant execute on function public.list_profile_visitors() to authenticated;

-- ---------------------------------------------------------------------------
-- 5) CORRECTIF Lot 2 — list_favorites : appliquer la règle pseudo
--    (coalesce(pseudo, first_name)), à l'identique de discover_candidates.
--    Aucun autre changement (prédicats et ordre inchangés).
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
    coalesce(nullif(btrim(c.pseudo), ''), c.first_name) as first_name,
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
    and (select auth.uid()) is not null
    and vw.verification_status = 'approved'
    and vw.account_status = 'active'::public.account_status
    and c.verification_status = 'approved'
    and c.account_status = 'active'::public.account_status
    and c.first_name is not null
    and btrim(c.first_name) <> ''
    and c.birth_date is not null
  order by f.created_at desc;
$$;
