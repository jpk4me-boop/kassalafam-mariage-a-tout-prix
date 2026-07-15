-- =============================================================================
-- KASSALAFAM — MARIAGE À TOUT PRIX
-- Migration : religion déclarée du membre (PR B onboarding/profil)
-- Date      : 2026-07-15
--
-- Objet     : ajouter au profil membre une déclaration EXPLICITE de religion,
--             DISTINCTE de l'univers de découverte (discovery_universe reste
--             une préférence volontaire d'espace de découverte, jamais une
--             religion déduite — voir 20260630090041) :
--               - religion : religion déclarée par le membre
--
-- Valeurs internes autorisées :
--               - christianisme   (Christianisme)
--               - islam           (Islam)
--               - autre           (Autre religion)
--               - sans_religion   (Sans religion)
--
-- Complétude : la religion devient OBLIGATOIRE pour FINALISER l'onboarding
--             (étape 4 « Votre situation ») :
--               - le prédicat public.profile_meets_onboarding_requirements est
--                 remplacé pour exiger religion IS NOT NULL ;
--               - la RPC public.complete_member_onboarding est remplacée pour
--                 refuser la finalisation avec l'erreur stable
--                 ONBOARDING_INCOMPLETE_RELIGION.
--
-- Compatibilité des profils historiques (stratégie DOUCE) :
--             - Colonne NULLABLE, SANS default, AUCUN backfill : les profils
--               existants gardent religion = NULL.
--             - AUCUNE déduction depuis discovery_universe, ni maintenant ni
--               par trigger.
--             - Un membre déjà finalisé (onboarding_completed_at posé,
--               write-once) n'est JAMAIS re-bloqué : le routage ne regarde que
--               le marqueur, et la RPC idempotente renvoie le premier
--               horodatage sans revalider. Seul le bandeau « Profil incomplet »
--               (complétude dynamique côté app) l'incite à compléter.
--
-- Sécurité  : - Migration ADDITIVE et NON destructive. Aucune donnée modifiée.
--             - Aucune policy RLS modifiée : les policies *_own existantes
--               couvrent déjà cette nouvelle colonne (le membre écrit
--               uniquement sa propre ligne, auth.uid() = id).
--             - Aucun trigger de garde modifié : champ librement éditable par
--               le membre (comme marital_status), ce n'est ni un champ
--               write-once ni un champ admin.
--             - CHECK : chaîne vide et toute valeur hors liste rejetées.
--             - Le backfill public.backfill_onboarding_completion n'est PAS
--               ré-exécuté.
--             - Idempotente : ADD COLUMN IF NOT EXISTS ; DROP CONSTRAINT IF
--               EXISTS + ADD ; CREATE OR REPLACE FUNCTION ; revokes/grants
--               réaffirmés à l'identique.
--
-- Confidentialité : la religion n'est PAS exposée aux autres membres dans
--             cette phase. Aucune lecture croisée de profils n'est introduite.
--
-- ⚠️ À NE PAS appliquer automatiquement : attendre le GO explicite.
--    Ne PAS exécuter `supabase db push` ni toucher la base Production.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Colonne (nullable, additive, sans default) -------------------------------
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists religion text;

comment on column public.profiles.religion is
  'Religion déclarée par le membre (christianisme | islam | autre | '
  'sans_religion). NULL = non renseignée (profils historiques). DISTINCTE de '
  'discovery_universe : jamais déduite de l''univers de découverte. Requise '
  'pour FINALISER l''onboarding ; librement éditable ensuite.';

-- ---------------------------------------------------------------------------
-- 2. Contrainte de domaine (NULL toujours permis ; '' et hors-liste rejetés) --
-- ---------------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_religion_chk;
alter table public.profiles add constraint profiles_religion_chk
  check (
    religion is null
    or religion in ('christianisme', 'islam', 'autre', 'sans_religion')
  );

-- ---------------------------------------------------------------------------
-- 3. Prédicat interne — exigences serveur du parcours (source de vérité
--    UNIQUE, partagée par la RPC et le backfill). REMPLACÉ à l'identique de
--    20260708130000 avec UNE addition : l'étape 4 exige désormais aussi la
--    religion. Miroir de `computeStepCompletion` côté app.
-- ---------------------------------------------------------------------------
create or replace function public.profile_meets_onboarding_requirements(
  p_profile public.profiles
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select
    -- Étape 1 — acquisition (write-once déjà posée)
    p_profile.acquisition_source_recorded_at is not null
    -- Étape 2 — prénom + genre
    and coalesce(pg_catalog.btrim(p_profile.first_name), '') <> ''
    and p_profile.gender is not null
    -- Étape 3 — date de naissance, 18 ans révolus
    and p_profile.birth_date is not null
    and p_profile.birth_date <= (current_date - interval '18 years')::date
    -- Étape 4 — situation matrimoniale + religion (PR B religion)
    and p_profile.marital_status is not null
    and p_profile.religion is not null
    -- Étape 5 — profession / études / taille
    and coalesce(pg_catalog.btrim(p_profile.profession), '') <> ''
    and p_profile.education_level is not null
    and p_profile.height_cm is not null
    -- Étape 6 — localisation
    and coalesce(pg_catalog.btrim(p_profile.country), '') <> ''
    and coalesce(pg_catalog.btrim(p_profile.city), '') <> ''
    and coalesce(pg_catalog.btrim(p_profile.origin_country), '') <> ''
    and coalesce(pg_catalog.btrim(p_profile.region), '') <> ''
    -- Étape 7 — projet matrimonial + présentation + attentes
    and coalesce(pg_catalog.array_length(p_profile.marriage_goals, 1), 0) >= 2
    and coalesce(pg_catalog.array_length(p_profile.desired_partner_traits, 1), 0) >= 2
    and p_profile.polygamy_preference is not null
    and p_profile.children_intent is not null
    and coalesce(pg_catalog.btrim(p_profile.bio), '') <> ''
    and coalesce(pg_catalog.btrim(p_profile.partner_expectations), '') <> ''
    -- Étape 8 — photo principale
    and exists (
      select 1
      from public.photos ph
      where ph.profile_id = p_profile.id
        and ph.is_primary
    );
$$;

-- Prédicat interne : jamais une API métier (réaffirmé à l'identique).
revoke all on function public.profile_meets_onboarding_requirements(public.profiles) from public;
revoke all on function public.profile_meets_onboarding_requirements(public.profiles) from anon;
revoke all on function public.profile_meets_onboarding_requirements(public.profiles) from authenticated;

-- ---------------------------------------------------------------------------
-- 4. RPC de finalisation — REMPLACÉE à l'identique de 20260708130000 avec UNE
--    addition : refus ONBOARDING_INCOMPLETE_RELIGION lorsque la religion
--    manque (étape 4). L'idempotence est INCHANGÉE : un membre déjà finalisé
--    (marqueur posé) reçoit le premier horodatage SANS revalidation — les
--    profils historiques sans religion ne sont jamais re-bloqués.
-- ---------------------------------------------------------------------------
create or replace function public.complete_member_onboarding()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_profile public.profiles%rowtype;
  v_now timestamptz;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'ONBOARDING_AUTH_REQUIRED' using errcode = '42501';
  end if;

  select * into v_profile
  from public.profiles
  where id = v_uid
  for update;

  if not found then
    raise exception 'ONBOARDING_PROFILE_MISSING';
  end if;

  -- Idempotence : déjà finalisé → renvoyer le premier horodatage, sans écrire.
  if v_profile.onboarding_completed_at is not null then
    return v_profile.onboarding_completed_at;
  end if;

  -- Erreurs par exigence (mêmes règles que le prédicat, messages stables).
  if v_profile.acquisition_source_recorded_at is null then
    raise exception 'ONBOARDING_INCOMPLETE_ACQUISITION';
  end if;
  if coalesce(pg_catalog.btrim(v_profile.first_name), '') = '' then
    raise exception 'ONBOARDING_INCOMPLETE_FIRST_NAME';
  end if;
  if v_profile.gender is null then
    raise exception 'ONBOARDING_INCOMPLETE_GENDER';
  end if;
  if v_profile.birth_date is null
     or v_profile.birth_date > (current_date - interval '18 years')::date then
    raise exception 'ONBOARDING_INCOMPLETE_BIRTH_DATE';
  end if;
  if v_profile.marital_status is null then
    raise exception 'ONBOARDING_INCOMPLETE_MARITAL_STATUS';
  end if;
  if v_profile.religion is null then
    raise exception 'ONBOARDING_INCOMPLETE_RELIGION';
  end if;
  if coalesce(pg_catalog.btrim(v_profile.profession), '') = ''
     or v_profile.education_level is null
     or v_profile.height_cm is null then
    raise exception 'ONBOARDING_INCOMPLETE_PROFESSIONAL';
  end if;
  if coalesce(pg_catalog.btrim(v_profile.country), '') = ''
     or coalesce(pg_catalog.btrim(v_profile.city), '') = ''
     or coalesce(pg_catalog.btrim(v_profile.origin_country), '') = ''
     or coalesce(pg_catalog.btrim(v_profile.region), '') = '' then
    raise exception 'ONBOARDING_INCOMPLETE_LOCATION';
  end if;
  if coalesce(pg_catalog.array_length(v_profile.marriage_goals, 1), 0) < 2
     or coalesce(pg_catalog.array_length(v_profile.desired_partner_traits, 1), 0) < 2
     or v_profile.polygamy_preference is null
     or v_profile.children_intent is null then
    raise exception 'ONBOARDING_INCOMPLETE_MATRIMONIAL';
  end if;
  if coalesce(pg_catalog.btrim(v_profile.bio), '') = '' then
    raise exception 'ONBOARDING_INCOMPLETE_BIO';
  end if;
  if coalesce(pg_catalog.btrim(v_profile.partner_expectations), '') = '' then
    raise exception 'ONBOARDING_INCOMPLETE_PARTNER_EXPECTATIONS';
  end if;
  if not exists (
    select 1 from public.photos ph
    where ph.profile_id = v_uid and ph.is_primary
  ) then
    raise exception 'ONBOARDING_INCOMPLETE_PRIMARY_PHOTO';
  end if;

  -- Garde-fou final : la source de vérité partagée avec le backfill.
  if not public.profile_meets_onboarding_requirements(v_profile) then
    raise exception 'ONBOARDING_INCOMPLETE';
  end if;

  v_now := pg_catalog.now();

  update public.profiles
  set onboarding_completed_at = v_now
  where id = v_uid
    and onboarding_completed_at is null;

  return v_now;
end;
$$;

-- Privilèges réaffirmés à l'identique de 20260708130000.
revoke all on function public.complete_member_onboarding() from public;
revoke all on function public.complete_member_onboarding() from anon;
grant execute on function public.complete_member_onboarding() to authenticated;
