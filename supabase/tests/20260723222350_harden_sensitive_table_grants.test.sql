-- =============================================================================
-- pgTAP — H1 : durcissement des privilèges directs des tables sensibles.
--
-- Vérifie, après 20260723222350_harden_sensitive_table_grants :
--   A. structure intacte (tables, RLS, policies, triggers, colonnes, index,
--      contraintes) ;
--   B. PUBLIC et anon : aucun privilège direct sur les cinq tables
--      (catalogues + tentatives réelles) ;
--   C. authenticated : matrice exacte
--      profiles S/I/U — photos S/I/U/D — matches S — messages aucun —
--      member_notifications S ;
--   D. comportements membres (RLS owner-only, guards admin/suspension) ;
--   E. parcours RPC complet : découverte → intérêt → acceptation → message →
--      lecture → marquage lu → blocage → déblocage → signalement →
--      suspension/réactivation → consentement de partage → Premium ;
--   F. grants EXECUTE des RPC inchangés.
--
-- À exécuter uniquement sur une base jetable reconstruite depuis les migrations.
-- Transaction unique + ROLLBACK : aucune fixture conservée.
-- =============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set search_path = extensions, public, pg_catalog;

-- ---------------------------------------------------------------------------
-- Helpers : exécution sous un rôle applicatif avec capture de SQLSTATE.
-- ---------------------------------------------------------------------------
create function public._h1_as(p_sub uuid, p_sql text)
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

create function public._h1_anon(p_sql text)
returns text
language plpgsql
as $$
begin
  set local role anon;
  begin
    execute p_sql;
    perform set_config('test.state', '', true);
  exception when others then
    perform set_config('test.state', sqlstate, true);
  end;
  reset role;
  return current_setting('test.state', true);
end;
$$;

create function public._h1_count(p_sub uuid, p_sql text)
returns integer
language plpgsql
as $$
declare
  v integer;
begin
  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_sub, 'role', 'authenticated')::text,
    true
  );
  begin
    execute 'select count(*)::int from (' || p_sql || ') q' into v;
  exception when others then
    v := -1;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return v;
end;
$$;

create function public._h1_text(p_sub uuid, p_sql text)
returns text
language plpgsql
as $$
declare
  v text;
begin
  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_sub, 'role', 'authenticated')::text,
    true
  );
  begin
    execute p_sql into v;
  exception when others then
    v := '!' || sqlstate;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures 100 % fictives.
--   A = homme actif approuvé ; B = femme active approuvée ;
--   C = femme active approuvée (tiers) ; S = femme suspendue ;
--   N = utilisateur sans profil (onboarding) ; ADM = acteur de modération.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-a100-000000000001', 'h1-adm@ex.test'),
  ('00000000-0000-0000-a100-00000000000a', 'h1-a@ex.test'),
  ('00000000-0000-0000-a100-00000000000b', 'h1-b@ex.test'),
  ('00000000-0000-0000-a100-00000000000c', 'h1-c@ex.test'),
  ('00000000-0000-0000-a100-00000000000d', 'h1-s@ex.test'),
  ('00000000-0000-0000-a100-00000000000e', 'h1-n@ex.test');

insert into public.profiles (
  id, first_name, gender, birth_date, country, city, marital_status,
  discovery_universe, verification_status, account_status,
  suspended_at, suspended_by, suspension_reason
) values
  ('00000000-0000-0000-a100-00000000000a', 'Alpha', 'homme', '1990-01-01',
   'Cameroun', 'Douala', 'celibataire', 'christian_marriage', 'approved',
   'active', null, null, null),
  ('00000000-0000-0000-a100-00000000000b', 'Beta', 'femme', '1992-02-02',
   'Cameroun', 'Douala', 'celibataire', 'christian_marriage', 'approved',
   'active', null, null, null),
  ('00000000-0000-0000-a100-00000000000c', 'Gamma', 'femme', '1993-03-03',
   'Cameroun', 'Yaoundé', 'celibataire', 'christian_marriage', 'approved',
   'active', null, null, null),
  ('00000000-0000-0000-a100-00000000000d', 'Sigma', 'femme', '1994-04-04',
   'Cameroun', 'Douala', 'celibataire', 'christian_marriage', 'approved',
   'suspended', now(), '00000000-0000-0000-a100-000000000001',
   'Suspension de test H1.');

insert into public.member_notifications (user_id, type, title, body) values
  ('00000000-0000-0000-a100-00000000000a', 'verification_update',
   'Notification H1', 'Corps de test H1.');

select plan(194);

-- ===========================================================================
-- A. Structure intacte.
-- ===========================================================================
select has_table('public', 'profiles', 'A1 — profiles existe');
select has_table('public', 'photos', 'A2 — photos existe');
select has_table('public', 'matches', 'A3 — matches existe');
select has_table('public', 'messages', 'A4 — messages existe');
select has_table('public', 'member_notifications',
  'A5 — member_notifications existe');

select ok((select relrowsecurity from pg_class
  where oid = 'public.profiles'::regclass),
  'A6 — RLS active sur profiles');
select ok((select relrowsecurity from pg_class
  where oid = 'public.photos'::regclass),
  'A7 — RLS active sur photos');
select ok((select relrowsecurity from pg_class
  where oid = 'public.matches'::regclass),
  'A8 — RLS active sur matches');
select ok((select relrowsecurity from pg_class
  where oid = 'public.messages'::regclass),
  'A9 — RLS active sur messages');
select ok((select relrowsecurity from pg_class
  where oid = 'public.member_notifications'::regclass),
  'A10 — RLS active sur member_notifications');

select policies_are('public', 'profiles',
  array['profiles_select_own', 'profiles_insert_own', 'profiles_update_own'],
  'A11 — policies de profiles inchangées');
select policies_are('public', 'photos',
  array['photos_select_own', 'photos_insert_own', 'photos_update_own',
        'photos_delete_own'],
  'A12 — policies de photos inchangées');
select policies_are('public', 'matches',
  array['matches_select_participants'],
  'A13 — policies de matches inchangées');
select policies_are('public', 'messages',
  array['messages_select_accepted'],
  'A14 — policies de messages inchangées');
select policies_are('public', 'member_notifications',
  array['Members can read their own notifications'],
  'A15 — policies de member_notifications inchangées');

select triggers_are('public', 'profiles',
  array['trg_profiles_updated_at', 'trg_profiles_guard_admin_fields',
        'trg_profiles_guard_acquisition_fields',
        'trg_profiles_guard_onboarding_completion',
        'trg_profiles_guard_identity_fields'],
  'A16 — triggers métier de profiles inchangés');
select triggers_are('public', 'photos',
  array['trg_photos_updated_at'],
  'A17 — triggers de photos inchangés');
select triggers_are('public', 'matches',
  array['trg_matches_updated_at'],
  'A18 — triggers de matches inchangés');
select triggers_are('public', 'messages', array[]::name[],
  'A19 — aucun trigger inattendu sur messages');
select triggers_are('public', 'member_notifications', array[]::name[],
  'A20 — aucun trigger inattendu sur member_notifications');

select is((select count(*)::int from information_schema.columns
  where table_schema = 'public' and table_name = 'profiles'),
  38, 'A21 — profiles conserve 38 colonnes');
select is((select count(*)::int from information_schema.columns
  where table_schema = 'public' and table_name = 'photos'),
  8, 'A22 — photos conserve 8 colonnes');
select is((select count(*)::int from information_schema.columns
  where table_schema = 'public' and table_name = 'matches'),
  6, 'A23 — matches conserve 6 colonnes');
select is((select count(*)::int from information_schema.columns
  where table_schema = 'public' and table_name = 'messages'),
  6, 'A24 — messages conserve 6 colonnes');
select is((select count(*)::int from information_schema.columns
  where table_schema = 'public' and table_name = 'member_notifications'),
  9, 'A25 — member_notifications conserve 9 colonnes');

select is((select count(*)::int from pg_indexes
  where schemaname = 'public' and tablename = 'profiles'),
  4, 'A26 — profiles conserve 4 index');
select is((select count(*)::int from pg_indexes
  where schemaname = 'public' and tablename = 'photos'),
  5, 'A27 — photos conserve 5 index');
select is((select count(*)::int from pg_indexes
  where schemaname = 'public' and tablename = 'matches'),
  6, 'A28 — matches conserve 6 index');
select is((select count(*)::int from pg_indexes
  where schemaname = 'public' and tablename = 'messages'),
  4, 'A29 — messages conserve 4 index');
select is((select count(*)::int from pg_indexes
  where schemaname = 'public' and tablename = 'member_notifications'),
  2, 'A30 — member_notifications conserve 2 index');

select is((select count(*)::int from pg_constraint
  where conrelid = 'public.profiles'::regclass),
  27, 'A31 — profiles conserve 27 contraintes');
select is((select count(*)::int from pg_constraint
  where conrelid = 'public.photos'::regclass),
  3, 'A32 — photos conserve 3 contraintes');
select is((select count(*)::int from pg_constraint
  where conrelid = 'public.matches'::regclass),
  4, 'A33 — matches conserve 4 contraintes');
select is((select count(*)::int from pg_constraint
  where conrelid = 'public.messages'::regclass),
  4, 'A34 — messages conserve 4 contraintes');
select is((select count(*)::int from pg_constraint
  where conrelid = 'public.member_notifications'::regclass),
  3, 'A35 — member_notifications conserve 3 contraintes');

-- ===========================================================================
-- B. PUBLIC et anon : aucun privilège direct.
-- ===========================================================================
select is((select count(*)::int from pg_class c
  cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
  where c.oid = 'public.profiles'::regclass and a.grantee = 0),
  0, 'B1 — aucun privilège PUBLIC sur profiles');
select is((select count(*)::int from pg_class c
  cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
  where c.oid = 'public.photos'::regclass and a.grantee = 0),
  0, 'B2 — aucun privilège PUBLIC sur photos');
select is((select count(*)::int from pg_class c
  cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
  where c.oid = 'public.matches'::regclass and a.grantee = 0),
  0, 'B3 — aucun privilège PUBLIC sur matches');
select is((select count(*)::int from pg_class c
  cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
  where c.oid = 'public.messages'::regclass and a.grantee = 0),
  0, 'B4 — aucun privilège PUBLIC sur messages');
select is((select count(*)::int from pg_class c
  cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
  where c.oid = 'public.member_notifications'::regclass and a.grantee = 0),
  0, 'B5 — aucun privilège PUBLIC sur member_notifications');

select is((select count(*)::int from pg_class c
  cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
  where c.oid = 'public.profiles'::regclass
    and a.grantee = 'anon'::regrole::oid),
  0, 'B6 — aucune entrée ACL anon sur profiles');
select is((select count(*)::int from pg_class c
  cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
  where c.oid = 'public.photos'::regclass
    and a.grantee = 'anon'::regrole::oid),
  0, 'B7 — aucune entrée ACL anon sur photos');
select is((select count(*)::int from pg_class c
  cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
  where c.oid = 'public.matches'::regclass
    and a.grantee = 'anon'::regrole::oid),
  0, 'B8 — aucune entrée ACL anon sur matches');
select is((select count(*)::int from pg_class c
  cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
  where c.oid = 'public.messages'::regclass
    and a.grantee = 'anon'::regrole::oid),
  0, 'B9 — aucune entrée ACL anon sur messages');
select is((select count(*)::int from pg_class c
  cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
  where c.oid = 'public.member_notifications'::regclass
    and a.grantee = 'anon'::regrole::oid),
  0, 'B10 — aucune entrée ACL anon sur member_notifications');

select ok(not has_table_privilege('anon', 'public.profiles', 'SELECT'),
  'B11 — anon sans SELECT sur profiles');
select ok(not has_table_privilege('anon', 'public.profiles', 'INSERT'),
  'B12 — anon sans INSERT sur profiles');
select ok(not has_table_privilege('anon', 'public.profiles', 'UPDATE'),
  'B13 — anon sans UPDATE sur profiles');
select ok(not has_table_privilege('anon', 'public.profiles', 'DELETE'),
  'B14 — anon sans DELETE sur profiles');
select ok(not has_table_privilege('anon', 'public.profiles', 'TRUNCATE'),
  'B15 — anon sans TRUNCATE sur profiles');
select ok(not has_table_privilege('anon', 'public.profiles', 'REFERENCES'),
  'B16 — anon sans REFERENCES sur profiles');
select ok(not has_table_privilege('anon', 'public.profiles', 'TRIGGER'),
  'B17 — anon sans TRIGGER sur profiles');

select ok(not has_table_privilege('anon', 'public.photos', 'SELECT'),
  'B18 — anon sans SELECT sur photos');
select ok(not has_table_privilege('anon', 'public.photos', 'INSERT'),
  'B19 — anon sans INSERT sur photos');
select ok(not has_table_privilege('anon', 'public.photos', 'UPDATE'),
  'B20 — anon sans UPDATE sur photos');
select ok(not has_table_privilege('anon', 'public.photos', 'DELETE'),
  'B21 — anon sans DELETE sur photos');
select ok(not has_table_privilege('anon', 'public.photos', 'TRUNCATE'),
  'B22 — anon sans TRUNCATE sur photos');
select ok(not has_table_privilege('anon', 'public.photos', 'REFERENCES'),
  'B23 — anon sans REFERENCES sur photos');
select ok(not has_table_privilege('anon', 'public.photos', 'TRIGGER'),
  'B24 — anon sans TRIGGER sur photos');

select ok(not has_table_privilege('anon', 'public.matches', 'SELECT'),
  'B25 — anon sans SELECT sur matches');
select ok(not has_table_privilege('anon', 'public.matches', 'INSERT'),
  'B26 — anon sans INSERT sur matches');
select ok(not has_table_privilege('anon', 'public.matches', 'UPDATE'),
  'B27 — anon sans UPDATE sur matches');
select ok(not has_table_privilege('anon', 'public.matches', 'DELETE'),
  'B28 — anon sans DELETE sur matches');
select ok(not has_table_privilege('anon', 'public.matches', 'TRUNCATE'),
  'B29 — anon sans TRUNCATE sur matches');
select ok(not has_table_privilege('anon', 'public.matches', 'REFERENCES'),
  'B30 — anon sans REFERENCES sur matches');
select ok(not has_table_privilege('anon', 'public.matches', 'TRIGGER'),
  'B31 — anon sans TRIGGER sur matches');

select ok(not has_table_privilege('anon', 'public.messages', 'SELECT'),
  'B32 — anon sans SELECT sur messages');
select ok(not has_table_privilege('anon', 'public.messages', 'INSERT'),
  'B33 — anon sans INSERT sur messages');
select ok(not has_table_privilege('anon', 'public.messages', 'UPDATE'),
  'B34 — anon sans UPDATE sur messages');
select ok(not has_table_privilege('anon', 'public.messages', 'DELETE'),
  'B35 — anon sans DELETE sur messages');
select ok(not has_table_privilege('anon', 'public.messages', 'TRUNCATE'),
  'B36 — anon sans TRUNCATE sur messages');
select ok(not has_table_privilege('anon', 'public.messages', 'REFERENCES'),
  'B37 — anon sans REFERENCES sur messages');
select ok(not has_table_privilege('anon', 'public.messages', 'TRIGGER'),
  'B38 — anon sans TRIGGER sur messages');

select ok(not has_table_privilege('anon', 'public.member_notifications', 'SELECT'),
  'B39 — anon sans SELECT sur member_notifications');
select ok(not has_table_privilege('anon', 'public.member_notifications', 'INSERT'),
  'B40 — anon sans INSERT sur member_notifications');
select ok(not has_table_privilege('anon', 'public.member_notifications', 'UPDATE'),
  'B41 — anon sans UPDATE sur member_notifications');
select ok(not has_table_privilege('anon', 'public.member_notifications', 'DELETE'),
  'B42 — anon sans DELETE sur member_notifications');
select ok(not has_table_privilege('anon', 'public.member_notifications', 'TRUNCATE'),
  'B43 — anon sans TRUNCATE sur member_notifications');
select ok(not has_table_privilege('anon', 'public.member_notifications', 'REFERENCES'),
  'B44 — anon sans REFERENCES sur member_notifications');
select ok(not has_table_privilege('anon', 'public.member_notifications', 'TRIGGER'),
  'B45 — anon sans TRIGGER sur member_notifications');

select is(public._h1_anon($$select 1 from public.profiles limit 1$$),
  '42501', 'B46 — tentative réelle : SELECT anon sur profiles refusé');
select is(public._h1_anon($$select 1 from public.messages limit 1$$),
  '42501', 'B47 — tentative réelle : SELECT anon sur messages refusé');
select is(public._h1_anon(
  $$insert into public.photos (profile_id, storage_path)
    values ('00000000-0000-0000-a100-00000000000a', 'x/y.jpg')$$),
  '42501', 'B48 — tentative réelle : INSERT anon sur photos refusé');

-- ===========================================================================
-- C. authenticated : matrice exacte des privilèges.
-- ===========================================================================
select ok(has_table_privilege('authenticated', 'public.profiles', 'SELECT'),
  'C1 — authenticated conserve SELECT sur profiles');
select ok(has_table_privilege('authenticated', 'public.profiles', 'INSERT'),
  'C2 — authenticated conserve INSERT sur profiles (onboarding)');
select ok(has_table_privilege('authenticated', 'public.profiles', 'UPDATE'),
  'C3 — authenticated conserve UPDATE sur profiles (upsert)');
select ok(not has_table_privilege('authenticated', 'public.profiles', 'DELETE'),
  'C4 — authenticated sans DELETE sur profiles');
select ok(not has_table_privilege('authenticated', 'public.profiles', 'TRUNCATE'),
  'C5 — authenticated sans TRUNCATE sur profiles');
select ok(not has_table_privilege('authenticated', 'public.profiles', 'REFERENCES'),
  'C6 — authenticated sans REFERENCES sur profiles');
select ok(not has_table_privilege('authenticated', 'public.profiles', 'TRIGGER'),
  'C7 — authenticated sans TRIGGER sur profiles');

select ok(has_table_privilege('authenticated', 'public.photos', 'SELECT'),
  'C8 — authenticated conserve SELECT sur photos');
select ok(has_table_privilege('authenticated', 'public.photos', 'INSERT'),
  'C9 — authenticated conserve INSERT sur photos');
select ok(has_table_privilege('authenticated', 'public.photos', 'UPDATE'),
  'C10 — authenticated conserve UPDATE sur photos');
select ok(has_table_privilege('authenticated', 'public.photos', 'DELETE'),
  'C11 — authenticated conserve DELETE sur photos');
select ok(not has_table_privilege('authenticated', 'public.photos', 'TRUNCATE'),
  'C12 — authenticated sans TRUNCATE sur photos');
select ok(not has_table_privilege('authenticated', 'public.photos', 'REFERENCES'),
  'C13 — authenticated sans REFERENCES sur photos');
select ok(not has_table_privilege('authenticated', 'public.photos', 'TRIGGER'),
  'C14 — authenticated sans TRIGGER sur photos');

select ok(has_table_privilege('authenticated', 'public.matches', 'SELECT'),
  'C15 — authenticated conserve SELECT sur matches (discover-feed)');
select ok(not has_table_privilege('authenticated', 'public.matches', 'INSERT'),
  'C16 — authenticated sans INSERT sur matches (RPC-only)');
select ok(not has_table_privilege('authenticated', 'public.matches', 'UPDATE'),
  'C17 — authenticated sans UPDATE sur matches (RPC-only)');
select ok(not has_table_privilege('authenticated', 'public.matches', 'DELETE'),
  'C18 — authenticated sans DELETE sur matches');
select ok(not has_table_privilege('authenticated', 'public.matches', 'TRUNCATE'),
  'C19 — authenticated sans TRUNCATE sur matches');
select ok(not has_table_privilege('authenticated', 'public.matches', 'REFERENCES'),
  'C20 — authenticated sans REFERENCES sur matches');
select ok(not has_table_privilege('authenticated', 'public.matches', 'TRIGGER'),
  'C21 — authenticated sans TRIGGER sur matches');

select ok(not has_table_privilege('authenticated', 'public.messages', 'SELECT'),
  'C22 — authenticated sans SELECT sur messages (RPC-only)');
select ok(not has_table_privilege('authenticated', 'public.messages', 'INSERT'),
  'C23 — authenticated sans INSERT sur messages (RPC-only)');
select ok(not has_table_privilege('authenticated', 'public.messages', 'UPDATE'),
  'C24 — authenticated sans UPDATE sur messages (RPC-only)');
select ok(not has_table_privilege('authenticated', 'public.messages', 'DELETE'),
  'C25 — authenticated sans DELETE sur messages');
select ok(not has_table_privilege('authenticated', 'public.messages', 'TRUNCATE'),
  'C26 — authenticated sans TRUNCATE sur messages');
select ok(not has_table_privilege('authenticated', 'public.messages', 'REFERENCES'),
  'C27 — authenticated sans REFERENCES sur messages');
select ok(not has_table_privilege('authenticated', 'public.messages', 'TRIGGER'),
  'C28 — authenticated sans TRIGGER sur messages');

select ok(has_table_privilege('authenticated', 'public.member_notifications', 'SELECT'),
  'C29 — authenticated conserve SELECT sur member_notifications');
select ok(not has_table_privilege('authenticated', 'public.member_notifications', 'INSERT'),
  'C30 — authenticated sans INSERT sur member_notifications');
select ok(not has_table_privilege('authenticated', 'public.member_notifications', 'UPDATE'),
  'C31 — authenticated sans UPDATE sur member_notifications');
select ok(not has_table_privilege('authenticated', 'public.member_notifications', 'DELETE'),
  'C32 — authenticated sans DELETE sur member_notifications');
select ok(not has_table_privilege('authenticated', 'public.member_notifications', 'TRUNCATE'),
  'C33 — authenticated sans TRUNCATE sur member_notifications');
select ok(not has_table_privilege('authenticated', 'public.member_notifications', 'REFERENCES'),
  'C34 — authenticated sans REFERENCES sur member_notifications');
select ok(not has_table_privilege('authenticated', 'public.member_notifications', 'TRIGGER'),
  'C35 — authenticated sans TRIGGER sur member_notifications');

-- ===========================================================================
-- D. Comportements membres (RLS + guards préservés).
-- ===========================================================================

-- profiles ------------------------------------------------------------------
select is(public._h1_count('00000000-0000-0000-a100-00000000000a',
  $$select 1 from public.profiles
    where id = '00000000-0000-0000-a100-00000000000a'$$),
  1, 'D1 — un membre lit son propre profil');
select is(public._h1_count('00000000-0000-0000-a100-00000000000a',
  $$select 1 from public.profiles
    where id = '00000000-0000-0000-a100-00000000000b'$$),
  0, 'D2 — le profil d’un tiers reste invisible (RLS)');

select is(public._h1_as('00000000-0000-0000-a100-00000000000e',
  $$insert into public.profiles (id, first_name)
    values ('00000000-0000-0000-a100-00000000000e', 'Nu')$$),
  '', 'D3 — l’INSERT d’onboarding de son propre profil reste autorisé');
select is((select count(*)::int from public.profiles
  where id = '00000000-0000-0000-a100-00000000000e'),
  1, 'D4 — le profil d’onboarding est bien créé');

select is(public._h1_as('00000000-0000-0000-a100-00000000000a',
  $$update public.profiles set bio = 'Bio H1'
    where id = '00000000-0000-0000-a100-00000000000a'$$),
  '', 'D5 — la modification d’un champ ordinaire de son profil est autorisée');
select is((select bio from public.profiles
  where id = '00000000-0000-0000-a100-00000000000a'),
  'Bio H1', 'D6 — la modification est persistée');

select is(public._h1_as('00000000-0000-0000-a100-00000000000a',
  $$update public.profiles set bio = 'Intrusion'
    where id = '00000000-0000-0000-a100-00000000000b'$$),
  '', 'D7 — l’UPDATE d’un profil tiers ne touche aucune ligne (RLS)');
select is((select bio from public.profiles
  where id = '00000000-0000-0000-a100-00000000000b'),
  null, 'D8 — le profil tiers est resté intact');

select is(public._h1_as('00000000-0000-0000-a100-00000000000a',
  $$delete from public.profiles
    where id = '00000000-0000-0000-a100-00000000000a'$$),
  '42501', 'D9 — le DELETE direct de profiles est refusé (privilège absent)');

select is(public._h1_as('00000000-0000-0000-a100-00000000000a',
  $$update public.profiles set is_premium = true
    where id = '00000000-0000-0000-a100-00000000000a'$$),
  '42501', 'D10 — les champs administratifs restent verrouillés');
select is(current_setting('test.err', true), 'PROFILE_ADMIN_FIELDS_READ_ONLY',
  'D11 — le refus porte l’erreur stable PROFILE_ADMIN_FIELDS_READ_ONLY');

select is(public._h1_as('00000000-0000-0000-a100-00000000000d',
  $$update public.profiles set bio = 'Tentative suspendue'
    where id = '00000000-0000-0000-a100-00000000000d'$$),
  '42501', 'D12 — un profil suspendu ne peut plus se modifier');
select is(current_setting('test.err', true), 'ACCOUNT_SUSPENDED',
  'D13 — le refus porte l’erreur stable ACCOUNT_SUSPENDED');

-- photos --------------------------------------------------------------------
select is(public._h1_as('00000000-0000-0000-a100-00000000000a',
  $$insert into public.photos
      (profile_id, storage_path, is_primary, mime_type, size_bytes)
    values ('00000000-0000-0000-a100-00000000000a',
      '00000000-0000-0000-a100-00000000000a/p1.jpg', true, 'image/jpeg', 1000)$$),
  '', 'D14 — un membre ajoute une photo à son propre profil');
select is(public._h1_count('00000000-0000-0000-a100-00000000000a',
  $$select 1 from public.photos
    where profile_id = '00000000-0000-0000-a100-00000000000a'$$),
  1, 'D15 — il lit ses propres photos');
select is(public._h1_count('00000000-0000-0000-a100-00000000000b',
  $$select 1 from public.photos
    where profile_id = '00000000-0000-0000-a100-00000000000a'$$),
  0, 'D16 — les photos d’un tiers restent invisibles (RLS)');
select is(public._h1_as('00000000-0000-0000-a100-00000000000a',
  $$update public.photos set is_primary = true
    where profile_id = '00000000-0000-0000-a100-00000000000a'$$),
  '', 'D17 — il modifie ses propres photos');
select is(public._h1_as('00000000-0000-0000-a100-00000000000a',
  $$insert into public.photos (profile_id, storage_path)
    values ('00000000-0000-0000-a100-00000000000b', 'b/intrus.jpg')$$),
  '42501', 'D18 — l’ajout d’une photo au profil d’un tiers est refusé');
select is(public._h1_as('00000000-0000-0000-a100-00000000000d',
  $$insert into public.photos (profile_id, storage_path)
    values ('00000000-0000-0000-a100-00000000000d', 'd/susp.jpg')$$),
  '42501', 'D19 — un profil suspendu ne peut plus ajouter de photo');
select is(public._h1_as('00000000-0000-0000-a100-00000000000a',
  $$insert into public.photos
      (profile_id, storage_path, is_primary, mime_type, size_bytes)
    values ('00000000-0000-0000-a100-00000000000a',
      '00000000-0000-0000-a100-00000000000a/p2.jpg', false, 'image/jpeg', 2000)$$),
  '', 'D20 — il ajoute une seconde photo');
select is(public._h1_as('00000000-0000-0000-a100-00000000000a',
  $$delete from public.photos
    where profile_id = '00000000-0000-0000-a100-00000000000a'
      and storage_path = '00000000-0000-0000-a100-00000000000a/p2.jpg'$$),
  '', 'D21 — il supprime sa propre photo (DELETE conservé)');
select is((select count(*)::int from public.photos
  where profile_id = '00000000-0000-0000-a100-00000000000a'),
  1, 'D22 — exactement une photo restante après la suppression');

-- matches : écritures directes impossibles ---------------------------------
select is(public._h1_as('00000000-0000-0000-a100-00000000000a',
  $$insert into public.matches (user_a, user_b, status)
    values ('00000000-0000-0000-a100-00000000000a',
            '00000000-0000-0000-a100-00000000000b', 'accepted')$$),
  '42501', 'D23 — l’INSERT direct dans matches est refusé');
select is(public._h1_as('00000000-0000-0000-a100-00000000000a',
  $$update public.matches set status = 'accepted'$$),
  '42501', 'D24 — l’UPDATE direct de matches est refusé');
select is(public._h1_as('00000000-0000-0000-a100-00000000000a',
  $$delete from public.matches$$),
  '42501', 'D25 — le DELETE direct de matches est refusé');

-- messages : aucun accès direct ---------------------------------------------
select is(public._h1_as('00000000-0000-0000-a100-00000000000a',
  $$select 1 from public.messages limit 1$$),
  '42501', 'D26 — le SELECT direct de messages est refusé (RPC-only)');
select is(public._h1_as('00000000-0000-0000-a100-00000000000a',
  $$insert into public.messages (match_id, sender_id, content)
    values (gen_random_uuid(),
            '00000000-0000-0000-a100-00000000000a', 'direct')$$),
  '42501', 'D27 — l’INSERT direct dans messages est refusé');
select is(public._h1_as('00000000-0000-0000-a100-00000000000a',
  $$update public.messages set content = 'x'$$),
  '42501', 'D28 — l’UPDATE direct de messages est refusé');
select is(public._h1_as('00000000-0000-0000-a100-00000000000a',
  $$delete from public.messages$$),
  '42501', 'D29 — le DELETE direct de messages est refusé');

-- member_notifications ------------------------------------------------------
select is(public._h1_count('00000000-0000-0000-a100-00000000000a',
  $$select 1 from public.member_notifications
    where user_id = '00000000-0000-0000-a100-00000000000a'$$),
  1, 'D30 — un membre lit ses propres notifications');
select is(public._h1_count('00000000-0000-0000-a100-00000000000b',
  $$select 1 from public.member_notifications$$),
  0, 'D31 — les notifications d’un tiers restent invisibles (RLS)');
select is(public._h1_as('00000000-0000-0000-a100-00000000000a',
  $$insert into public.member_notifications (user_id, type, title, body)
    values ('00000000-0000-0000-a100-00000000000a', 'x', 't', 'b')$$),
  '42501', 'D32 — la création directe de notification est refusée');
select is(public._h1_as('00000000-0000-0000-a100-00000000000a',
  $$update public.member_notifications set read_at = now()$$),
  '42501', 'D33 — l’UPDATE direct de notification est refusé');
select is(public._h1_as('00000000-0000-0000-a100-00000000000a',
  $$delete from public.member_notifications$$),
  '42501', 'D34 — le DELETE direct de notification est refusé');

-- ===========================================================================
-- E. Parcours RPC de bout en bout.
-- ===========================================================================
select is(public._h1_count('00000000-0000-0000-a100-00000000000a',
  $$select 1 from public.discover_candidates('christian_marriage', 20, 0)$$),
  2, 'E1 — la découverte retourne les 2 candidates actives (suspendue exclue)');

select is(public._h1_text('00000000-0000-0000-a100-00000000000a',
  $$select public.express_interest(
      '00000000-0000-0000-a100-00000000000b', 'christian_marriage')$$),
  'created', 'E2 — express_interest crée l’intérêt A→B');

select ok(
  (select set_config('h1.match',
    (select id::text from public.matches
     where user_a = '00000000-0000-0000-a100-00000000000a'
       and user_b = '00000000-0000-0000-a100-00000000000b'),
    false) is not null),
  'E3 — le match A→B existe (id capturé pour la suite)');

select is(public._h1_as('00000000-0000-0000-a100-00000000000a',
  $$select public.send_message(
      current_setting('h1.match')::uuid, 'Trop tôt')$$),
  '42501', 'E4 — message refusé avant acceptation de l’intérêt');

select is(public._h1_text('00000000-0000-0000-a100-00000000000b',
  $$select public.respond_to_interest(
      current_setting('h1.match')::uuid, 'accepted')$$),
  'accepted', 'E5 — respond_to_interest accepte l’intérêt côté B');

select is(public._h1_text('00000000-0000-0000-a100-00000000000a',
  $$select public.can_message(current_setting('h1.match')::uuid)::text$$),
  'true', 'E6 — can_message est vrai pour un participant après match');

select is(public._h1_count('00000000-0000-0000-a100-00000000000a',
  $$select 1 from public.matches$$),
  1, 'E7 — la lecture directe de ses matches fonctionne (parcours découverte)');

select is(public._h1_as('00000000-0000-0000-a100-00000000000a',
  $$select public.send_message(
      current_setting('h1.match')::uuid, 'Bonjour B')$$),
  '', 'E8 — send_message fonctionne après acceptation');

select is(public._h1_count('00000000-0000-0000-a100-00000000000b',
  $$select 1 from public.get_conversation_messages(
      current_setting('h1.match')::uuid)$$),
  1, 'E9 — get_conversation_messages retourne le message côté B');

select is(public._h1_text('00000000-0000-0000-a100-00000000000b',
  $$select public.mark_conversation_read(
      current_setting('h1.match')::uuid)::text$$),
  '1', 'E10 — mark_conversation_read marque 1 message reçu');

select is(public._h1_count('00000000-0000-0000-a100-00000000000a',
  $$select 1 from public.list_my_relationships()$$),
  1, 'E11 — list_my_relationships retourne la relation');

select is(public._h1_as('00000000-0000-0000-a100-00000000000c',
  $$select 1 from public.get_conversation_messages(
      current_setting('h1.match')::uuid)$$),
  '42501', 'E12 — un tiers ne peut pas lire la conversation');

select is(public._h1_text('00000000-0000-0000-a100-00000000000c',
  $$select public.can_message(current_setting('h1.match')::uuid)::text$$),
  'false', 'E13 — can_message est faux pour un tiers');

select is(public._h1_as('00000000-0000-0000-a100-00000000000b',
  $$select public.block_match_participant(
      current_setting('h1.match')::uuid)$$),
  '', 'E14 — le blocage depuis la conversation fonctionne');

select is(public._h1_as('00000000-0000-0000-a100-00000000000a',
  $$select public.send_message(
      current_setting('h1.match')::uuid, 'Bloqué ?')$$),
  '42501', 'E15 — l’envoi est refusé pendant le blocage');

select is(public._h1_as('00000000-0000-0000-a100-00000000000b',
  $$select public.unblock_profile(
      '00000000-0000-0000-a100-00000000000a')$$),
  '', 'E16 — le déblocage fonctionne');

select is(public._h1_as('00000000-0000-0000-a100-00000000000a',
  $$select public.send_message(
      current_setting('h1.match')::uuid, 'Re-bonjour')$$),
  '', 'E17 — l’envoi refonctionne après déblocage');

select ok(
  (select set_config('h1.msg1',
    (select id::text from public.messages
     where sender_id = '00000000-0000-0000-a100-00000000000a'
     order by created_at asc limit 1),
    false) is not null),
  'E18 — le premier message de A est capturé pour le signalement');

select is(public._h1_as('00000000-0000-0000-a100-00000000000b',
  $$select public.report_message(
      current_setting('h1.msg1')::uuid, 'harassment', 'Test H1.')$$),
  '', 'E19 — report_message fonctionne pour la destinataire');

select is((select count(*)::int from public.safety_reports
  where reporter_id = '00000000-0000-0000-a100-00000000000b'),
  1, 'E20 — le signalement est enregistré');

select lives_ok(
  $$select public.admin_set_account_status(
      '00000000-0000-0000-a100-00000000000c', 'active', 'suspended',
      'Suspension de test H1.',
      '00000000-0000-0000-a100-000000000001', null)$$,
  'E21 — admin_set_account_status suspend toujours un compte');

select is(public._h1_as('00000000-0000-0000-a100-00000000000c',
  $$select public.express_interest(
      '00000000-0000-0000-a100-00000000000a', 'christian_marriage')$$),
  '42501', 'E22 — un compte suspendu ne peut plus exprimer d’intérêt');
select is(current_setting('test.err', true), 'ACCOUNT_SUSPENDED',
  'E23 — le refus porte l’erreur stable ACCOUNT_SUSPENDED');

select lives_ok(
  $$select public.admin_set_account_status(
      '00000000-0000-0000-a100-00000000000c', 'suspended', 'active',
      'Réactivation de test H1.',
      '00000000-0000-0000-a100-000000000001', null)$$,
  'E24 — admin_set_account_status réactive toujours un compte');

select is(public._h1_as('00000000-0000-0000-a100-00000000000a',
  $$select * from public.grant_my_profile_share_consent()$$),
  '', 'E25 — le consentement de partage limité s’accorde toujours');
select is(public._h1_as('00000000-0000-0000-a100-00000000000a',
  $$select * from public.get_my_profile_share_link_status()$$),
  '', 'E26 — le statut du lien de partage reste lisible');
select is(public._h1_as('00000000-0000-0000-a100-00000000000a',
  $$select public.withdraw_my_profile_share_consent()$$),
  '', 'E27 — le retrait du consentement fonctionne toujours');

select is((select public.profile_has_active_premium(
  '00000000-0000-0000-a100-00000000000a')),
  false, 'E28 — profile_has_active_premium reste opérationnelle');

-- ===========================================================================
-- F. Grants EXECUTE des RPC inchangés.
-- ===========================================================================
select ok(has_function_privilege('authenticated',
  'public.discover_candidates(text, integer, integer)', 'EXECUTE'),
  'F1 — authenticated exécute discover_candidates');
select ok(has_function_privilege('authenticated',
  'public.express_interest(uuid, text)', 'EXECUTE'),
  'F2 — authenticated exécute express_interest');
select ok(has_function_privilege('authenticated',
  'public.respond_to_interest(uuid, text)', 'EXECUTE'),
  'F3 — authenticated exécute respond_to_interest');
select ok(has_function_privilege('authenticated',
  'public.list_my_relationships()', 'EXECUTE'),
  'F4 — authenticated exécute list_my_relationships');
select ok(has_function_privilege('authenticated',
  'public.can_message(uuid)', 'EXECUTE'),
  'F5 — authenticated exécute can_message');
select ok(has_function_privilege('authenticated',
  'public.send_message(uuid, text)', 'EXECUTE'),
  'F6 — authenticated exécute send_message');
select ok(has_function_privilege('authenticated',
  'public.get_conversation_messages(uuid)', 'EXECUTE'),
  'F7 — authenticated exécute get_conversation_messages');
select ok(has_function_privilege('authenticated',
  'public.mark_conversation_read(uuid)', 'EXECUTE'),
  'F8 — authenticated exécute mark_conversation_read');
select ok(has_function_privilege('authenticated',
  'public.block_match_participant(uuid)', 'EXECUTE'),
  'F9 — authenticated exécute block_match_participant');
select ok(has_function_privilege('authenticated',
  'public.unblock_profile(uuid)', 'EXECUTE'),
  'F10 — authenticated exécute unblock_profile');
select ok(has_function_privilege('authenticated',
  'public.report_message(uuid, text, text)', 'EXECUTE'),
  'F11 — authenticated exécute report_message');
select ok(not has_function_privilege('anon',
  'public.send_message(uuid, text)', 'EXECUTE'),
  'F12 — anon ne peut pas exécuter send_message');
select ok(not has_function_privilege('authenticated',
  'public.admin_set_account_status(uuid, text, text, text, uuid, uuid)',
  'EXECUTE'),
  'F13 — authenticated ne peut pas exécuter admin_set_account_status');
select ok(not has_function_privilege('anon',
  'public.admin_set_account_status(uuid, text, text, text, uuid, uuid)',
  'EXECUTE'),
  'F14 — anon ne peut pas exécuter admin_set_account_status');

select * from finish();
rollback;
