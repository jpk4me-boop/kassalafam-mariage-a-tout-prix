-- =============================================================================
-- pgTAP — L3F-C3B/C3D : application effective des suspensions de compte.
--
-- À exécuter uniquement sur une base jetable reconstruite depuis les migrations.
-- Transaction unique + ROLLBACK : aucune fixture conservée.
-- =============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set search_path = extensions, public, pg_catalog;

create function public._sar_as(p_sub uuid, p_sql text)
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

create function public._sar_scalar(p_sub uuid, p_sql text)
returns text
language plpgsql
as $$
declare
  v_result text;
begin
  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_sub, 'role', 'authenticated')::text,
    true
  );
  begin
    execute p_sql into v_result;
    perform set_config('test.err', '', true);
    perform set_config('test.state', '', true);
  exception when others then
    v_result := null;
    perform set_config('test.err', sqlerrm, true);
    perform set_config('test.state', sqlstate, true);
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return v_result;
end;
$$;

-- Fixtures.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0a00-000000000001', 'sar-admin@ex.test'),
  ('00000000-0000-0000-0a00-00000000000a', 'sar-a@ex.test'),
  ('00000000-0000-0000-0b00-00000000000b', 'sar-b@ex.test'),
  ('00000000-0000-0000-0c00-00000000000c', 'sar-c@ex.test'),
  ('00000000-0000-0000-0d00-00000000000d', 'sar-d@ex.test'),
  ('00000000-0000-0000-0e00-00000000000e', 'sar-e@ex.test'),
  ('00000000-0000-0000-0f00-00000000000f', 'sar-f@ex.test'),
  ('00000000-0000-0000-9900-000000000099', 'sar-no-profile@ex.test');

insert into public.profiles (
  id, first_name, gender, birth_date, country, city, marital_status,
  discovery_universe, verification_status, account_status,
  suspended_at, suspended_by, suspension_reason
) values
  (
    '00000000-0000-0000-0a00-00000000000a', 'Actif A', 'homme', '1990-01-01',
    'Cameroun', 'Douala', 'celibataire', 'christian_marriage', 'approved', 'active',
    null, null, null
  ),
  (
    '00000000-0000-0000-0b00-00000000000b', 'Suspendue B', 'femme', '1992-02-02',
    'Cameroun', 'Douala', 'celibataire', 'christian_marriage', 'approved', 'suspended',
    now(), '00000000-0000-0000-0a00-000000000001', 'Suspension de test valide.'
  ),
  (
    '00000000-0000-0000-0c00-00000000000c', 'Suspendu C', 'homme', '1988-03-03',
    'Cameroun', 'Yaoundé', 'celibataire', 'christian_marriage', 'approved', 'suspended',
    now(), '00000000-0000-0000-0a00-000000000001', 'Suspension de test valide.'
  ),
  (
    '00000000-0000-0000-0d00-00000000000d', 'Active D', 'femme', '1994-04-04',
    'Cameroun', 'Douala', 'celibataire', 'christian_marriage', 'approved', 'active',
    null, null, null
  ),
  (
    '00000000-0000-0000-0e00-00000000000e', 'Actif E', 'homme', '1991-05-05',
    'Cameroun', 'Douala', 'celibataire', 'christian_marriage', 'approved', 'active',
    null, null, null
  ),
  (
    '00000000-0000-0000-0f00-00000000000f', 'Active F', 'femme', '1993-06-06',
    'Cameroun', 'Douala', 'celibataire', 'islamic_marriage', 'approved', 'active',
    null, null, null
  );

insert into public.photos (id, profile_id, storage_path, is_primary) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0a00-00000000000a', 'a/primary.webp', true),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0b00-00000000000b', 'b/primary.webp', true),
  ('10000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0c00-00000000000c', 'c/primary.webp', true),
  ('10000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0d00-00000000000d', 'd/primary.webp', true);

insert into public.matches (id, user_a, user_b, status) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0a00-00000000000a', '00000000-0000-0000-0b00-00000000000b', 'accepted'),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0c00-00000000000c', '00000000-0000-0000-0d00-00000000000d', 'accepted'),
  ('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0f00-00000000000f', '00000000-0000-0000-0c00-00000000000c', 'pending'),
  ('20000000-0000-0000-0000-000000000004', '00000000-0000-0000-0b00-00000000000b', '00000000-0000-0000-0e00-00000000000e', 'pending');

insert into public.messages (id, match_id, sender_id, content) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0b00-00000000000b', 'Historique A-B conservé.'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0d00-00000000000d', 'Historique C-D conservé.');

insert into public.profile_share_consents (
  id, profile_id, policy_version, consent_text
) values (
  '40000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0c00-00000000000c',
  '2026-07-v1',
  'Consentement de test.'
);

select plan(43);

-- Structure et privilèges.
select has_function('public', 'current_account_is_not_suspended', array[]::text[],
  'T1 — helper de statut courant présent');
select function_privs_are(
  'public', 'current_account_is_not_suspended', array[]::text[], 'authenticated',
  array['EXECUTE'], 'T2 — authenticated peut exécuter uniquement le helper sûr'
);
select function_privs_are(
  'public', 'current_account_is_not_suspended', array[]::text[], 'anon',
  array[]::text[], 'T3 — anon sans privilège sur le helper'
);
select ok(
  position('ACCOUNT_SUSPENDED' in pg_get_functiondef(
    'public.guard_profiles_admin_fields()'::regprocedure
  )) > 0,
  'T4 — trigger profiles contient la garde ACCOUNT_SUSPENDED'
);
select is(
  (select count(*)::int from pg_policies
   where schemaname='public' and tablename='photos'
     and policyname in ('photos_insert_own','photos_update_own','photos_delete_own')
     and (coalesce(qual,'') || coalesce(with_check,'')) ilike '%current_account_is_not_suspended%'),
  3, 'T5 — trois policies d’écriture photos durcies'
);
select is(
  (select count(*)::int from pg_policies
   where schemaname='storage' and tablename='objects'
     and policyname in ('profile_photos_insert_own','profile_photos_update_own','profile_photos_delete_own')
     and (coalesce(qual,'') || coalesce(with_check,'')) ilike '%current_account_is_not_suspended%'),
  3, 'T6 — trois policies d’écriture Storage durcies'
);
select ok(
  (select qual ilike '%current_account_is_not_suspended%'
   from pg_policies where schemaname='public' and tablename='matches'
     and policyname='matches_select_participants'),
  'T7 — lecture directe des matches refusée au compte suspendu'
);

-- Helper.
select is(public._sar_scalar('00000000-0000-0000-0a00-00000000000a',
  'select public.current_account_is_not_suspended()::text'),
  'true', 'T8 — compte actif autorisé');
select is(public._sar_scalar('00000000-0000-0000-0c00-00000000000c',
  'select public.current_account_is_not_suspended()::text'),
  'false', 'T9 — compte suspendu refusé');
select is(public._sar_scalar('00000000-0000-0000-9900-000000000099',
  'select public.current_account_is_not_suspended()::text'),
  'true', 'T10 — utilisateur sans profil non bloqué avant onboarding');

-- Écritures directes.
select is(public._sar_as('00000000-0000-0000-0c00-00000000000c',
  $$update public.profiles set bio='Tentative interdite'
    where id='00000000-0000-0000-0c00-00000000000c'$$),
  '42501', 'T11 — UPDATE profil suspendu refusé');
select is(current_setting('test.err', true), 'ACCOUNT_SUSPENDED',
  'T12 — erreur stable ACCOUNT_SUSPENDED');
select is((select bio from public.profiles where id='00000000-0000-0000-0c00-00000000000c'),
  null, 'T13 — profil suspendu inchangé');
select is(public._sar_as('00000000-0000-0000-0c00-00000000000c',
  $$insert into public.photos(profile_id,storage_path)
    values('00000000-0000-0000-0c00-00000000000c','c/blocked.webp')$$),
  '42501', 'T14 — INSERT photo suspendu refusé par RLS');
select is(public._sar_as('00000000-0000-0000-0a00-00000000000a',
  $$update public.profiles set bio='Modification active'
    where id='00000000-0000-0000-0a00-00000000000a'$$),
  '', 'T15 — UPDATE profil actif non régressé');
select is(public._sar_as('00000000-0000-0000-0a00-00000000000a',
  $$insert into public.photos(profile_id,storage_path)
    values('00000000-0000-0000-0a00-00000000000a','a/secondary.webp')$$),
  '', 'T16 — INSERT photo actif non régressé');
select is(public._sar_scalar('00000000-0000-0000-0c00-00000000000c',
  'select count(*)::text from public.matches'),
  '0', 'T17 — RLS matches retourne zéro ligne au participant suspendu');

-- Découverte.
select is(public._sar_scalar('00000000-0000-0000-0a00-00000000000a',
  $$select count(*)::text from public.discover_candidates('christian_marriage',20,0)$$),
  '1', 'T18 — actif voit uniquement la candidate active compatible');
select is(public._sar_scalar('00000000-0000-0000-0a00-00000000000a',
  $$select id::text from public.discover_candidates('christian_marriage',20,0)$$),
  '00000000-0000-0000-0d00-00000000000d', 'T19 — profil suspendu exclu de la découverte');
select is(public._sar_scalar('00000000-0000-0000-0c00-00000000000c',
  $$select count(*)::text from public.discover_candidates('christian_marriage',20,0)$$),
  '0', 'T20 — viewer suspendu ne reçoit aucun candidat');

-- Intérêts et relations.
select is(public._sar_as('00000000-0000-0000-0c00-00000000000c',
  $$select public.express_interest('00000000-0000-0000-0d00-00000000000d','christian_marriage')$$),
  '42501', 'T21 — express_interest refusé au viewer suspendu');
select is(current_setting('test.err', true), 'ACCOUNT_SUSPENDED',
  'T22 — express_interest renvoie ACCOUNT_SUSPENDED');
select is(public._sar_as('00000000-0000-0000-0a00-00000000000a',
  $$select public.express_interest('00000000-0000-0000-0b00-00000000000b','christian_marriage')$$),
  '42501', 'T23 — cible suspendue refusée à l’appel direct');
select is(public._sar_scalar('00000000-0000-0000-0a00-00000000000a',
  $$select public.express_interest('00000000-0000-0000-0d00-00000000000d','christian_marriage')$$),
  'created', 'T24 — intérêt actif vers cible active non régressé');
select is(public._sar_as('00000000-0000-0000-0c00-00000000000c',
  $$select public.respond_to_interest('20000000-0000-0000-0000-000000000003','accepted')$$),
  '42501', 'T25 — réponse du destinataire suspendu refusée');
select is(public._sar_as('00000000-0000-0000-0e00-00000000000e',
  $$select public.respond_to_interest('20000000-0000-0000-0000-000000000004','accepted')$$),
  '42501', 'T26 — réponse refusée quand l’émetteur est suspendu');
select is(public._sar_scalar('00000000-0000-0000-0a00-00000000000a',
  'select count(*)::text from public.list_my_relationships()'),
  '1', 'T27 — relations actives masquent le profil suspendu mais gardent D');
select is(public._sar_scalar('00000000-0000-0000-0c00-00000000000c',
  'select count(*)::text from public.list_my_relationships()'),
  '0', 'T28 — compte suspendu ne reçoit aucune relation');

-- Messagerie et actions de sécurité.
select is(public._sar_scalar('00000000-0000-0000-0a00-00000000000a',
  $$select public.can_message('20000000-0000-0000-0000-000000000001')::text$$),
  'false', 'T29 — conversation indisponible si l’autre participant est suspendu');
select is(public._sar_scalar('00000000-0000-0000-0c00-00000000000c',
  $$select public.can_message('20000000-0000-0000-0000-000000000002')::text$$),
  'false', 'T30 — conversation indisponible au participant suspendu');
select is(public._sar_as('00000000-0000-0000-0a00-00000000000a',
  $$select public.send_message('20000000-0000-0000-0000-000000000001','Nouveau message interdit')$$),
  '42501', 'T31 — aucun nouveau message vers un compte suspendu');
select is((select count(*)::int from public.messages), 2,
  'T32 — historique existant conservé sans nouvelle ligne');
select is(public._sar_as('00000000-0000-0000-0c00-00000000000c',
  $$select public.block_match_participant('20000000-0000-0000-0000-000000000002')$$),
  '42501', 'T33 — blocage initié par un compte suspendu refusé');
select ok(public._sar_scalar('00000000-0000-0000-0a00-00000000000a',
  $$select public.report_message(
    '30000000-0000-0000-0000-000000000001','harassment',null
  )::text$$) is not null,
  'T34 — membre actif peut signaler un ancien message du compte suspendu');
select is(public._sar_as('00000000-0000-0000-0c00-00000000000c',
  $$select public.report_message(
    '30000000-0000-0000-0000-000000000002','harassment',null
  )$$),
  '42501', 'T35 — signalement initié par un compte suspendu refusé');

-- Onboarding, acquisition et consentement.
select is(public._sar_as('00000000-0000-0000-0c00-00000000000c',
  $$select public.record_acquisition_source('google',null)$$),
  '42501', 'T36 — acquisition refusée au compte suspendu');
select is(public._sar_as('00000000-0000-0000-0c00-00000000000c',
  'select public.complete_member_onboarding_v2()'),
  '42501', 'T37 — finalisation onboarding refusée au compte suspendu');
select is(public._sar_as('00000000-0000-0000-0c00-00000000000c',
  'select * from public.grant_my_profile_share_consent()'),
  '42501', 'T38 — nouveau consentement de partage refusé au compte suspendu');
select is(public._sar_scalar('00000000-0000-0000-0c00-00000000000c',
  'select public.withdraw_my_profile_share_consent()::text'),
  'true', 'T39 — retrait de consentement reste autorisé pour protéger la vie privée');

-- Réactivation : aucune donnée supprimée, accès restauré.
update public.profiles
set account_status='active', suspended_at=null, suspended_by=null, suspension_reason=null
where id in (
  '00000000-0000-0000-0b00-00000000000b',
  '00000000-0000-0000-0c00-00000000000c'
);

select is(public._sar_scalar('00000000-0000-0000-0a00-00000000000a',
  $$select public.can_message('20000000-0000-0000-0000-000000000001')::text$$),
  'true', 'T40 — conversation A-B restaurée après réactivation');
select is(public._sar_scalar('00000000-0000-0000-0a00-00000000000a',
  $$select count(*)::text from public.get_conversation_messages('20000000-0000-0000-0000-000000000001')$$),
  '1', 'T41 — historique A-B lisible et intact après réactivation');
select is(public._sar_as('00000000-0000-0000-0c00-00000000000c',
  $$update public.profiles set bio='Réactivation confirmée'
    where id='00000000-0000-0000-0c00-00000000000c'$$),
  '', 'T42 — écriture profil restaurée après réactivation');
select is((select count(*)::int from public.messages), 2,
  'T43 — réactivation sans suppression ni duplication de messages');

select * from finish();
rollback;
