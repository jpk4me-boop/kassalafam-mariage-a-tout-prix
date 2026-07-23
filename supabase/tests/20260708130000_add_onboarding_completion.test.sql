-- =============================================================================
-- Suite pgTAP — Fin explicite d'onboarding (onboarding_completed_at).
-- Cibles : colonne, RPC public.complete_member_onboarding(), garde
--          trg_profiles_guard_onboarding_completion, prédicat partagé et
--          backfill public.backfill_onboarding_completion().
--
-- Exécution : npx supabase test db — nécessite un stack Supabase local avec
--             Docker.
--
-- Principe : TRANSACTION UNIQUE (begin … rollback). Les opérations sensibles
-- sont exécutées SOUS le rôle applicatif `authenticated`/`anon` (JWT local
-- `sub`+`role` → vrai auth.uid()) ; le résultat/exception est capturé dans des
-- GUC `test.*` ; les assertions pgTAP sont jouées en `postgres`.
--
-- UUID de travail :
--   A  = 00000000-0000-0000-0000-0000000000a2  (parcours nominal + idempotence)
--   B  = 00000000-0000-0000-0000-0000000000b2  (isolation : profil partiel)
--   V  = 00000000-0000-0000-0000-0000000000f2  (refus par exigence, mutations)
--   D1 = 00000000-0000-0000-0000-0000000000e1  (écriture directe bloquée)
--   K1 = 00000000-0000-0000-0000-0000000000e2  (backfill : complet → marqué)
--   K2 = 00000000-0000-0000-0000-0000000000e3  (backfill : partiel → ignoré)
-- =============================================================================

begin;

create extension if not exists pgtap with schema extensions;

set search_path = extensions, public, pg_catalog;

-- ---------------------------------------------------------------------------
-- Fonctions d'aide (SECURITY INVOKER — exécutent réellement sous le rôle
-- courant). Détruites au ROLLBACK.
-- ---------------------------------------------------------------------------

-- Appelle la RPC et capture le retour (timestamptz) OU l'exception.
create function public._onb_cap_rpc()
returns void language plpgsql as $$
declare v timestamptz;
begin
  v := public.complete_member_onboarding();
  perform set_config('test.ret', coalesce(v::text, ''), true);
  perform set_config('test.state', '', true);
  perform set_config('test.err', '', true);
exception when others then
  perform set_config('test.ret', '', true);
  perform set_config('test.state', sqlstate, true);
  perform set_config('test.err', sqlerrm, true);
end; $$;

-- Exécute un SQL arbitraire ; capture succès ('') ou exception.
create function public._onb_cap(p_sql text)
returns void language plpgsql as $$
begin
  execute p_sql;
  perform set_config('test.state', '', true);
  perform set_config('test.err', '', true);
exception when others then
  perform set_config('test.state', sqlstate, true);
  perform set_config('test.err', sqlerrm, true);
end; $$;

-- Backstop : simule une FUTURE régression — fonction SECURITY DEFINER détenue
-- par le MÊME propriétaire que la vraie RPC, qui tente d'écraser un marqueur
-- déjà posé. Le trigger doit la bloquer (ONBOARDING_ALREADY_COMPLETED).
create function public._onb_sim_regression(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles
     set onboarding_completed_at = pg_catalog.now() + interval '1 hour'
   where id = p_id;
end; $$;

do $$
declare v_owner text;
begin
  select r.rolname into v_owner
    from pg_catalog.pg_proc p
    join pg_catalog.pg_roles r on r.oid = p.proowner
    where p.oid = 'public.complete_member_onboarding()'::pg_catalog.regprocedure;
  execute format('alter function public._onb_sim_regression(uuid) owner to %I', v_owner);
end $$;

-- ---------------------------------------------------------------------------
-- Fixtures (en `postgres`).
--   « Profil complet » = toutes les exigences du parcours SAUF ce que chaque
--   test retire. L'acquisition est posée directement (autorisé : postgres est
--   le propriétaire de la RPC write-once dans le stack local).
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a2', 'onb-a@ex.test'),
  ('00000000-0000-0000-0000-0000000000b2', 'onb-b@ex.test'),
  ('00000000-0000-0000-0000-0000000000f2', 'onb-v@ex.test'),
  ('00000000-0000-0000-0000-0000000000e1', 'onb-d1@ex.test'),
  ('00000000-0000-0000-0000-0000000000e2', 'onb-k1@ex.test'),
  ('00000000-0000-0000-0000-0000000000e3', 'onb-k2@ex.test');

-- Insère un profil COMPLET (hors marqueur) pour un id donné.
create function public._onb_seed_complete(p_id uuid)
returns void language plpgsql as $$
begin
  insert into public.profiles (
    id, first_name, gender, birth_date, marital_status, religion,
    profession, education_level, height_cm,
    country, city, origin_country, origin_city, region,
    marriage_goals, desired_partner_traits, polygamy_preference, children_intent,
    bio, partner_expectations,
    acquisition_source, acquisition_source_recorded_at
  ) values (
    p_id, 'Testeur', 'homme', date '1990-01-01', 'celibataire', 'christianisme',
    'Ingénieur', 'master', 180,
    'Cameroun', 'Douala', 'Cameroun', 'Yaoundé', 'Littoral',
    array['build_family','stable_home'], array['kindness','sincerity'], 'no', 'wants_children',
    'Présentation de test.', 'Attentes de test.',
    'google', pg_catalog.now()
  );
  insert into public.photos (profile_id, storage_path, is_primary)
  values (p_id, p_id::text || '/photo-principale.webp', true);
end; $$;

select public._onb_seed_complete('00000000-0000-0000-0000-0000000000a2');
select public._onb_seed_complete('00000000-0000-0000-0000-0000000000f2');
select public._onb_seed_complete('00000000-0000-0000-0000-0000000000e1');
select public._onb_seed_complete('00000000-0000-0000-0000-0000000000e2');

-- B = partiel (bio manquante) avec acquisition + photo → isolation + backfill.
select public._onb_seed_complete('00000000-0000-0000-0000-0000000000b2');
update public.profiles set bio = null
 where id = '00000000-0000-0000-0000-0000000000b2';

-- K2 = partiel pour le backfill (pas de photo principale).
select public._onb_seed_complete('00000000-0000-0000-0000-0000000000e3');
delete from public.photos
 where profile_id = '00000000-0000-0000-0000-0000000000e3';

-- ===========================================================================
select plan(40);
-- ===========================================================================

-- ###########################################################################
-- SECTION 1 — STRUCTURE (assertions en postgres)
-- ###########################################################################

select has_column('public', 'profiles', 'onboarding_completed_at',
  'T1 — colonne onboarding_completed_at présente');
select col_type_is('public', 'profiles', 'onboarding_completed_at',
  'timestamp with time zone', 'T2 — type timestamptz');
select col_is_null('public', 'profiles', 'onboarding_completed_at',
  'T3 — colonne nullable (rétrocompatible)');

select has_function('public', 'complete_member_onboarding', ARRAY[]::text[],
  'T4 — RPC complete_member_onboarding() présente');
select is_definer('public', 'complete_member_onboarding', ARRAY[]::text[],
  'T5 — RPC SECURITY DEFINER');

select ok(
  has_function_privilege('authenticated',
    'public.complete_member_onboarding()', 'execute'),
  'T6 — EXECUTE accordé à authenticated');
select ok(
  not has_function_privilege('anon',
    'public.complete_member_onboarding()', 'execute'),
  'T7 — EXECUTE révoqué pour anon');

select ok(
  not has_function_privilege('authenticated',
    'public.profile_meets_onboarding_requirements(public.profiles)', 'execute'),
  'T8 — prédicat interne non exécutable par authenticated');
select ok(
  not has_function_privilege('authenticated',
    'public.backfill_onboarding_completion()', 'execute'),
  'T9 — backfill non exécutable par authenticated');

select trigger_is('public', 'profiles', 'trg_profiles_guard_onboarding_completion',
  'public', 'guard_profile_onboarding_completion',
  'T10 — garde-trigger posée sur profiles');

-- ###########################################################################
-- SECTION 2 — REFUS PAR EXIGENCE (RPC sous authenticated, membre V)
--   V part d'un profil COMPLET ; chaque cas retire UNE exigence (mutation en
--   postgres), appelle la RPC sous V, vérifie le message, puis restaure.
-- ###########################################################################

-- T11 — acquisition manquante. L'acquisition étant write-once (impossible à
-- retirer d'un profil complet), le cas se teste sur un profil NEUF sans
-- acquisition.
insert into auth.users (id, email)
  values ('00000000-0000-0000-0000-0000000000f3', 'onb-noacq@ex.test');
insert into public.profiles (id, first_name) values
  ('00000000-0000-0000-0000-0000000000f3', 'SansAcquisition');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-0000000000f3','role','authenticated')::text, true);
select public._onb_cap_rpc();
reset role;
select is(current_setting('test.err', true), 'ONBOARDING_INCOMPLETE_ACQUISITION',
  'T11 — refus sans acquisition');

-- Aide : retire un champ de V, appelle la RPC sous V, restaure.
create function public._onb_refusal_case(p_mutate text, p_restore text)
returns text language plpgsql as $$
begin
  execute p_mutate;
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub','00000000-0000-0000-0000-0000000000f2','role','authenticated')::text, true);
  perform public._onb_cap_rpc();
  reset role;
  execute p_restore;
  return current_setting('test.err', true);
end; $$;

select is(
  public._onb_refusal_case(
    $$update public.profiles set first_name = null where id = '00000000-0000-0000-0000-0000000000f2'$$,
    $$update public.profiles set first_name = 'Testeur' where id = '00000000-0000-0000-0000-0000000000f2'$$),
  'ONBOARDING_INCOMPLETE_FIRST_NAME', 'T12 — refus sans prénom');

select is(
  public._onb_refusal_case(
    $$update public.profiles set gender = null where id = '00000000-0000-0000-0000-0000000000f2'$$,
    $$update public.profiles set gender = 'homme' where id = '00000000-0000-0000-0000-0000000000f2'$$),
  'ONBOARDING_INCOMPLETE_GENDER', 'T13 — refus sans genre');

select throws_ok(
  $$update public.profiles
       set birth_date = (current_date - interval '17 years')::date
     where id = '00000000-0000-0000-0000-0000000000f2'$$,
  '22023',
  'PROFILE_MINIMUM_AGE_REQUIRED',
  'T14 — refus immédiat si moins de 18 ans'
);

select is(
  public._onb_refusal_case(
    $$update public.profiles set marital_status = null where id = '00000000-0000-0000-0000-0000000000f2'$$,
    $$update public.profiles set marital_status = 'celibataire' where id = '00000000-0000-0000-0000-0000000000f2'$$),
  'ONBOARDING_INCOMPLETE_MARITAL_STATUS', 'T15 — refus sans situation matrimoniale');

select is(
  public._onb_refusal_case(
    $$update public.profiles set profession = null where id = '00000000-0000-0000-0000-0000000000f2'$$,
    $$update public.profiles set profession = 'Ingénieur' where id = '00000000-0000-0000-0000-0000000000f2'$$),
  'ONBOARDING_INCOMPLETE_PROFESSIONAL', 'T16 — refus sans profession (étape 5)');

select is(
  public._onb_refusal_case(
    $$update public.profiles set height_cm = null where id = '00000000-0000-0000-0000-0000000000f2'$$,
    $$update public.profiles set height_cm = 180 where id = '00000000-0000-0000-0000-0000000000f2'$$),
  'ONBOARDING_INCOMPLETE_PROFESSIONAL', 'T17 — refus sans taille (étape 5)');

select is(
  public._onb_refusal_case(
    $$update public.profiles set region = null where id = '00000000-0000-0000-0000-0000000000f2'$$,
    $$update public.profiles set region = 'Littoral' where id = '00000000-0000-0000-0000-0000000000f2'$$),
  'ONBOARDING_INCOMPLETE_LOCATION', 'T18 — refus sans région (étape 6)');

select is(
  public._onb_refusal_case(
    $$update public.profiles set marriage_goals = null where id = '00000000-0000-0000-0000-0000000000f2'$$,
    $$update public.profiles set marriage_goals = array['build_family','stable_home'] where id = '00000000-0000-0000-0000-0000000000f2'$$),
  'ONBOARDING_INCOMPLETE_MATRIMONIAL', 'T19 — refus sans objectifs de mariage');

select is(
  public._onb_refusal_case(
    $$update public.profiles set polygamy_preference = null where id = '00000000-0000-0000-0000-0000000000f2'$$,
    $$update public.profiles set polygamy_preference = 'no' where id = '00000000-0000-0000-0000-0000000000f2'$$),
  'ONBOARDING_INCOMPLETE_MATRIMONIAL', 'T20 — refus sans positionnement polygamie');

select is(
  public._onb_refusal_case(
    $$update public.profiles set bio = '   ' where id = '00000000-0000-0000-0000-0000000000f2'$$,
    $$update public.profiles set bio = 'Présentation de test.' where id = '00000000-0000-0000-0000-0000000000f2'$$),
  'ONBOARDING_INCOMPLETE_BIO', 'T21 — refus sans bio (espaces seuls)');

select is(
  public._onb_refusal_case(
    $$update public.profiles set partner_expectations = null where id = '00000000-0000-0000-0000-0000000000f2'$$,
    $$update public.profiles set partner_expectations = 'Attentes de test.' where id = '00000000-0000-0000-0000-0000000000f2'$$),
  'ONBOARDING_INCOMPLETE_PARTNER_EXPECTATIONS', 'T22 — refus sans attentes');

select is(
  public._onb_refusal_case(
    $$update public.photos set is_primary = false where profile_id = '00000000-0000-0000-0000-0000000000f2'$$,
    $$update public.photos set is_primary = true where profile_id = '00000000-0000-0000-0000-0000000000f2'$$),
  'ONBOARDING_INCOMPLETE_PRIMARY_PHOTO', 'T23 — refus sans photo principale');

-- Après toutes les restaurations, V n'a jamais été marqué.
select is(
  (select onboarding_completed_at from public.profiles
    where id = '00000000-0000-0000-0000-0000000000f2'),
  null, 'T24 — aucun refus n''a posé le marqueur');

-- ###########################################################################
-- SECTION 3 — SUCCÈS, IDEMPOTENCE, ISOLATION
-- ###########################################################################

-- T25/T26 — succès complet (membre A).
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-0000000000a2','role','authenticated')::text, true);
select public._onb_cap_rpc();
reset role;
select is(current_setting('test.state', true), '',
  'T25 — profil complet : la RPC réussit');
select isnt(
  (select onboarding_completed_at from public.profiles
    where id = '00000000-0000-0000-0000-0000000000a2'),
  null, 'T26 — marqueur posé pour A');

-- T27/T28 — idempotence : second appel = même horodatage, colonne inchangée.
select set_config('test.first_ts',
  (select onboarding_completed_at::text from public.profiles
    where id = '00000000-0000-0000-0000-0000000000a2'), true);

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-0000000000a2','role','authenticated')::text, true);
select public._onb_cap_rpc();
reset role;
select is(current_setting('test.ret', true), current_setting('test.first_ts', true),
  'T27 — second appel : renvoie le PREMIER horodatage');
select is(
  (select onboarding_completed_at::text from public.profiles
    where id = '00000000-0000-0000-0000-0000000000a2'),
  current_setting('test.first_ts', true),
  'T28 — second appel : colonne inchangée');

-- T29/T30 — isolation par auth.uid() : B (partiel) est refusé et A intact.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-0000000000b2','role','authenticated')::text, true);
select public._onb_cap_rpc();
reset role;
select is(current_setting('test.err', true), 'ONBOARDING_INCOMPLETE_BIO',
  'T29 — B (bio manquante) est refusé : la RPC ne vise que auth.uid()');
select is(
  (select onboarding_completed_at from public.profiles
    where id = '00000000-0000-0000-0000-0000000000b2'),
  null, 'T30 — B jamais marqué : impossible de finaliser un autre compte');

-- T31 — anon ne peut pas exécuter la RPC.
set local role anon;
select public._onb_cap('select public.complete_member_onboarding()');
reset role;
select is(current_setting('test.state', true), '42501',
  'T31 — anon : EXECUTE refusé (42501)');

-- ###########################################################################
-- SECTION 4 — ÉCRITURE DIRECTE IMPOSSIBLE
-- ###########################################################################

-- T32 — UPDATE direct par le propriétaire du profil (E1, complet, non marqué).
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-0000000000e1','role','authenticated')::text, true);
select public._onb_cap(
  $$update public.profiles set onboarding_completed_at = now()
     where id = '00000000-0000-0000-0000-0000000000e1'$$);
reset role;
select is(current_setting('test.err', true), 'ONBOARDING_COMPLETION_READ_ONLY',
  'T32 — écriture directe du marqueur rejetée (UPDATE owner)');

-- T33 — INSERT direct avec marqueur pré-rempli.
insert into auth.users (id, email)
  values ('00000000-0000-0000-0000-0000000000f4', 'onb-ins@ex.test');
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-0000000000f4','role','authenticated')::text, true);
select public._onb_cap(
  $$insert into public.profiles (id, onboarding_completed_at)
    values ('00000000-0000-0000-0000-0000000000f4', now())$$);
reset role;
select is(current_setting('test.err', true), 'ONBOARDING_COMPLETION_READ_ONLY',
  'T33 — INSERT direct avec marqueur rejeté');

-- T34 — les éditions ordinaires du profil restent libres (marqueur posé, A).
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-0000000000a2','role','authenticated')::text, true);
select public._onb_cap(
  $$update public.profiles set city = 'Yaoundé'
     where id = '00000000-0000-0000-0000-0000000000a2'$$);
reset role;
select is(current_setting('test.state', true), '',
  'T34 — édition ordinaire (ville) jamais entravée par la garde');

-- T35 — backstop write-once : même le propriétaire de la RPC ne peut pas
-- écraser un marqueur déjà posé (simulation de régression).
select public._onb_cap(
  $$select public._onb_sim_regression('00000000-0000-0000-0000-0000000000a2')$$);
select is(current_setting('test.err', true), 'ONBOARDING_ALREADY_COMPLETED',
  'T35 — un marqueur posé est immuable, même via le chemin RPC');

-- ###########################################################################
-- SECTION 5 — BACKFILL STRICT ET IDEMPOTENT
-- ###########################################################################

-- État initial des profils NON marqués : V (restauré complet), E1 (complet),
-- K1 (complet) → marqués ; K2 (sans photo), B (sans bio), F3 (vierge) → ignorés.
select is(
  (select public.backfill_onboarding_completion()),
  3, 'T36 — backfill : marque uniquement les profils réellement complets (3)');

select isnt(
  (select onboarding_completed_at from public.profiles
    where id = '00000000-0000-0000-0000-0000000000e2'),
  null, 'T37 — backfill : profil strictement complet (K1) marqué');

select is(
  (select onboarding_completed_at from public.profiles
    where id = '00000000-0000-0000-0000-0000000000e3'),
  null, 'T38 — backfill : profil sans photo principale (K2) jamais marqué');

select is(
  (select onboarding_completed_at from public.profiles
    where id = '00000000-0000-0000-0000-0000000000b2'),
  null, 'T39 — backfill : profil partiel (B, bio NULL) jamais marqué');

-- T40 — idempotence du backfill : plus rien à marquer, horodatage A inchangé.
select is(
  (select public.backfill_onboarding_completion()),
  0, 'T40 — backfill idempotent : second passage sans effet');

-- ===========================================================================
select * from finish();
rollback;
