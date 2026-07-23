-- =============================================================================
-- KASSALAFAM — B1b — Intégrité des champs d'identité
-- =============================================================================
-- Objectifs :
--   * âge minimum de 18 ans en défense en profondeur ;
--   * genre/date de naissance modifiables par le membre uniquement avant la
--     finalisation de l'onboarding ;
--   * correction exceptionnelle transactionnelle, réservée au service_role et
--     appelée côté serveur après garde SUPER_ADMIN_USER_IDS ;
--   * audit append-only des valeurs avant/après ;
--   * aucun backfill, aucune donnée applicative modifiée par la migration.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A. ÂGE MINIMUM — contrainte additive, validée après contrôle des données.
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1
      from public.profiles
     where birth_date is not null
       and birth_date > (current_date - interval '18 years')::date
  ) then
    raise exception 'PROFILE_IDENTITY_MIGRATION_UNDERAGE_DATA'
      using errcode = '23514';
  end if;
end;
$$;

alter table public.profiles
  drop constraint if exists profiles_birth_date_adult;

alter table public.profiles
  add constraint profiles_birth_date_adult
  check (
    birth_date is null
    or birth_date <= (current_date - interval '18 years')::date
  ) not valid;

alter table public.profiles
  validate constraint profiles_birth_date_adult;

-- -----------------------------------------------------------------------------
-- B. CONTEXTE PRIVÉ DE CORRECTION
--    Une ligne éphémère par transaction. Le schéma n'est utilisable par aucun
--    rôle API ; seules les fonctions SECURITY DEFINER propriétaires y accèdent.
--    Toute erreur annule automatiquement contexte, UPDATE et audit.
-- -----------------------------------------------------------------------------
create schema if not exists kassalafam_private;

revoke all on schema kassalafam_private from public;
revoke all on schema kassalafam_private from anon;
revoke all on schema kassalafam_private from authenticated;
revoke all on schema kassalafam_private from service_role;

create table if not exists kassalafam_private.profile_identity_correction_context (
  transaction_id   bigint primary key,
  actor_id          uuid not null,
  target_profile_id uuid not null,
  created_at        timestamptz not null default pg_catalog.clock_timestamp(),
  constraint profile_identity_context_not_self
    check (actor_id <> target_profile_id)
);

revoke all on table kassalafam_private.profile_identity_correction_context
  from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- C. GARDE TRIGGER DES CHAMPS D'IDENTITÉ
-- -----------------------------------------------------------------------------
create or replace function public.guard_profile_identity_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_has_correction_context boolean;
begin
  -- NULL reste autorisé lors de l'inscription progressive ; une date renseignée
  -- doit déjà respecter l'âge minimum.
  if tg_op = 'INSERT' then
    if new.birth_date is not null
       and new.birth_date > (current_date - interval '18 years')::date
    then
      raise exception 'PROFILE_MINIMUM_AGE_REQUIRED' using errcode = '22023';
    end if;
    return new;
  end if;

  -- Les mises à jour d'autres champs restent inchangées.
  if new.gender is not distinct from old.gender
     and new.birth_date is not distinct from old.birth_date
  then
    return new;
  end if;

  if new.birth_date is not null
     and new.birth_date > (current_date - interval '18 years')::date
  then
    raise exception 'PROFILE_MINIMUM_AGE_REQUIRED' using errcode = '22023';
  end if;

  -- Bypass administratif exclusivement matérialisé par une ligne privée créée
  -- dans LA MÊME transaction par admin_correct_profile_identity_fields().
  select exists (
    select 1
      from kassalafam_private.profile_identity_correction_context c
     where c.transaction_id = pg_catalog.txid_current()
       and c.target_profile_id = new.id
       and c.actor_id <> new.id
  ) into v_has_correction_context;

  if v_has_correction_context then
    return new;
  end if;

  -- Le propriétaire peut compléter/corriger son identité tant que le parcours
  -- n'a pas été finalisé.
  if auth.uid() is not null and auth.uid() = old.id then
    if old.onboarding_completed_at is null then
      return new;
    end if;

    raise exception 'PROFILE_IDENTITY_FIELDS_LOCKED' using errcode = '42501';
  end if;

  -- Inclut les UPDATE directs service_role/postgres et toute session sans JWT.
  raise exception 'PROFILE_IDENTITY_CORRECTION_CONTEXT_REQUIRED'
    using errcode = '42501';
end;
$$;

revoke all on function public.guard_profile_identity_fields()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_profiles_guard_identity_fields on public.profiles;
create trigger trg_profiles_guard_identity_fields
  before insert or update on public.profiles
  for each row execute function public.guard_profile_identity_fields();

-- -----------------------------------------------------------------------------
-- D. EXTENSION DU JOURNAL APPEND-ONLY
-- -----------------------------------------------------------------------------
alter table public.admin_audit_log
  add column if not exists previous_values jsonb,
  add column if not exists new_values jsonb;

alter table public.admin_audit_log
  drop constraint if exists admin_audit_log_action_type_valid;

alter table public.admin_audit_log
  add constraint admin_audit_log_action_type_valid check (
    action_type in ('verification_set', 'profile_identity_corrected')
  );

alter table public.admin_audit_log
  drop constraint if exists admin_audit_log_payload_coherence;

alter table public.admin_audit_log
  add constraint admin_audit_log_payload_coherence check (
    (
      action_type = 'verification_set'
      and previous_values is null
      and new_values is null
    )
    or
    (
      action_type = 'profile_identity_corrected'
      and previous_status is null
      and new_status is null
      and reason is not null
      and char_length(pg_catalog.btrim(reason)) between 10 and 2000
      and pg_catalog.jsonb_typeof(previous_values) = 'object'
      and pg_catalog.jsonb_typeof(new_values) = 'object'
      and previous_values ? 'gender'
      and previous_values ? 'birth_date'
      and new_values ? 'gender'
      and new_values ? 'birth_date'
      and previous_values - array['gender', 'birth_date'] = '{}'::jsonb
      and new_values - array['gender', 'birth_date'] = '{}'::jsonb
      and new_values ->> 'gender' in ('homme', 'femme')
      and nullif(new_values ->> 'birth_date', '') is not null
    )
  );

create or replace function public.admin_audit_log_no_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'ADMIN_AUDIT_LOG_APPEND_ONLY' using errcode = '42501';
  end if;

  if pg_trigger_depth() > 1
     and new.id                         is not distinct from old.id
     and new.action_type                is not distinct from old.action_type
     and new.actor_email_snapshot       is not distinct from old.actor_email_snapshot
     and new.target_profile_id_snapshot is not distinct from old.target_profile_id_snapshot
     and new.previous_status            is not distinct from old.previous_status
     and new.new_status                 is not distinct from old.new_status
     and new.previous_values            is not distinct from old.previous_values
     and new.new_values                 is not distinct from old.new_values
     and new.reason                     is not distinct from old.reason
     and new.created_at                 is not distinct from old.created_at
     and (
       new.actor_id is not distinct from old.actor_id
       or (old.actor_id is not null and new.actor_id is null)
     )
     and (
       new.target_profile_id is not distinct from old.target_profile_id
       or (old.target_profile_id is not null and new.target_profile_id is null)
     )
     and (
          (old.actor_id          is not null and new.actor_id          is null)
       or (old.target_profile_id is not null and new.target_profile_id is null)
     )
  then
    return new;
  end if;

  raise exception 'ADMIN_AUDIT_LOG_APPEND_ONLY' using errcode = '42501';
end;
$$;

revoke all on function public.admin_audit_log_no_mutation()
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- E. RPC TRANSACTIONNELLE DE CORRECTION D'IDENTITÉ
--    Le contrôle Super Admin reste côté serveur via resolveSuperAdminActor().
-- -----------------------------------------------------------------------------
create or replace function public.admin_correct_profile_identity_fields(
  p_profile_id uuid,
  p_gender text,
  p_birth_date date,
  p_reason text,
  p_actor_id uuid
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile        public.profiles%rowtype;
  v_updated        public.profiles%rowtype;
  v_gender         public.gender;
  v_birth_date     date;
  v_reason         text;
  v_actor_email    text;
  v_transaction_id bigint;
begin
  if p_profile_id is null then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_actor_id is null then
    raise exception 'ACTOR_NOT_FOUND' using errcode = '22023';
  end if;

  if p_actor_id = p_profile_id then
    raise exception 'SELF_IDENTITY_CORRECTION_FORBIDDEN' using errcode = '42501';
  end if;

  v_reason := nullif(pg_catalog.btrim(coalesce(p_reason, '')), '');
  if v_reason is null then
    raise exception 'IDENTITY_CORRECTION_REASON_REQUIRED' using errcode = '22023';
  end if;
  if char_length(v_reason) < 10 or char_length(v_reason) > 2000 then
    raise exception 'IDENTITY_CORRECTION_REASON_LENGTH_INVALID'
      using errcode = '22023';
  end if;

  if p_gender is not null and p_gender not in ('homme', 'femme') then
    raise exception 'INVALID_GENDER' using errcode = '22023';
  end if;

  select u.email
    into v_actor_email
    from auth.users u
   where u.id = p_actor_id;

  if not found then
    raise exception 'ACTOR_NOT_FOUND' using errcode = '22023';
  end if;

  select *
    into v_profile
    from public.profiles
   where id = p_profile_id
   for update;

  if not found then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_gender := case
    when p_gender is null then v_profile.gender
    else p_gender::public.gender
  end;
  v_birth_date := coalesce(p_birth_date, v_profile.birth_date);

  if v_gender is null then
    raise exception 'INVALID_GENDER' using errcode = '22023';
  end if;

  if v_birth_date is null
     or v_birth_date > (current_date - interval '18 years')::date
  then
    raise exception 'PROFILE_MINIMUM_AGE_REQUIRED' using errcode = '22023';
  end if;

  if v_gender is not distinct from v_profile.gender
     and v_birth_date is not distinct from v_profile.birth_date
  then
    raise exception 'IDENTITY_CORRECTION_NO_CHANGE' using errcode = '22023';
  end if;

  v_transaction_id := pg_catalog.txid_current();

  insert into kassalafam_private.profile_identity_correction_context (
    transaction_id, actor_id, target_profile_id
  ) values (
    v_transaction_id, p_actor_id, p_profile_id
  );

  update public.profiles
     set gender = v_gender,
         birth_date = v_birth_date
   where id = p_profile_id
   returning * into v_updated;

  delete from kassalafam_private.profile_identity_correction_context
   where transaction_id = v_transaction_id;

  insert into public.admin_audit_log (
    action_type,
    actor_id,
    actor_email_snapshot,
    target_profile_id,
    target_profile_id_snapshot,
    previous_status,
    new_status,
    previous_values,
    new_values,
    reason
  ) values (
    'profile_identity_corrected',
    p_actor_id,
    v_actor_email,
    p_profile_id,
    p_profile_id,
    null,
    null,
    pg_catalog.jsonb_build_object(
      'gender', v_profile.gender::text,
      'birth_date', v_profile.birth_date
    ),
    pg_catalog.jsonb_build_object(
      'gender', v_updated.gender::text,
      'birth_date', v_updated.birth_date
    ),
    v_reason
  );

  return v_updated;
end;
$$;

revoke all on function public.admin_correct_profile_identity_fields(
  uuid, text, date, text, uuid
) from public, anon, authenticated;

grant execute on function public.admin_correct_profile_identity_fields(
  uuid, text, date, text, uuid
) to service_role;