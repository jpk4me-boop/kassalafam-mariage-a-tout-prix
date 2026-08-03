-- =============================================================================
-- KASSALAFAM — MARIAGE À TOUT PRIX
-- Migration : numéro WhatsApp OBLIGATOIRE + consentement AUTOMATIQUE
-- Date      : 2026-08-03 (soir — version > 20260803220000, règle du §3)
--
-- Objet     : rendre les notifications WhatsApp réellement systématiques.
--             Constat production du 03/08 : 1 seul profil actif sur 17 avait
--             renseigné son numéro (champ facultatif depuis la migration 52) —
--             le canal ne pouvait donc atteindre personne.
--
--             1. Le numéro WhatsApp devient une EXIGENCE du parcours
--                d'inscription (étape « Identité »), au même titre que la
--                religion (migration 20260715090000, patron repris à
--                l'identique) :
--                  - public.profile_meets_onboarding_requirements exige
--                    whatsapp_phone non vide ;
--                  - public.complete_member_onboarding_v2 refuse la
--                    finalisation avec l'erreur stable
--                    ONBOARDING_INCOMPLETE_WHATSAPP.
--
--             2. Le CONSENTEMENT devient AUTOMATIQUE : dès qu'un numéro est
--                enregistré, la base pose elle-même le consentement 'whatsapp'.
--                Le membre n'a plus aucun geste à faire — les notifications
--                font partie du service.
--                ⚠️ Un retrait EXPLICITE reste respecté : le trigger utilise
--                ON CONFLICT DO NOTHING, donc une ligne existante (même avec
--                withdrawn_at posé) n'est JAMAIS réécrite. Un membre qui a
--                coupé les notifications ne les voit pas se rallumer seul.
--
-- Compatibilité des profils déjà finalisés (stratégie DOUCE, identique à la
--             migration religion) : un membre dont onboarding_completed_at est
--             posé n'est JAMAIS re-bloqué — le routage ne regarde que le
--             marqueur et la RPC idempotente renvoie le premier horodatage
--             sans revalider. Seul le bandeau « Profil incomplet » l'invitera
--             à compléter son numéro.
--
-- Sécurité  : migration ADDITIVE. AUCUNE donnée modifiée, AUCUN backfill : les
--             consentements des membres existants ayant déjà un numéro seront
--             posés séparément, sur GO explicite et après comptage annoncé.
--             Aucune colonne ajoutée (whatsapp_phone existe depuis la migr. 52,
--             son CHECK de format est inchangé et NULL reste permis en base —
--             c'est le parcours d'inscription qui exige la valeur).
--             Idempotente : CREATE OR REPLACE / DROP TRIGGER IF EXISTS.
--
-- ⚠️ À NE PAS appliquer automatiquement : attendre le GO explicite.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Prédicat interne — REMPLACÉ à l'identique de la définition courante avec
--    UNE addition : l'étape « Identité » exige désormais le numéro WhatsApp.
--    Miroir de `computeStepCompletion` côté application.
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
    p_profile.acquisition_source_recorded_at is not null
    and coalesce(pg_catalog.btrim(p_profile.first_name), '') <> ''
    and p_profile.gender is not null
    -- Numéro WhatsApp requis (canal de notification du service).
    and coalesce(pg_catalog.btrim(p_profile.whatsapp_phone), '') <> ''
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

-- Prédicat interne : jamais une API métier (réaffirmé à l'identique).
revoke all on function public.profile_meets_onboarding_requirements(public.profiles) from public;
revoke all on function public.profile_meets_onboarding_requirements(public.profiles) from anon;
revoke all on function public.profile_meets_onboarding_requirements(public.profiles) from authenticated;

-- ---------------------------------------------------------------------------
-- 2. RPC de finalisation — REMPLACÉE à l'identique de la définition courante
--    avec UNE addition : refus ONBOARDING_INCOMPLETE_WHATSAPP. L'idempotence
--    est INCHANGÉE (un profil déjà finalisé n'est jamais revalidé).
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
  if not public.current_account_is_not_suspended() then
    raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501';
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

  if v_profile.acquisition_source_recorded_at is null then
    raise exception 'ONBOARDING_INCOMPLETE_ACQUISITION';
  end if;
  if coalesce(pg_catalog.btrim(v_profile.first_name), '') = '' then
    raise exception 'ONBOARDING_INCOMPLETE_FIRST_NAME';
  end if;
  if v_profile.gender is null then
    raise exception 'ONBOARDING_INCOMPLETE_GENDER';
  end if;
  -- Numéro WhatsApp requis (canal de notification du service).
  if coalesce(pg_catalog.btrim(v_profile.whatsapp_phone), '') = '' then
    raise exception 'ONBOARDING_INCOMPLETE_WHATSAPP';
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

  -- Garde-fou final : la source de vérité partagée.
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

-- Privilèges réaffirmés à l'identique.
revoke all on function public.complete_member_onboarding_v2() from public;
revoke all on function public.complete_member_onboarding_v2() from anon;
grant execute on function public.complete_member_onboarding_v2() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Consentement AUTOMATIQUE dès qu'un numéro est enregistré ------------------
--    Les notifications font partie du service : le membre n'a aucun geste à
--    faire. Le trigger ne crée la ligne que si AUCUNE n'existe encore pour
--    (membre, 'whatsapp') — un retrait explicite reste donc définitif tant que
--    le membre ne réactive pas lui-même (RPC grant_my_whatsapp_notifications).
-- ---------------------------------------------------------------------------
create or replace function public.auto_grant_whatsapp_consent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(pg_catalog.btrim(new.whatsapp_phone), '') = '' then
    return new;
  end if;

  insert into public.notification_channel_consents (profile_id, channel)
  values (new.id, 'whatsapp')
  on conflict (profile_id, channel) do nothing;

  return new;
end;
$$;

comment on function public.auto_grant_whatsapp_consent() is
  'Pose le consentement WhatsApp dès qu''un numéro est enregistré : les '
  'notifications font partie du service, le membre n''a aucun geste à faire. '
  'ON CONFLICT DO NOTHING : un retrait explicite du membre n''est JAMAIS '
  'annulé par ce trigger.';

drop trigger if exists trg_profiles_auto_grant_whatsapp_consent on public.profiles;
create trigger trg_profiles_auto_grant_whatsapp_consent
  after insert or update of whatsapp_phone on public.profiles
  for each row execute function public.auto_grant_whatsapp_consent();
