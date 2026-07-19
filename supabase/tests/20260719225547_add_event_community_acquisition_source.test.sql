-- =============================================================================
-- Suite pgTAP — Source d'acquisition « Événement ou communauté » (PR B1a).
-- Cibles : CHECK profiles_acquisition_source_check étendu (event_community),
--          RPC public.record_acquisition_source (version 20260719225547 :
--          nouvelle valeur acceptée, garde suspension et write-once intacts),
--          protection cross-utilisateur (RLS) et anti-écriture directe
--          (trigger de garde), grants de la RPC.
--
-- Exécution : npx supabase test db — stack Supabase local (VPS Hostinger).
--
-- Principe : TRANSACTION UNIQUE (begin … rollback). Les opérations membres
-- sont exécutées SOUS le rôle `authenticated` (JWT local sub+role) ; le
-- résultat/exception est capturé dans des GUC `test.*` ; les assertions pgTAP
-- sont jouées en `postgres` (propriétaire des RPC dans le stack local).
--
-- UUID de travail :
--   E1 = …00e1  (RPC : event_community, write-once)
--   E2 = …00e2  (compte suspendu : RPC bloquée)
--   E3 = …00e3  (cible d'un autre membre : RLS)
--   E4/E5/E6/E7 = …00e4-…00e7 (CHECK : inserts directs postgres)
-- =============================================================================

begin;

create extension if not exists pgtap with schema extensions;

set search_path = extensions, public, pg_catalog;

-- ---------------------------------------------------------------------------
-- Helpers (détruits au ROLLBACK).
-- ---------------------------------------------------------------------------

-- Appelle la RPC sous `authenticated` (auth.uid() = p_uid) et capture le
-- retour texte OU l'exception (sqlstate + message).
create function public._evc_rpc(p_uid uuid, p_source text, p_other text)
returns void language plpgsql as $$
declare v text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  begin
    v := public.record_acquisition_source(p_source, p_other);
    perform set_config('test.ret', coalesce(v, ''), true);
    perform set_config('test.state', '', true);
    perform set_config('test.err', '', true);
  exception when others then
    perform set_config('test.ret', '', true);
    perform set_config('test.state', sqlstate, true);
    perform set_config('test.err', sqlerrm, true);
  end;
  reset role;
end; $$;

-- Exécute un SQL arbitraire sous `authenticated` (auth.uid() = p_uid) et
-- capture succès ('') ou exception.
create function public._evc_as_member(p_uid uuid, p_sql text)
returns void language plpgsql as $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  begin
    execute p_sql;
    perform set_config('test.state', '', true);
    perform set_config('test.err', '', true);
  exception when others then
    perform set_config('test.state', sqlstate, true);
    perform set_config('test.err', sqlerrm, true);
  end;
  reset role;
end; $$;

-- ---------------------------------------------------------------------------
-- Fixtures (en `postgres`).
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'evc-e1@ex.test'),
  ('00000000-0000-0000-0000-0000000000e2', 'evc-e2@ex.test'),
  ('00000000-0000-0000-0000-0000000000e3', 'evc-e3@ex.test'),
  ('00000000-0000-0000-0000-0000000000e4', 'evc-e4@ex.test'),
  ('00000000-0000-0000-0000-0000000000e5', 'evc-e5@ex.test'),
  ('00000000-0000-0000-0000-0000000000e6', 'evc-e6@ex.test'),
  ('00000000-0000-0000-0000-0000000000e7', 'evc-e7@ex.test');

-- E2 : profil suspendu (écriture directe autorisée : postgres est le
-- propriétaire des RPC/garde dans le stack local).
insert into public.profiles (id, first_name) values
  ('00000000-0000-0000-0000-0000000000e2', 'Suspendu');
update public.profiles
   set account_status = 'suspended',
       suspended_at = pg_catalog.now(),
       suspended_by = '00000000-0000-0000-0000-0000000000e1',
       suspension_reason = 'Suspension de test pgTAP (fixture).'
 where id = '00000000-0000-0000-0000-0000000000e2';

-- E3 : profil d'un AUTRE membre, sans acquisition (cible RLS).
insert into public.profiles (id, first_name) values
  ('00000000-0000-0000-0000-0000000000e3', 'Cible');

-- ===========================================================================
select plan(18);
-- ===========================================================================

-- ###########################################################################
-- SECTION 1 — CONTRAINTE CHECK (inserts directs en postgres, chemin
-- propriétaire de la RPC : la garde write-once laisse passer une première
-- écriture valide).
-- ###########################################################################

select ok(
  exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'profiles_acquisition_source_check'
      and conrelid = 'public.profiles'::regclass
  ),
  'T1 — la contrainte profiles_acquisition_source_check existe');

select lives_ok(
  $$insert into public.profiles (id, acquisition_source, acquisition_source_recorded_at)
    values ('00000000-0000-0000-0000-0000000000e4', 'event_community', now())$$,
  'T2 — event_community est accepté par le CHECK');

select lives_ok(
  $$insert into public.profiles (id, acquisition_source, acquisition_source_recorded_at)
    values ('00000000-0000-0000-0000-0000000000e5', 'tiktok', now())$$,
  'T3 — les valeurs historiques (tiktok) restent acceptées');

select throws_ok(
  $$insert into public.profiles (id, acquisition_source, acquisition_source_recorded_at)
    values ('00000000-0000-0000-0000-0000000000e6', 'radio', now())$$,
  '23514', null,
  'T4 — une valeur inconnue reste rejetée par le CHECK');

select lives_ok(
  $$insert into public.profiles (id) values ('00000000-0000-0000-0000-0000000000e7')$$,
  'T5 — NULL (aucune réponse) reste accepté');

-- ###########################################################################
-- SECTION 2 — RPC record_acquisition_source (rôle authenticated).
-- ###########################################################################

select public._evc_rpc('00000000-0000-0000-0000-0000000000e1', 'event_community', null);
select is(current_setting('test.ret', true), 'recorded',
  'T6 — la RPC accepte event_community (recorded)');

select ok(
  exists (
    select 1 from public.profiles
    where id = '00000000-0000-0000-0000-0000000000e1'
      and acquisition_source = 'event_community'
      and acquisition_source_other is null
      and acquisition_source_recorded_at is not null
  ),
  'T7 — la ligne E1 porte event_community, sans précision, horodatée');

select public._evc_rpc('00000000-0000-0000-0000-0000000000e1', 'event_community', null);
select is(current_setting('test.ret', true), 'unchanged',
  'T8 — write-once : même valeur rejouée → unchanged');

select public._evc_rpc('00000000-0000-0000-0000-0000000000e1', 'tiktok', null);
select is(current_setting('test.ret', true), 'already_recorded',
  'T9 — write-once : une valeur différente → already_recorded');

select ok(
  exists (
    select 1 from public.profiles
    where id = '00000000-0000-0000-0000-0000000000e1'
      and acquisition_source = 'event_community'
  ),
  'T10 — la première réponse reste immuable en base');

select public._evc_rpc('00000000-0000-0000-0000-0000000000e2', 'event_community', null);
select is(current_setting('test.state', true), '42501',
  'T11 — compte suspendu : RPC rejetée (42501)');
select is(current_setting('test.err', true), 'ACCOUNT_SUSPENDED',
  'T12 — compte suspendu : erreur ACCOUNT_SUSPENDED');

select public._evc_rpc('00000000-0000-0000-0000-0000000000e3', 'radio', null);
select is(current_setting('test.state', true), '22023',
  'T13 — valeur inconnue via la RPC : invalid acquisition source (22023)');

-- ###########################################################################
-- SECTION 3 — Cross-utilisateur (RLS) et anti-écriture directe (garde).
-- ###########################################################################

-- E1 tente d'écrire la source d'E3 par UPDATE direct : RLS owner-only →
-- 0 ligne visée, aucune erreur, ligne E3 inchangée.
select public._evc_as_member('00000000-0000-0000-0000-0000000000e1',
  $$update public.profiles
      set acquisition_source = 'google',
          acquisition_source_recorded_at = now()
    where id = '00000000-0000-0000-0000-0000000000e3'$$);
select ok(
  exists (
    select 1 from public.profiles
    where id = '00000000-0000-0000-0000-0000000000e3'
      and acquisition_source is null
      and acquisition_source_recorded_at is null
  ),
  'T14 — un membre ne peut pas écrire la source d''un autre profil (RLS)');

-- E1 tente de modifier SA PROPRE source par UPDATE direct : garde write-once.
select public._evc_as_member('00000000-0000-0000-0000-0000000000e1',
  $$update public.profiles
      set acquisition_source = 'google'
    where id = '00000000-0000-0000-0000-0000000000e1'$$);
select is(current_setting('test.state', true), '42501',
  'T15 — écriture directe de sa propre source : rejetée (42501)');
select is(current_setting('test.err', true), 'ACQUISITION_FIELDS_READ_ONLY',
  'T16 — écriture directe : erreur ACQUISITION_FIELDS_READ_ONLY');

-- ###########################################################################
-- SECTION 4 — GRANTS de la RPC.
-- ###########################################################################

select ok(
  pg_catalog.has_function_privilege(
    'authenticated', 'public.record_acquisition_source(text, text)', 'execute'),
  'T17 — authenticated conserve EXECUTE sur la RPC');

select ok(
  not pg_catalog.has_function_privilege(
    'anon', 'public.record_acquisition_source(text, text)', 'execute'),
  'T18 — anon n''a toujours pas EXECUTE sur la RPC');

-- ===========================================================================
select * from finish();
rollback;
