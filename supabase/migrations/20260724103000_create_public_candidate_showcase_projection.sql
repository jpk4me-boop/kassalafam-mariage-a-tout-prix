-- =============================================================================
-- KASSALAFAM — MARIAGE À TOUT PRIX
-- V2 — projection publique limitée de la vitrine des candidats.
--
-- Garanties :
--   * aucune lecture directe des tables V1, y compris par service_role ;
--   * quatre RPC serveur SECURITY DEFINER, exécutables uniquement par
--     service_role ;
--   * zéro UUID, date de naissance, religion, email, chemin Storage ou champ de
--     modération dans les projections destinées aux pages publiques ;
--   * chaque lecture revérifie l'éligibilité V1 à l'instant de la requête ;
--   * suspension, retrait du consentement, dépublication, floutage ou photo
--     invalide retirent immédiatement la fiche des routes et du sitemap ;
--   * limites et offsets bornés côté SQL ;
--   * aucun backfill et aucune publication automatique.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Liste publique paginée, destinée à /candidats.
-- -----------------------------------------------------------------------------
create or replace function public.list_public_candidate_showcases(
  p_limit integer default 24,
  p_offset integer default 0
)
returns table (
  public_slug text,
  first_name text,
  age integer,
  city text,
  country text,
  discovery_universe text,
  marital_status text,
  published_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.public_slug,
    pg_catalog.btrim(pr.first_name),
    extract(
      year from pg_catalog.age(current_date, pr.birth_date)
    )::integer as age,
    pg_catalog.btrim(pr.city),
    pg_catalog.btrim(pr.country),
    pr.discovery_universe,
    pr.marital_status,
    p.published_at,
    greatest(p.updated_at, pr.updated_at, ph.updated_at) as updated_at
  from public.candidate_showcase_publications p
  join public.profiles pr on pr.id = p.profile_id
  join public.photos ph on ph.id = p.selected_photo_id
  where p.listing_enabled
    and public.candidate_showcase_eligibility_reason(
      p.profile_id,
      p.selected_photo_id
    ) = 'eligible'
  order by p.published_at desc, p.public_slug
  limit greatest(
    1,
    least(coalesce(p_limit, 24), 48)
  )
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.list_public_candidate_showcases(integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_public_candidate_showcases(integer, integer)
  to service_role;

-- -----------------------------------------------------------------------------
-- 2. Fiche publique limitée, destinée à /candidats/[slug].
-- -----------------------------------------------------------------------------
create or replace function public.get_public_candidate_showcase(
  p_slug text
)
returns table (
  public_slug text,
  first_name text,
  age integer,
  city text,
  country text,
  discovery_universe text,
  marital_status text,
  intention text,
  bio text,
  partner_expectations text,
  published_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.public_slug,
    pg_catalog.btrim(pr.first_name),
    extract(
      year from pg_catalog.age(current_date, pr.birth_date)
    )::integer as age,
    pg_catalog.btrim(pr.city),
    pg_catalog.btrim(pr.country),
    pr.discovery_universe,
    pr.marital_status,
    pr.intention,
    pg_catalog.left(pg_catalog.btrim(pr.bio), 600),
    pg_catalog.left(pg_catalog.btrim(pr.partner_expectations), 600),
    p.published_at,
    greatest(p.updated_at, pr.updated_at, ph.updated_at) as updated_at
  from public.candidate_showcase_publications p
  join public.profiles pr on pr.id = p.profile_id
  join public.photos ph on ph.id = p.selected_photo_id
  where p_slug ~ '^[A-Za-z0-9_-]{22}$'
    and p.public_slug = p_slug
    and p.listing_enabled
    and public.candidate_showcase_eligibility_reason(
      p.profile_id,
      p.selected_photo_id
    ) = 'eligible'
  limit 1;
$$;

revoke all on function public.get_public_candidate_showcase(text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_public_candidate_showcase(text)
  to service_role;

-- -----------------------------------------------------------------------------
-- 3. Métadonnées privées de la photo sélectionnée. Le chemin Storage reste
--    strictement côté serveur et n'est jamais rendu au navigateur.
-- -----------------------------------------------------------------------------
create or replace function public.get_public_candidate_showcase_photo(
  p_slug text
)
returns table (
  storage_path text,
  mime_type text,
  size_bytes bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    ph.storage_path,
    ph.mime_type,
    ph.size_bytes::bigint
  from public.candidate_showcase_publications p
  join public.photos ph on ph.id = p.selected_photo_id
  where p_slug ~ '^[A-Za-z0-9_-]{22}$'
    and p.public_slug = p_slug
    and p.listing_enabled
    and public.candidate_showcase_eligibility_reason(
      p.profile_id,
      p.selected_photo_id
    ) = 'eligible'
  limit 1;
$$;

revoke all on function public.get_public_candidate_showcase_photo(text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_public_candidate_showcase_photo(text)
  to service_role;

-- -----------------------------------------------------------------------------
-- 4. Projection minimale du sitemap. Seuls les slugs encore effectivement
--    publics sont énumérés ; aucune autre donnée personnelle n'est retournée.
-- -----------------------------------------------------------------------------
create or replace function public.list_public_candidate_showcase_sitemap()
returns table (
  public_slug text,
  last_modified timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.public_slug,
    greatest(p.updated_at, pr.updated_at, ph.updated_at)
      as last_modified
  from public.candidate_showcase_publications p
  join public.profiles pr on pr.id = p.profile_id
  join public.photos ph on ph.id = p.selected_photo_id
  where p.listing_enabled
    and public.candidate_showcase_eligibility_reason(
      p.profile_id,
      p.selected_photo_id
    ) = 'eligible'
  order by p.public_slug;
$$;

revoke all on function public.list_public_candidate_showcase_sitemap()
  from public, anon, authenticated, service_role;
grant execute on function public.list_public_candidate_showcase_sitemap()
  to service_role;
