-- =============================================================================
-- PR B1a — Nouvelle source d'acquisition « Événement ou communauté ».
--
-- Ajoute la valeur `event_community` au canal d'acquisition déclaré
-- (profiles.acquisition_source) :
--   1. CHECK `profiles_acquisition_source_check` recréé (DROP + ADD, pattern
--      habituel) avec la liste existante + 'event_community' ;
--   2. RPC `public.record_acquisition_source` recréée À PARTIR DE SA VERSION
--      COURANTE (migration 20260719003000, enforcement suspension) — le SEUL
--      changement métier est l'acceptation de 'event_community' dans la liste
--      des sources valides. Garde suspension, write-once, codes d'erreur,
--      SECURITY DEFINER, search_path vide : inchangés.
--
-- Volontairement INCHANGÉS :
--   - trigger `trg_profiles_guard_acquisition_fields` / fonction
--     `guard_profile_acquisition_fields` : aucune liste de valeurs codée en
--     dur (la garde vérifie le propriétaire de la RPC), rien à toucher ;
--   - contrainte `profiles_acquisition_source_other_check` (inchangée :
--     'event_community' se comporte comme toute source ≠ 'other') ;
--   - ACL de la RPC : CREATE OR REPLACE préserve les grants existants
--     (EXECUTE authenticated uniquement, posés par 20260706120000).
--
-- Compatibilité historique : additive pure. Aucune ligne modifiée, aucun
-- backfill, valeurs existantes (dont NULL) toujours valides, write-once
-- intact.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. CHECK : liste des sources valides + 'event_community'.
-- ---------------------------------------------------------------------------
alter table public.profiles
  drop constraint if exists profiles_acquisition_source_check;
alter table public.profiles
  add constraint profiles_acquisition_source_check
  check (
    acquisition_source is null
    or acquisition_source in (
      'tiktok',
      'instagram',
      'facebook',
      'youtube',
      'whatsapp_recommendation',
      'google',
      'event_community',
      'other'
    )
  );

-- ---------------------------------------------------------------------------
-- 2. RPC write-once — copie exacte de la version 20260719003000, plus
--    'event_community' dans la liste des sources acceptées.
-- ---------------------------------------------------------------------------
create or replace function public.record_acquisition_source(
  p_source text,
  p_other text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_other text;
  v_existing_source text;
  v_existing_other text;
  v_existing_at timestamptz;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not public.current_account_is_not_suspended() then
    raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501';
  end if;

  if p_source not in (
    'tiktok', 'instagram', 'facebook', 'youtube',
    'whatsapp_recommendation', 'google', 'event_community', 'other'
  ) then
    raise exception 'invalid acquisition source' using errcode = '22023';
  end if;

  if p_source = 'other' then
    v_other := btrim(p_other);
    if v_other is null or v_other = '' then
      raise exception 'acquisition detail required for source other'
        using errcode = '22023';
    end if;
    if char_length(v_other) > 120 then
      raise exception 'acquisition detail too long' using errcode = '22023';
    end if;
  else
    if p_other is not null and btrim(p_other) <> '' then
      raise exception 'acquisition detail not allowed for this source'
        using errcode = '22023';
    end if;
    v_other := null;
  end if;

  select acquisition_source, acquisition_source_other, acquisition_source_recorded_at
    into v_existing_source, v_existing_other, v_existing_at
    from public.profiles
    where id = v_uid
    for update;

  if not found then
    begin
      insert into public.profiles (
        id, acquisition_source, acquisition_source_other, acquisition_source_recorded_at
      )
      values (v_uid, p_source, v_other, now());
      return 'recorded';
    exception when unique_violation then
      select acquisition_source, acquisition_source_other, acquisition_source_recorded_at
        into v_existing_source, v_existing_other, v_existing_at
        from public.profiles
        where id = v_uid
        for update;
    end;
  end if;

  if v_existing_at is not null then
    if v_existing_source is not distinct from p_source
       and v_existing_other is not distinct from v_other then
      return 'unchanged';
    end if;
    return 'already_recorded';
  end if;

  update public.profiles
    set acquisition_source = p_source,
        acquisition_source_other = v_other,
        acquisition_source_recorded_at = now()
    where id = v_uid;

  return 'recorded';
end;
$$;
