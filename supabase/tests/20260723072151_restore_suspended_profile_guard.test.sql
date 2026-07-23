-- =============================================================================
-- pgTAP — Hotfix : restauration de la garde ACCOUNT_SUSPENDED dans
-- guard_profiles_admin_fields(), sans régression Premium ni modération.
--
-- À exécuter uniquement sur une base jetable reconstruite depuis les migrations.
-- Transaction unique + ROLLBACK : aucune fixture conservée.
-- =============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set search_path = extensions, public, pg_catalog;

create function public._rsg_as(p_sub uuid, p_sql text)
returns text
language plpgsql
as $$
begin
  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_sub, 'role', 'authenticated')::text,
    true
  );
  begin
    execute p_sql;
    perform set_config('test.err', '', true);
    perform set_config('test.state', '', true);
  exception when others then
    perform set_config('test.err', sqlerrm, true);
    perform set_config('test.state', sqlstate, true);
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return current_setting('test.state', true);
end;
$$;

-- Fixtures 100 % fictives.
insert into auth.users (id, email) values
  ('00000000-0000-0000-1a00-000000000001', 'rsg-admin@ex.test'),
  ('00000000-0000-0000-1a00-00000000000a', 'rsg-actif@ex.test'),
  ('00000000-0000-0000-1b00-00000000000b', 'rsg-suspendu@ex.test'),
  ('00000000-0000-0000-1c00-00000000000c', 'rsg-cible@ex.test');

insert into public.profiles (
  id, first_name, gender, birth_date, country, city, marital_status,
  discovery_universe, verification_status, account_status,
  suspended_at, suspended_by, suspension_reason
) values
  (
    '00000000-0000-0000-1a00-00000000000a', 'Actif', 'homme', '1990-01-01',
    'Cameroun', 'Douala', 'celibataire', 'christian_marriage', 'approved', 'active',
    null, null, null
  ),
  (
    '00000000-0000-0000-1b00-00000000000b', 'Suspendue', 'femme', '1992-02-02',
    'Cameroun', 'Douala', 'celibataire', 'christian_marriage', 'approved', 'suspended',
    now(), '00000000-0000-0000-1a00-000000000001', 'Suspension de test valide.'
  ),
  (
    '00000000-0000-0000-1c00-00000000000c', 'Cible', 'femme', '1994-04-04',
    'Cameroun', 'Yaoundé', 'celibataire', 'christian_marriage', 'approved', 'active',
    null, null, null
  );

select plan(31);

-- ---------------------------------------------------------------------------
-- Structure : fonction, trigger et contenu de la définition.
-- Les assertions T3–T6 sont le tripwire structurel : toute future migration
-- (Premium ou autre) qui recrée guard_profiles_admin_fields() sans conserver
-- la garde ACCOUNT_SUSPENDED après le bloc Premium fait échouer cette suite.
-- ---------------------------------------------------------------------------
select has_function('public', 'guard_profiles_admin_fields', array[]::text[],
  'T1 — la fonction guard_profiles_admin_fields est présente');

select ok(
  exists (
    select 1 from pg_trigger
    where tgrelid = 'public.profiles'::regclass
      and tgname = 'trg_profiles_guard_admin_fields'
      and not tgisinternal
      and tgenabled = 'O'
  ),
  'T2 — le trigger trg_profiles_guard_admin_fields est présent et actif'
);

select ok(
  position('ACCOUNT_SUSPENDED' in pg_get_functiondef(
    'public.guard_profiles_admin_fields()'::regprocedure
  )) > 0,
  'T3 — la définition contient la garde ACCOUNT_SUSPENDED'
);

select ok(
  position('new.is_premium is distinct from old.is_premium'
    in pg_get_functiondef('public.guard_profiles_admin_fields()'::regprocedure)
  ) > 0,
  'T4 — la définition conserve la protection Premium de is_premium'
);

select ok(
  position('pg_trigger_depth() <= 1'
    in pg_get_functiondef('public.guard_profiles_admin_fields()'::regprocedure)
  ) > 0,
  'T5 — la définition conserve l’exception des triggers Premium imbriqués'
);

select ok(
  position('ACCOUNT_SUSPENDED' in pg_get_functiondef(
    'public.guard_profiles_admin_fields()'::regprocedure
  ))
  >
  position('pg_trigger_depth() <= 1' in pg_get_functiondef(
    'public.guard_profiles_admin_fields()'::regprocedure
  )),
  'T6 — la garde ACCOUNT_SUSPENDED suit bien le bloc Premium (ordre du contrat)'
);

-- ---------------------------------------------------------------------------
-- Session membre suspendue : plus aucun UPDATE direct du profil.
-- ---------------------------------------------------------------------------
select is(public._rsg_as('00000000-0000-0000-1b00-00000000000b',
  $$update public.profiles set bio='Tentative interdite'
    where id='00000000-0000-0000-1b00-00000000000b'$$),
  '42501', 'T7 — UPDATE de bio par la session suspendue refusé (SQLSTATE 42501)');

select is(current_setting('test.err', true), 'ACCOUNT_SUSPENDED',
  'T8 — le refus porte exactement le message ACCOUNT_SUSPENDED');

select is(
  (select bio from public.profiles where id='00000000-0000-0000-1b00-00000000000b'),
  null, 'T9 — le profil suspendu est resté inchangé après l’échec');

-- ---------------------------------------------------------------------------
-- Session membre active : comportement historique conservé.
-- ---------------------------------------------------------------------------
select is(public._rsg_as('00000000-0000-0000-1a00-00000000000a',
  $$update public.profiles set bio='Modification autorisée'
    where id='00000000-0000-0000-1a00-00000000000a'$$),
  '', 'T10 — UPDATE de bio par un membre actif autorisé');

select is(
  (select bio from public.profiles where id='00000000-0000-0000-1a00-00000000000a'),
  'Modification autorisée', 'T11 — la modification du membre actif est persistée');

select is(public._rsg_as('00000000-0000-0000-1a00-00000000000a',
  $$update public.profiles set account_status='suspended'
    where id='00000000-0000-0000-1a00-00000000000a'$$),
  '42501', 'T12 — modification directe de account_status refusée au membre');

select is(current_setting('test.err', true), 'PROFILE_ADMIN_FIELDS_READ_ONLY',
  'T13 — le verrou des champs administratifs reste actif');

select is(public._rsg_as('00000000-0000-0000-1a00-00000000000a',
  $$update public.profiles set is_premium=true
    where id='00000000-0000-0000-1a00-00000000000a'$$),
  '42501', 'T14 — modification directe de is_premium refusée au membre');

select is(current_setting('test.err', true), 'PROFILE_ADMIN_FIELDS_READ_ONLY',
  'T15 — is_premium reste protégé par l’erreur stable');

-- ---------------------------------------------------------------------------
-- Opérations privilégiées (auth.uid() NULL — service_role/postgres).
-- ---------------------------------------------------------------------------
select throws_ok(
  $$update public.profiles set is_premium=true
    where id='00000000-0000-0000-1a00-00000000000a'$$,
  '42501',
  'PROFILE_ADMIN_FIELDS_READ_ONLY',
  'T16 — l’écriture privilégiée directe de is_premium reste interdite'
);

select lives_ok(
  $$update public.profiles set bio='Maintenance privilégiée'
    where id='00000000-0000-0000-1b00-00000000000b'$$,
  'T17 — un champ ordinaire d’un profil suspendu reste modifiable en privilégié'
);

select is(
  (select bio from public.profiles where id='00000000-0000-0000-1b00-00000000000b'),
  'Maintenance privilégiée',
  'T18 — la maintenance privilégiée est persistée');

-- ---------------------------------------------------------------------------
-- Modération : suspendre / réactiver via la RPC reste fonctionnel.
-- ---------------------------------------------------------------------------
select lives_ok(
  $$select public.admin_set_account_status(
      '00000000-0000-0000-1c00-00000000000c', 'active', 'suspended',
      'Suspension de test contrôlée.',
      '00000000-0000-0000-1a00-000000000001', null)$$,
  'T19 — admin_set_account_status peut toujours suspendre un autre compte'
);

select is(
  (select account_status::text from public.profiles
   where id='00000000-0000-0000-1c00-00000000000c'),
  'suspended', 'T20 — le compte cible est bien suspendu');

select lives_ok(
  $$select public.admin_set_account_status(
      '00000000-0000-0000-1c00-00000000000c', 'suspended', 'active',
      'Réactivation de test contrôlée.',
      '00000000-0000-0000-1a00-000000000001', null)$$,
  'T21 — admin_set_account_status peut toujours réactiver un compte suspendu'
);

select is(
  (select account_status::text from public.profiles
   where id='00000000-0000-0000-1c00-00000000000c'),
  'active', 'T22 — le compte cible est bien réactivé');

select ok(
  (select suspended_at is null and suspended_by is null and suspension_reason is null
   from public.profiles where id='00000000-0000-0000-1c00-00000000000c'),
  'T23 — la réactivation remet suspended_at, suspended_by et suspension_reason à NULL'
);

select is(
  (select count(*)::int from public.account_moderation_actions
   where profile_id_snapshot='00000000-0000-0000-1c00-00000000000c'),
  2, 'T24 — exactement une ligne d’audit par transition (2 transitions)');

select ok(
  (select count(*) filter (where previous_status='active' and new_status='suspended') = 1
      and count(*) filter (where previous_status='suspended' and new_status='active') = 1
   from public.account_moderation_actions
   where profile_id_snapshot='00000000-0000-0000-1c00-00000000000c'),
  'T25 — les deux transitions journalisées sont exactes'
);

select throws_ok(
  $$select public.admin_set_account_status(
      '00000000-0000-0000-1a00-00000000000a', 'active', 'suspended',
      'Auto-modération interdite.',
      '00000000-0000-0000-1a00-00000000000a', null)$$,
  '42501',
  'SELF_MODERATION_FORBIDDEN',
  'T26 — l’auto-modération reste refusée'
);

-- ---------------------------------------------------------------------------
-- Coexistence B1b et privilèges de la fonction trigger.
-- ---------------------------------------------------------------------------
select ok(
  to_regprocedure(
    'public.admin_correct_profile_identity_fields(uuid,text,date,text,uuid)'
  ) is not null,
  'T27 — la RPC de correction d’identité B1b reste présente'
);

select ok(
  not has_function_privilege(
    'anon', 'public.guard_profiles_admin_fields()', 'EXECUTE'),
  'T28 — anon sans privilège EXECUTE sur la fonction trigger'
);

select ok(
  not has_function_privilege(
    'authenticated', 'public.guard_profiles_admin_fields()', 'EXECUTE'),
  'T29 — authenticated sans privilège EXECUTE sur la fonction trigger'
);

select ok(
  not has_function_privilege(
    'service_role', 'public.guard_profiles_admin_fields()', 'EXECUTE'),
  'T30 — service_role sans privilège EXECUTE sur la fonction trigger'
);

select ok(
  not exists (
    select 1
    from pg_proc p
    cross join lateral aclexplode(
      coalesce(p.proacl, acldefault('f', p.proowner))
    ) a
    where p.oid = 'public.guard_profiles_admin_fields()'::regprocedure
      and a.grantee = 0
      and a.privilege_type = 'EXECUTE'
  ),
  'T31 — aucun privilège EXECUTE accordé à PUBLIC sur la fonction trigger'
);

select * from finish();
rollback;
