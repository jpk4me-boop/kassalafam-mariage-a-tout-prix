-- =============================================================================
-- KASSALAFAM — MARIAGE À TOUT PRIX
-- Migration : ville d'origine du membre (PR Origine / Résidence)
-- Date      : 2026-07-15
--
-- Objet     : distinguer le LIEU D'ORIGINE du LIEU DE RÉSIDENCE dans le profil.
--             `origin_country` (pays d'origine) existe déjà (20260707090000) ;
--             cette migration ajoute UNIQUEMENT la ville d'origine :
--               - origin_city : ville d'origine déclarée par le membre
--             Correspondances (aucun renommage physique) :
--               - origin_country = Pays d'origine
--               - origin_city    = Ville d'origine
--               - country        = Pays de résidence
--               - city           = Ville de résidence
--               - region         = région / zone de résidence (inchangée)
--             AUCUNE déduction : l'origine n'est jamais copiée depuis la
--             résidence (ni l'inverse), ni maintenant ni par trigger.
--
-- COMPATIBILITÉ DE DÉPLOIEMENT (ordre impératif : migration PUIS code) :
--             cette migration est SANS RUPTURE pour le code actuellement
--             déployé en Production :
--               - public.complete_member_onboarding() (v1, appelée par le
--                 wizard déployé) N'EST PAS MODIFIÉE : pendant la fenêtre
--                 migration → déploiement, un nouveau membre sur l'ancienne
--                 interface (sans champ « Ville d'origine ») peut toujours
--                 FINALISER son onboarding ;
--               - public.profile_meets_onboarding_requirements(profiles)
--                 (prédicat partagé par la v1 et le backfill) N'EST PAS
--                 MODIFIÉ : il n'exige pas origin_city ;
--               - la nouvelle exigence vit dans une RPC VERSIONNÉE :
--                 public.complete_member_onboarding_v2(), appelée par le
--                 NOUVEAU code uniquement, qui exige les quatre champs
--                 géographiques (origin_country, origin_city, country, city)
--                 + region.
--             Une MIGRATION ULTÉRIEURE (hors de cette PR, après stabilisation)
--             pourra aligner le prédicat sur la v2 et retirer la v1.
--             AUCUN DROP ni changement de signature dans cette migration.
--
-- Complétude : la ville d'origine devient OBLIGATOIRE pour FINALISER
--             l'onboarding VIA LA V2 (étape 6 « localisation », sous le code
--             stable EXISTANT du bloc géographique :
--             ONBOARDING_INCOMPLETE_LOCATION). Le bandeau « Profil incomplet »
--             côté app (computeStepCompletion) exige aussi origin_city :
--             écart temporaire ASSUMÉ avec le prédicat serveur (plus laxiste)
--             jusqu'à la migration d'alignement.
--
-- Compatibilité des profils historiques (stratégie DOUCE, pattern religion) :
--             - Colonne NULLABLE, SANS default, AUCUN backfill : les profils
--               existants gardent origin_city = NULL.
--             - country/city ne sont JAMAIS copiés vers origin_* (et
--               réciproquement).
--             - Un membre déjà finalisé (onboarding_completed_at posé,
--               write-once) n'est JAMAIS re-bloqué : le routage ne regarde que
--               le marqueur, et les RPC v1/v2 idempotentes renvoient le
--               premier horodatage sans revalider. Seul le bandeau « Profil
--               incomplet » (complétude dynamique côté app) l'incite à
--               compléter.
--
-- Sécurité  : - Migration ADDITIVE et NON destructive. Aucune ligne modifiée.
--             - Aucune policy RLS modifiée : les policies *_own existantes
--               couvrent déjà cette nouvelle colonne (le membre écrit
--               uniquement sa propre ligne, auth.uid() = id).
--             - Aucun trigger de garde modifié : champ librement éditable par
--               le membre (comme origin_country), ni write-once ni admin.
--             - CHECK : chaîne vide / espaces seuls rejetés, longueur ≤ 100
--               (cohérente avec profiles_origin_country_chk).
--             - v2 : SECURITY DEFINER, search_path verrouillé, auth.uid()
--               vérifié, EXECUTE limité à authenticated — mêmes garanties que
--               la v1 (20260715090000).
--             - Le backfill public.backfill_onboarding_completion n'est PAS
--               ré-exécuté.
--             - Idempotente : ADD COLUMN IF NOT EXISTS ; DROP CONSTRAINT IF
--               EXISTS + ADD ; CREATE OR REPLACE FUNCTION (v2 uniquement).
--
-- Confidentialité : origin_country / origin_city ne sont PAS exposés aux
--             autres membres : aucune projection publique (découverte,
--             relations, partage /p/[token]) n'est modifiée — leurs listes de
--             colonnes explicites restent inchangées.
--
-- ⚠️ À NE PAS appliquer automatiquement : attendre le GO explicite.
--    Ne PAS exécuter `supabase db push` ni toucher la base Production.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Colonne (nullable, additive, sans default) -------------------------------
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists origin_city text;

comment on column public.profiles.origin_city is
  'Ville d''origine déclarée par le membre — DISTINCTE de la ville de '
  'résidence (city), jamais déduite d''elle. NULL = non renseignée (profils '
  'historiques). Requise pour FINALISER l''onboarding via '
  'complete_member_onboarding_v2 ; librement éditable ensuite. Non exposée '
  'publiquement.';

-- ---------------------------------------------------------------------------
-- 2. Contrainte (NULL permis ; '' / espaces rejetés ; ≤ 100 comme
--    profiles_origin_country_chk) ----------------------------------------------
-- ---------------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_origin_city_chk;
alter table public.profiles add constraint profiles_origin_city_chk
  check (
    origin_city is null
    or (btrim(origin_city) <> '' and char_length(btrim(origin_city)) <= 100)
  );

-- ---------------------------------------------------------------------------
-- 3. RPC de finalisation VERSIONNÉE — public.complete_member_onboarding_v2().
--    NOUVELLE fonction appelée par le NOUVEAU code uniquement. Corps identique
--    à la v1 (20260715090000) avec UNE addition : origin_city rejoint le bloc
--    géographique, sous le code stable EXISTANT
--    ONBOARDING_INCOMPLETE_LOCATION. La v1 et le prédicat partagé restent
--    INTACTS (compatibilité de déploiement, cf. en-tête). L'idempotence est
--    INCHANGÉE : un membre déjà finalisé (marqueur posé) reçoit le premier
--    horodatage SANS revalidation — les profils historiques sans origin_city
--    ne sont jamais re-bloqués.
-- ---------------------------------------------------------------------------
create or replace function public.complete_member_onboarding_v2()
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

  -- Erreurs par exigence (mêmes règles que la v1, messages stables).
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
  -- Bloc géographique v2 : origine (pays + ville) PUIS résidence (pays +
  -- ville + région). origin_city est la SEULE addition par rapport à la v1.
  if coalesce(pg_catalog.btrim(v_profile.origin_country), '') = ''
     or coalesce(pg_catalog.btrim(v_profile.origin_city), '') = ''
     or coalesce(pg_catalog.btrim(v_profile.country), '') = ''
     or coalesce(pg_catalog.btrim(v_profile.city), '') = ''
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

  -- Garde-fou final : le prédicat partagé (INCHANGÉ, sans origin_city — la
  -- nouvelle exigence est déjà couverte par le contrôle explicite ci-dessus).
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

-- Privilèges : mêmes garanties que la v1 (EXECUTE minimal).
revoke all on function public.complete_member_onboarding_v2() from public;
revoke all on function public.complete_member_onboarding_v2() from anon;
grant execute on function public.complete_member_onboarding_v2() to authenticated;
