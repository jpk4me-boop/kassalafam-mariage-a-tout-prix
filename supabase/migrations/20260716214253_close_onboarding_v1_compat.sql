-- =============================================================================
-- KASSALAFAM — MARIAGE À TOUT PRIX
-- Migration : fermeture de la compatibilité temporaire onboarding v1
-- Version   : 20260716214253
--
-- Après déploiement Production du wizard v2 :
--   1. origin_city rejoint la source de vérité serveur de complétude ;
--   2. complete_member_onboarding() reste disponible comme alias historique,
--      mais délègue strictement à complete_member_onboarding_v2().
--
-- Aucun profil n'est modifié. Les profils déjà finalisés restent idempotents :
-- la v2 renvoie leur premier onboarding_completed_at sans les revalider.
-- =============================================================================

create or replace function public.profile_meets_onboarding_requirements(
  p_profile public.profiles
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select
    p_profile.acquisition_source_recorded_at is not null
    and coalesce(pg_catalog.btrim(p_profile.first_name), '') <> ''
    and p_profile.gender is not null
    and p_profile.birth_date is not null
    and p_profile.birth_date <= (current_date - interval '18 years')::date
    and p_profile.marital_status is not null
    and p_profile.religion is not null
    and coalesce(pg_catalog.btrim(p_profile.profession), '') <> ''
    and p_profile.education_level is not null
    and p_profile.height_cm is not null
    and coalesce(pg_catalog.btrim(p_profile.origin_country), '') <> ''
    and coalesce(pg_catalog.btrim(p_profile.origin_city), '') <> ''
    and coalesce(pg_catalog.btrim(p_profile.country), '') <> ''
    and coalesce(pg_catalog.btrim(p_profile.city), '') <> ''
    and coalesce(pg_catalog.btrim(p_profile.region), '') <> ''
    and coalesce(pg_catalog.array_length(p_profile.marriage_goals, 1), 0) >= 2
    and coalesce(pg_catalog.array_length(p_profile.desired_partner_traits, 1), 0) >= 2
    and p_profile.polygamy_preference is not null
    and p_profile.children_intent is not null
    and coalesce(pg_catalog.btrim(p_profile.bio), '') <> ''
    and coalesce(pg_catalog.btrim(p_profile.partner_expectations), '') <> ''
    and exists (
      select 1
      from public.photos ph
      where ph.profile_id = p_profile.id
        and ph.is_primary
    );
$$;

revoke all on function public.profile_meets_onboarding_requirements(public.profiles) from public;
revoke all on function public.profile_meets_onboarding_requirements(public.profiles) from anon;
revoke all on function public.profile_meets_onboarding_requirements(public.profiles) from authenticated;

create or replace function public.complete_member_onboarding()
returns timestamptz
language sql
security definer
set search_path = ''
as $$
  select public.complete_member_onboarding_v2();
$$;

comment on function public.complete_member_onboarding() is
  'Alias de compatibilité fermé : délègue strictement à complete_member_onboarding_v2(), qui exige origin_country, origin_city, country, city et region. Les profils déjà finalisés restent idempotents et ne sont jamais re-bloqués.';

revoke all on function public.complete_member_onboarding() from public;
revoke all on function public.complete_member_onboarding() from anon;
grant execute on function public.complete_member_onboarding() to authenticated;
