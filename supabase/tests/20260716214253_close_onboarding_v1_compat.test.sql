-- =============================================================================
-- pgTAP â€” fermeture de la compatibilitÃ© onboarding v1.
-- Ã€ exÃ©cuter uniquement sur le stack Supabase local : npx supabase test db
-- =============================================================================

begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public, pg_catalog;

create function public._cv1_seed_complete(p_id uuid)
returns void language plpgsql as $$
begin
  insert into public.profiles (
    id, first_name, gender, birth_date, marital_status, religion,
    profession, education_level, height_cm,
    origin_country, origin_city, country, city, region,
    marriage_goals, desired_partner_traits, polygamy_preference, children_intent,
    bio, partner_expectations,
    acquisition_source, acquisition_source_recorded_at
  ) values (
    p_id, 'Testeur', 'homme', date '1990-01-01', 'celibataire', 'christianisme',
    'IngÃ©nieur', 'master', 180,
    'SÃ©nÃ©gal', 'Dakar', 'Cameroun', 'Douala', 'Littoral',
    array['build_family','stable_home'], array['kindness','sincerity'],
    'no', 'wants_children', 'PrÃ©sentation de test.', 'Attentes de test.',
    'google', pg_catalog.now()
  );
  insert into public.photos (profile_id, storage_path, is_primary)
  values (p_id, p_id::text || '/photo-principale.webp', true);
end;
$$;

create function public._cv1_meets(p_id uuid)
returns boolean language sql as $$
  select public.profile_meets_onboarding_requirements(p)
  from public.profiles p where p.id = p_id;
$$;

create function public._cv1_rpc(p_sub uuid)
returns text language plpgsql as $$
declare v timestamptz;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
  begin
    select public.complete_member_onboarding() into v;
    perform set_config('test.ret', coalesce(v::text, ''), true);
    perform set_config('test.state', '', true);
    perform set_config('test.err', '', true);
  exception when others then
    perform set_config('test.ret', '', true);
    perform set_config('test.state', sqlstate, true);
    perform set_config('test.err', sqlerrm, true);
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return current_setting('test.state', true);
end;
$$;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'close-e1@ex.test'),
  ('00000000-0000-0000-0000-0000000000e2', 'close-e2@ex.test');

select public._cv1_seed_complete('00000000-0000-0000-0000-0000000000e1');
update public.profiles set origin_city = null
where id = '00000000-0000-0000-0000-0000000000e1';

select public._cv1_seed_complete('00000000-0000-0000-0000-0000000000e2');
update public.profiles
set origin_city = null,
    onboarding_completed_at = timestamptz '2026-07-16 20:00:00+00'
where id = '00000000-0000-0000-0000-0000000000e2';

select plan(18);

select has_function('public', 'profile_meets_onboarding_requirements',
  array['public.profiles'], 'T1 â€” prÃ©dicat prÃ©sent');
select has_function('public', 'complete_member_onboarding', array[]::text[],
  'T2 â€” RPC v1 prÃ©sente');
select has_function('public', 'complete_member_onboarding_v2', array[]::text[],
  'T3 â€” RPC v2 prÃ©sente');
select ok(
  position('origin_city' in pg_get_functiondef(
    'public.profile_meets_onboarding_requirements(public.profiles)'::regprocedure)) > 0,
  'T4 â€” le prÃ©dicat exige origin_city');
select ok(
  position('complete_member_onboarding_v2' in pg_get_functiondef(
    'public.complete_member_onboarding()'::regprocedure)) > 0,
  'T5 â€” la v1 dÃ©lÃ¨gue Ã  la v2');

select function_privs_are('public', 'complete_member_onboarding',
  '{}'::name[], 'anon', '{}'::name[], 'T6 â€” anon sans EXECUTE v1');
select function_privs_are('public', 'complete_member_onboarding',
  '{}'::name[], 'authenticated', array['EXECUTE'],
  'T7 â€” authenticated a seulement EXECUTE v1');
select function_privs_are('public', 'profile_meets_onboarding_requirements',
  array['public.profiles'], 'authenticated', '{}'::name[],
  'T8 â€” prÃ©dicat interne non exÃ©cutable par authenticated');

select ok(not public._cv1_meets('00000000-0000-0000-0000-0000000000e1'),
  'T9 â€” profil non finalisÃ© sans origin_city : prÃ©dicat faux');
select isnt(public._cv1_rpc('00000000-0000-0000-0000-0000000000e1'), '',
  'T10 â€” la v1 refuse dÃ©sormais sans origin_city');
select is(current_setting('test.err', true), 'ONBOARDING_INCOMPLETE_LOCATION',
  'T11 â€” erreur stable du bloc localisation');
select is((select onboarding_completed_at from public.profiles
  where id = '00000000-0000-0000-0000-0000000000e1'), null,
  'T12 â€” refus sans Ã©criture du marqueur');

update public.profiles set origin_city = 'Dakar'
where id = '00000000-0000-0000-0000-0000000000e1';
select ok(public._cv1_meets('00000000-0000-0000-0000-0000000000e1'),
  'T13 â€” origin_city renseignÃ©e : prÃ©dicat vrai');
select is(public._cv1_rpc('00000000-0000-0000-0000-0000000000e1'), '',
  'T14 â€” la v1 dÃ©lÃ©guÃ©e finalise un profil complet');
select isnt((select onboarding_completed_at from public.profiles
  where id = '00000000-0000-0000-0000-0000000000e1'), null,
  'T15 â€” marqueur posÃ©');

select is(public._cv1_rpc('00000000-0000-0000-0000-0000000000e2'), '',
  'T16 â€” profil historique dÃ©jÃ  finalisÃ© : appel idempotent');
select is(current_setting('test.ret', true)::timestamptz,
  timestamptz '2026-07-16 20:00:00+00',
  'T17 â€” premier horodatage historique renvoyÃ© sans rÃ©Ã©criture');
select is((select origin_city from public.profiles
  where id = '00000000-0000-0000-0000-0000000000e2'), null,
  'T18 â€” historique jamais backfillÃ© ni re-bloquÃ©');

select * from finish();
rollback;
