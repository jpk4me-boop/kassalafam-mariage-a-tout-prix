-- =============================================================================
-- KASSALAFAM — C1b — Priorité de découverte fondée sur l'abonnement actif
-- =============================================================================

create or replace function public.discover_candidates(
  p_universe text,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid,
  first_name text,
  age integer,
  city text,
  country text,
  marital_status text,
  intention text,
  discovery_universe text,
  has_photo boolean,
  is_blurred boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with viewer as (
    select
      v.id,
      v.gender,
      v.verification_status,
      v.account_status
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
    c.blur_photos as is_blurred
  from public.profiles c
  cross join viewer vw
  where (select auth.uid()) is not null
    and vw.account_status = 'active'::public.account_status
    and vw.verification_status = 'approved'
    and vw.gender is not null
    and p_universe in (
      'christian_marriage',
      'islamic_marriage',
      'open_marriage'
    )
    and c.account_status = 'active'::public.account_status
    and c.verification_status = 'approved'
    and c.id <> (select auth.uid())
    and c.gender = (
      case vw.gender
        when 'homme' then 'femme'
        else 'homme'
      end
    )::public.gender
    and c.discovery_universe = p_universe
    and not public.blocking_exists((select auth.uid()), c.id)
    and c.first_name is not null
    and btrim(c.first_name) <> ''
    and c.gender is not null
    and c.birth_date is not null
  order by
    public.profile_has_active_premium(c.id) desc,
    has_photo desc,
    c.created_at desc,
    c.id
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.discover_candidates(
  text, integer, integer
) from public, anon;

grant execute on function public.discover_candidates(
  text, integer, integer
) to authenticated, service_role;
