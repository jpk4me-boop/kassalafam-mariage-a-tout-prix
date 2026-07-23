-- =============================================================================
-- Suite pgTAP — B1b — Intégrité des champs d'identité.
-- Cibles : contrainte adulte, garde membre/post-onboarding, anti-bypass
-- service_role, RPC transactionnelle, journal append-only et atomicité.
-- =============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set search_path = extensions, public, pg_catalog;

-- -----------------------------------------------------------------------------
-- Helpers de capture (supprimés au ROLLBACK).
-- -----------------------------------------------------------------------------
create function public._identity_as_member(p_uid uuid, p_sql text)
returns void
language plpgsql
as $$
declare
  v_rows bigint;
begin
  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text,
    true
  );
  begin
    execute p_sql;
    get diagnostics v_rows = row_count;
    perform set_config('test.rows', v_rows::text, true);
    perform set_config('test.state', '', true);
    perform set_config('test.err', '', true);
  exception when others then
    perform set_config('test.rows', '', true);
    perform set_config('test.state', sqlstate, true);
    perform set_config('test.err', sqlerrm, true);
  end;
  reset role;
end;
$$;

create function public._identity_as_service(p_sql text)
returns void
language plpgsql
as $$
declare
  v_rows bigint;
begin
  set local role service_role;
  perform set_config('request.jwt.claims', '{}', true);
  begin
    execute p_sql;
    get diagnostics v_rows = row_count;
    perform set_config('test.rows', v_rows::text, true);
    perform set_config('test.state', '', true);
    perform set_config('test.err', '', true);
  exception when others then
    perform set_config('test.rows', '', true);
    perform set_config('test.state', sqlstate, true);
    perform set_config('test.err', sqlerrm, true);
  end;
  reset role;
end;
$$;

create function public._identity_rpc(
  p_profile_id uuid,
  p_gender text,
  p_birth_date date,
  p_reason text,
  p_actor_id uuid
)
returns void
language plpgsql
as $$
declare
  v_profile public.profiles%rowtype;
begin
  set local role service_role;
  perform set_config('request.jwt.claims', '{}', true);
  begin
    select *
      into v_profile
      from public.admin_correct_profile_identity_fields(
        p_profile_id,
        p_gender,
        p_birth_date,
        p_reason,
        p_actor_id
      );

    perform set_config('test.gender', coalesce(v_profile.gender::text, ''), true);
    perform set_config('test.birth_date', coalesce(v_profile.birth_date::text, ''), true);
    perform set_config('test.state', '', true);
    perform set_config('test.err', '', true);
  exception when others then
    perform set_config('test.gender', '', true);
    perform set_config('test.birth_date', '', true);
    perform set_config('test.state', sqlstate, true);
    perform set_config('test.err', sqlerrm, true);
  end;
  reset role;
end;
$$;

-- -----------------------------------------------------------------------------
-- Fixtures.
-- -----------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000b101', 'identity-actor@ex.test'),
  ('00000000-0000-0000-0000-00000000b102', 'identity-incomplete@ex.test'),
  ('00000000-0000-0000-0000-00000000b103', 'identity-complete@ex.test'),
  ('00000000-0000-0000-0000-00000000b104', 'identity-cross@ex.test'),
  ('00000000-0000-0000-0000-00000000b105', 'identity-rpc@ex.test'),
  ('00000000-0000-0000-0000-00000000b106', 'identity-atomic@ex.test'),
  ('00000000-0000-0000-0000-00000000b107', 'identity-exact18@ex.test'),
  ('00000000-0000-0000-0000-00000000b108', 'identity-underage@ex.test');

insert into public.profiles (id, first_name, gender, birth_date, bio) values
  ('00000000-0000-0000-0000-00000000b101', 'Acteur',    'homme', '1980-01-01', 'Acteur de test'),
  ('00000000-0000-0000-0000-00000000b102', 'Incomplet', 'homme', '1995-01-01', 'Profil incomplet'),
  ('00000000-0000-0000-0000-00000000b103', 'Finalise',  'femme', '1992-02-02', 'Profil finalisé'),
  ('00000000-0000-0000-0000-00000000b104', 'Autre',     'femme', '1993-03-03', 'Autre profil'),
  ('00000000-0000-0000-0000-00000000b105', 'RPC',       'homme', '1990-04-04', 'Cible RPC'),
  ('00000000-0000-0000-0000-00000000b106', 'Atomicite', 'homme', '1991-05-05', 'Cible atomicité');

-- La garde historique autorise le propriétaire postgres de la RPC onboarding à
-- poser le marqueur. Les champs d'identité ne changent pas pendant cette étape.
update public.profiles
   set onboarding_completed_at = pg_catalog.now()
 where id in (
   '00000000-0000-0000-0000-00000000b103',
   '00000000-0000-0000-0000-00000000b105',
   '00000000-0000-0000-0000-00000000b106'
 );

-- ============================================================================
select plan(44);
-- ============================================================================

select ok(
  exists (
    select 1
      from pg_catalog.pg_constraint
     where conname = 'profiles_birth_date_adult'
       and conrelid = 'public.profiles'::regclass
       and convalidated
  ),
  'T1 — la contrainte adulte existe et est validée'
);

select ok(
  exists (
    select 1
      from pg_catalog.pg_trigger
     where tgname = 'trg_profiles_guard_identity_fields'
       and tgrelid = 'public.profiles'::regclass
       and not tgisinternal
  ),
  'T2 — le trigger de garde identité existe'
);

select lives_ok(
  $$insert into public.profiles (id, first_name, gender, birth_date)
    values (
      '00000000-0000-0000-0000-00000000b107',
      'Exactement18',
      'homme',
      (current_date - interval '18 years')::date
    )$$,
  'T3 — une date correspondant exactement à 18 ans est acceptée'
);

select throws_ok(
  $$insert into public.profiles (id, first_name, gender, birth_date)
    values (
      '00000000-0000-0000-0000-00000000b108',
      'Mineur',
      'homme',
      (current_date - interval '17 years')::date
    )$$,
  '22023',
  'PROFILE_MINIMUM_AGE_REQUIRED',
  'T4 — une date mineure est rejetée'
);

select public._identity_as_member(
  '00000000-0000-0000-0000-00000000b102',
  $$update public.profiles
       set gender = 'femme'
     where id = '00000000-0000-0000-0000-00000000b102'$$
);
select is(current_setting('test.state', true), '',
  'T5 — le membre incomplet peut modifier son genre');

select is(
  (select gender::text from public.profiles
    where id = '00000000-0000-0000-0000-00000000b102'),
  'femme',
  'T6 — le nouveau genre incomplet est persisté'
);

select public._identity_as_member(
  '00000000-0000-0000-0000-00000000b102',
  $$update public.profiles
       set birth_date = '1994-06-06'
     where id = '00000000-0000-0000-0000-00000000b102'$$
);
select is(current_setting('test.state', true), '',
  'T7 — le membre incomplet peut modifier sa date de naissance');

select is(
  (select birth_date::text from public.profiles
    where id = '00000000-0000-0000-0000-00000000b102'),
  '1994-06-06',
  'T8 — la nouvelle date incomplète est persistée'
);

select public._identity_as_member(
  '00000000-0000-0000-0000-00000000b103',
  $$update public.profiles
       set gender = 'homme'
     where id = '00000000-0000-0000-0000-00000000b103'$$
);
select is(current_setting('test.state', true), '42501',
  'T9 — le genre d’un profil finalisé est verrouillé');
select is(current_setting('test.err', true), 'PROFILE_IDENTITY_FIELDS_LOCKED',
  'T10 — l’erreur membre finalisé est stable');

select public._identity_as_member(
  '00000000-0000-0000-0000-00000000b103',
  $$update public.profiles
       set birth_date = '1990-01-01'
     where id = '00000000-0000-0000-0000-00000000b103'$$
);
select is(current_setting('test.state', true), '42501',
  'T11 — la date d’un profil finalisé est verrouillée');
select is(current_setting('test.err', true), 'PROFILE_IDENTITY_FIELDS_LOCKED',
  'T12 — le verrou de date renvoie l’erreur stable');

select public._identity_as_service(
  $$update public.profiles
       set gender = 'homme'
     where id = '00000000-0000-0000-0000-00000000b103'$$
);
select is(current_setting('test.state', true), '42501',
  'T13 — un UPDATE service_role direct est rejeté');
select is(current_setting('test.err', true), 'PROFILE_IDENTITY_CORRECTION_CONTEXT_REQUIRED',
  'T14 — le service_role direct exige le contexte RPC');

select set_config('request.jwt.claims', '{}', true);
select throws_ok(
  $$update public.profiles
       set gender = 'homme'
     where id = '00000000-0000-0000-0000-00000000b103'$$,
  '42501',
  'PROFILE_IDENTITY_CORRECTION_CONTEXT_REQUIRED',
  'T15 — un UPDATE postgres direct sans contexte est rejeté'
);

select public._identity_as_member(
  '00000000-0000-0000-0000-00000000b103',
  $$update public.profiles
       set bio = 'Bio modifiée après finalisation'
     where id = '00000000-0000-0000-0000-00000000b103'$$
);
select is(current_setting('test.state', true), '',
  'T16 — un autre champ reste modifiable après finalisation');

select is(
  (select bio from public.profiles
    where id = '00000000-0000-0000-0000-00000000b103'),
  'Bio modifiée après finalisation',
  'T17 — la modification non identitaire est persistée'
);

select public._identity_as_member(
  '00000000-0000-0000-0000-00000000b102',
  $$update public.profiles
       set gender = 'homme'
     where id = '00000000-0000-0000-0000-00000000b104'$$
);
select is(
  (select gender::text from public.profiles
    where id = '00000000-0000-0000-0000-00000000b104'),
  'femme',
  'T18 — la RLS empêche la modification du profil d’un autre membre'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.admin_correct_profile_identity_fields(uuid, text, date, text, uuid)',
    'execute'
  ),
  'T19 — anon ne peut pas exécuter la RPC'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.admin_correct_profile_identity_fields(uuid, text, date, text, uuid)',
    'execute'
  ),
  'T20 — authenticated ne peut pas exécuter la RPC'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.admin_correct_profile_identity_fields(uuid, text, date, text, uuid)',
    'execute'
  ),
  'T21 — service_role peut exécuter la RPC'
);

select public._identity_rpc(
  '00000000-0000-0000-0000-00000000b105',
  'femme',
  null,
  'Motif de correction valide',
  '00000000-0000-0000-0000-00000000b199'
);
select is(current_setting('test.err', true), 'ACTOR_NOT_FOUND',
  'T22 — un acteur inexistant est refusé');

select public._identity_rpc(
  '00000000-0000-0000-0000-00000000b199',
  'femme',
  null,
  'Motif de correction valide',
  '00000000-0000-0000-0000-00000000b101'
);
select is(current_setting('test.err', true), 'PROFILE_NOT_FOUND',
  'T23 — une cible inexistante est refusée');

select public._identity_rpc(
  '00000000-0000-0000-0000-00000000b101',
  'femme',
  null,
  'Motif de correction valide',
  '00000000-0000-0000-0000-00000000b101'
);
select is(current_setting('test.err', true), 'SELF_IDENTITY_CORRECTION_FORBIDDEN',
  'T24 — l’auto-correction est refusée');

select public._identity_rpc(
  '00000000-0000-0000-0000-00000000b105',
  'femme',
  null,
  'trop bref',
  '00000000-0000-0000-0000-00000000b101'
);
select is(current_setting('test.err', true), 'IDENTITY_CORRECTION_REASON_LENGTH_INVALID',
  'T25 — un motif inférieur à 10 caractères est refusé');

select public._identity_rpc(
  '00000000-0000-0000-0000-00000000b105',
  'inconnu',
  null,
  'Motif de correction suffisamment long',
  '00000000-0000-0000-0000-00000000b101'
);
select is(current_setting('test.err', true), 'INVALID_GENDER',
  'T26 — un genre inconnu est refusé');

select public._identity_rpc(
  '00000000-0000-0000-0000-00000000b105',
  null,
  (current_date - interval '17 years')::date,
  'Motif de correction suffisamment long',
  '00000000-0000-0000-0000-00000000b101'
);
select is(current_setting('test.err', true), 'PROFILE_MINIMUM_AGE_REQUIRED',
  'T27 — une correction vers un âge mineur est refusée');

select public._identity_rpc(
  '00000000-0000-0000-0000-00000000b105',
  null,
  null,
  'Motif de correction suffisamment long',
  '00000000-0000-0000-0000-00000000b101'
);
select is(current_setting('test.err', true), 'IDENTITY_CORRECTION_NO_CHANGE',
  'T28 — un appel sans changement est refusé');

select public._identity_rpc(
  '00000000-0000-0000-0000-00000000b105',
  'femme',
  null,
  'Correction du genre uniquement',
  '00000000-0000-0000-0000-00000000b101'
);
select is(current_setting('test.state', true), '',
  'T29 — la correction du genre seul réussit');
select is(
  (select gender::text from public.profiles
    where id = '00000000-0000-0000-0000-00000000b105'),
  'femme',
  'T30 — le genre corrigé est persisté'
);

select public._identity_rpc(
  '00000000-0000-0000-0000-00000000b105',
  null,
  '1989-07-07',
  'Correction de la date uniquement',
  '00000000-0000-0000-0000-00000000b101'
);
select is(current_setting('test.state', true), '',
  'T31 — la correction de la date seule réussit');
select is(
  (select birth_date::text from public.profiles
    where id = '00000000-0000-0000-0000-00000000b105'),
  '1989-07-07',
  'T32 — la date corrigée est persistée'
);

select public._identity_rpc(
  '00000000-0000-0000-0000-00000000b105',
  'homme',
  '1988-08-08',
  '   Correction complète vérifiée   ',
  '00000000-0000-0000-0000-00000000b101'
);
select is(current_setting('test.state', true), '',
  'T33 — la correction des deux champs réussit');
select is(
  (
    select gender::text || '|' || birth_date::text
      from public.profiles
     where id = '00000000-0000-0000-0000-00000000b105'
  ),
  'homme|1988-08-08',
  'T34 — les deux valeurs corrigées sont persistées'
);

select is(
  (
    select count(*)::integer
      from public.admin_audit_log
     where action_type = 'profile_identity_corrected'
       and target_profile_id_snapshot =
         '00000000-0000-0000-0000-00000000b105'
  ),
  3,
  'T35 — chaque correction réussie crée exactement une ligne d’audit'
);

select is(
  (
    select actor_email_snapshot || '|' || reason
      from public.admin_audit_log
     where action_type = 'profile_identity_corrected'
       and target_profile_id_snapshot =
         '00000000-0000-0000-0000-00000000b105'
       and reason = 'Correction complète vérifiée'
  ),
  'identity-actor@ex.test|Correction complète vérifiée',
  'T36 — acteur, email et motif normalisé sont journalisés'
);

select is(
  (
    select previous_values
      from public.admin_audit_log
     where action_type = 'profile_identity_corrected'
       and target_profile_id_snapshot =
         '00000000-0000-0000-0000-00000000b105'
       and reason = 'Correction complète vérifiée'
  ),
  jsonb_build_object('gender', 'femme', 'birth_date', '1989-07-07'::date),
  'T37 — le JSON avant correction est exact'
);

select is(
  (
    select new_values
      from public.admin_audit_log
     where action_type = 'profile_identity_corrected'
       and target_profile_id_snapshot =
         '00000000-0000-0000-0000-00000000b105'
       and reason = 'Correction complète vérifiée'
  ),
  jsonb_build_object('gender', 'homme', 'birth_date', '1988-08-08'::date),
  'T38 — le JSON après correction est exact'
);

select throws_ok(
  $$update public.admin_audit_log
       set new_values = '{}'::jsonb
     where action_type = 'profile_identity_corrected'
       and target_profile_id_snapshot =
         '00000000-0000-0000-0000-00000000b105'$$,
  '42501',
  'ADMIN_AUDIT_LOG_APPEND_ONLY',
  'T39 — la charge JSON du journal reste immuable'
);

create function public._identity_fail_audit()
returns trigger
language plpgsql
as $$
begin
  if new.action_type = 'profile_identity_corrected'
     and new.target_profile_id_snapshot =
       '00000000-0000-0000-0000-00000000b106'
  then
    raise exception 'TEST_AUDIT_FAILURE';
  end if;
  return new;
end;
$$;

create trigger trg_identity_test_fail_audit
  before insert on public.admin_audit_log
  for each row execute function public._identity_fail_audit();

select public._identity_rpc(
  '00000000-0000-0000-0000-00000000b106',
  'femme',
  null,
  'Correction devant échouer à l audit',
  '00000000-0000-0000-0000-00000000b101'
);

drop trigger trg_identity_test_fail_audit on public.admin_audit_log;

select is(current_setting('test.err', true), 'TEST_AUDIT_FAILURE',
  'T40 — une erreur d’audit annule la RPC');

select is(
  (
    select gender::text || '|' || birth_date::text
      from public.profiles
     where id = '00000000-0000-0000-0000-00000000b106'
  ),
  'homme|1991-05-05',
  'T41 — aucune modification partielle ne subsiste'
);

select is(
  (
    select count(*)::integer
      from public.admin_audit_log
     where action_type = 'profile_identity_corrected'
       and target_profile_id_snapshot =
         '00000000-0000-0000-0000-00000000b106'
  ),
  0,
  'T42 — aucune ligne d’audit partielle ne subsiste'
);

select ok(
  not has_schema_privilege('service_role', 'kassalafam_private', 'usage')
  and not has_table_privilege(
    'service_role',
    'kassalafam_private.profile_identity_correction_context',
    'insert'
  ),
  'T43 — le service_role ne peut pas fabriquer le contexte privé'
);

select is(
  (
    select count(*)::integer
      from kassalafam_private.profile_identity_correction_context
  ),
  0,
  'T44 — aucun contexte transactionnel résiduel ne subsiste'
);

select * from finish();
rollback;