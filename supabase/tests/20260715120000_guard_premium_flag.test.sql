-- =============================================================================
-- Suite pgTAP — C1a : is_premium verrouillé contre l'auto-promotion membre.
-- Cibles : colonne profiles.is_premium (boolean not null default false),
--          garde public.guard_profiles_admin_fields (INSERT/UPDATE/upsert,
--          erreur stable PROFILE_ADMIN_FIELDS_READ_ONLY 42501), bypass
--          service_role conservé (auth.uid() IS NULL), non-régression des
--          autres champs administratifs, policies/privilèges/trigger
--          inchangés, découverte toujours fonctionnelle.
--
-- Exécution : npx supabase test db — nécessite un stack Supabase local avec
--             Docker (VPS Hostinger pour ce dépôt). JAMAIS en Production.
--
-- Principe : TRANSACTION UNIQUE (begin … rollback), aucune donnée conservée.
-- Les opérations membre sont exécutées SOUS le rôle applicatif `authenticated`
-- (JWT local `sub`+`role` → vrai auth.uid()) ; l'issue est capturée dans des
-- GUC `test.*` ; les assertions pgTAP sont jouées en `postgres`. Les claims
-- JWT sont VIDÉS après chaque opération membre pour restaurer le bypass
-- auth.uid() IS NULL des opérations privilégiées (simulation service_role).
--
-- UUID de travail :
--   M1 = 00000000-0000-0000-0000-0000000000a1 (INSERT neutre, UPDATE, upsert)
--   M2 = 00000000-0000-0000-0000-0000000000a2 (INSERT true refusé, false OK)
--   M3 = 00000000-0000-0000-0000-0000000000a3 (premium posé serveur, membre
--                                              ne peut pas le retirer)
--   M4 = 00000000-0000-0000-0000-0000000000a4 (INSERTs admin fabriqués)
--   V1 = 00000000-0000-0000-0000-0000000000b1 (viewer découverte, femme)
--   C1 = 00000000-0000-0000-0000-0000000000b2 (candidat découverte, homme,
--                                              premium posé serveur)
-- =============================================================================

begin;

create extension if not exists pgtap with schema extensions;

set search_path = extensions, public, pg_catalog;

-- Base AVANT fixtures : sur un stack reconstruit depuis les migrations seules,
-- ce compte vaut 0 → preuve que la migration (DDL pur) n'a créé aucune ligne.
select set_config('test.pre_rows',
  (select count(*) from public.profiles)::text, true);

-- ---------------------------------------------------------------------------
-- Fonctions d'aide (SECURITY INVOKER — exécutent réellement sous le rôle
-- courant). Détruites au ROLLBACK.
-- ---------------------------------------------------------------------------

-- Exécute un SQL arbitraire ; capture succès ('') ou exception (state + err).
create function public._prem_cap(p_sql text)
returns void language plpgsql as $$
begin
  execute p_sql;
  perform set_config('test.state', '', true);
  perform set_config('test.err', '', true);
exception when others then
  perform set_config('test.state', sqlstate, true);
  perform set_config('test.err', sqlerrm, true);
end; $$;

-- Exécute p_sql SOUS `authenticated` (JWT sub = p_sub), puis restaure le rôle
-- privilégié ET vide les claims (auth.uid() → NULL pour la suite).
create function public._prem_as(p_sub uuid, p_sql text)
returns text language plpgsql as $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
  perform public._prem_cap(p_sql);
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return current_setting('test.state', true);
end; $$;

-- ---------------------------------------------------------------------------
-- Fixtures (en `postgres`, claims vides → bypass service_role légitime).
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'prem-m1@ex.test'),
  ('00000000-0000-0000-0000-0000000000a2', 'prem-m2@ex.test'),
  ('00000000-0000-0000-0000-0000000000a3', 'prem-m3@ex.test'),
  ('00000000-0000-0000-0000-0000000000a4', 'prem-m4@ex.test'),
  ('00000000-0000-0000-0000-0000000000b1', 'prem-v1@ex.test'),
  ('00000000-0000-0000-0000-0000000000b2', 'prem-c1@ex.test');

-- M3 : profil existant (premium posé plus loin, côté serveur).
insert into public.profiles (id, intention)
values ('00000000-0000-0000-0000-0000000000a3', 'mariage_serieux');

-- Découverte : viewer V1 (femme, approuvée) et candidat C1 (homme, approuvé,
-- PREMIUM posé directement par le rôle privilégié — le bypass serveur couvre
-- aussi l'INSERT).
insert into public.profiles
  (id, first_name, gender, birth_date, intention,
   discovery_universe, verification_status)
values
  ('00000000-0000-0000-0000-0000000000b1', 'Viewer', 'femme',
   date '1992-03-03', 'mariage_serieux', 'christian_marriage', 'approved');
insert into public.profiles
  (id, first_name, gender, birth_date, intention,
   discovery_universe, verification_status, is_premium)
values
  ('00000000-0000-0000-0000-0000000000b2', 'Candidat', 'homme',
   date '1990-01-01', 'mariage_serieux', 'christian_marriage', 'approved',
   true);

-- ===========================================================================
select plan(41);
-- ===========================================================================

-- ###########################################################################
-- SECTION 1 — STRUCTURE + MIGRATION SANS DML
-- ###########################################################################

select has_column('public', 'profiles', 'is_premium',
  'T1 — colonne is_premium présente');
select col_type_is('public', 'profiles', 'is_premium', 'boolean',
  'T2 — type boolean');
select col_not_null('public', 'profiles', 'is_premium',
  'T3 — NOT NULL');
select col_default_is('public', 'profiles', 'is_premium', 'false',
  'T4 — DEFAULT false');
select is(current_setting('test.pre_rows', true), '0',
  'T5 — stack reconstruit depuis les migrations : aucune ligne créée/modifiée par la migration (DDL pur)');

-- ###########################################################################
-- SECTION 2 — INSERT membre (sous authenticated, RLS insert_own)
-- ###########################################################################

select is(public._prem_as('00000000-0000-0000-0000-0000000000a1',
  $$insert into public.profiles (id, intention)
    values ('00000000-0000-0000-0000-0000000000a1', 'mariage_serieux')$$),
  '', 'T6 — INSERT membre SANS is_premium : accepté');
select is(
  (select is_premium from public.profiles
    where id = '00000000-0000-0000-0000-0000000000a1'),
  false, 'T7 — valeur par défaut false appliquée');

select is(public._prem_as('00000000-0000-0000-0000-0000000000a2',
  $$insert into public.profiles (id, intention, is_premium)
    values ('00000000-0000-0000-0000-0000000000a2', 'mariage_serieux', true)$$),
  '42501', 'T8 — INSERT membre is_premium=true : refusé (42501)');
select is(current_setting('test.err', true), 'PROFILE_ADMIN_FIELDS_READ_ONLY',
  'T9 — erreur stable PROFILE_ADMIN_FIELDS_READ_ONLY');
select is(
  (select count(*) from public.profiles
    where id = '00000000-0000-0000-0000-0000000000a2')::int,
  0, 'T10 — aucune ligne créée par la tentative refusée');

select is(public._prem_as('00000000-0000-0000-0000-0000000000a2',
  $$insert into public.profiles (id, intention, is_premium)
    values ('00000000-0000-0000-0000-0000000000a2', 'mariage_serieux', false)$$),
  '', 'T11 — INSERT membre is_premium=false explicite (= défaut) : accepté');

-- ###########################################################################
-- SECTION 3 — UPDATE membre (RLS update_own)
-- ###########################################################################

select is(public._prem_as('00000000-0000-0000-0000-0000000000a1',
  $$update public.profiles set is_premium = true
     where id = '00000000-0000-0000-0000-0000000000a1'$$),
  '42501', 'T12 — UPDATE membre false→true : refusé (42501)');
select is(current_setting('test.err', true), 'PROFILE_ADMIN_FIELDS_READ_ONLY',
  'T13 — erreur stable PROFILE_ADMIN_FIELDS_READ_ONLY');
select is(
  (select is_premium from public.profiles
    where id = '00000000-0000-0000-0000-0000000000a1'),
  false, 'T14 — is_premium reste false après le refus');

select is(public._prem_as('00000000-0000-0000-0000-0000000000a1',
  $$update public.profiles set bio = 'Présentation mise à jour.'
     where id = '00000000-0000-0000-0000-0000000000a1'$$),
  '', 'T15 — UPDATE membre d''un champ normal (bio) : toujours autorisé');
select is(
  (select bio from public.profiles
    where id = '00000000-0000-0000-0000-0000000000a1'),
  'Présentation mise à jour.', 'T16 — bio persistée');

select is(public._prem_as('00000000-0000-0000-0000-0000000000a1',
  $$update public.profiles set is_premium = false, bio = 'Bis.'
     where id = '00000000-0000-0000-0000-0000000000a1'$$),
  '', 'T17 — UPDATE membre renvoyant is_premium INCHANGÉ (false→false) : accepté');

-- ###########################################################################
-- SECTION 4 — UPSERT membre (INSERT … ON CONFLICT DO UPDATE, chemin PostgREST)
-- ###########################################################################

select is(public._prem_as('00000000-0000-0000-0000-0000000000a1',
  $$insert into public.profiles (id, intention, is_premium)
    values ('00000000-0000-0000-0000-0000000000a1', 'mariage_serieux', true)
    on conflict (id) do update
      set intention = excluded.intention, is_premium = excluded.is_premium$$),
  '42501', 'T18 — upsert membre posant is_premium=true : refusé (42501)');
select is(current_setting('test.err', true), 'PROFILE_ADMIN_FIELDS_READ_ONLY',
  'T19 — erreur stable PROFILE_ADMIN_FIELDS_READ_ONLY');
select is(
  (select is_premium from public.profiles
    where id = '00000000-0000-0000-0000-0000000000a1'),
  false, 'T20 — is_premium reste false après l''upsert refusé');

select is(public._prem_as('00000000-0000-0000-0000-0000000000a2',
  $$insert into public.profiles (id, intention, bio)
    values ('00000000-0000-0000-0000-0000000000a2', 'mariage_serieux', 'Upsert normal.')
    on conflict (id) do update set bio = excluded.bio$$),
  '', 'T21 — upsert membre SANS is_premium : toujours autorisé');
select is(
  (select bio from public.profiles
    where id = '00000000-0000-0000-0000-0000000000a2'),
  'Upsert normal.', 'T22 — bio persistée via upsert');

-- ###########################################################################
-- SECTION 5 — ÉTAT PREMIUM SERVEUR (bypass service_role) + membre true→false
-- ###########################################################################

-- Rôle privilégié, claims vides (auth.uid() IS NULL) = flux serveur légitime.
update public.profiles set is_premium = true
 where id = '00000000-0000-0000-0000-0000000000a3';
select is(
  (select is_premium from public.profiles
    where id = '00000000-0000-0000-0000-0000000000a3'),
  true, 'T23 — service_role : false→true accepté (bypass conservé)');

select is(public._prem_as('00000000-0000-0000-0000-0000000000a3',
  $$update public.profiles set is_premium = false
     where id = '00000000-0000-0000-0000-0000000000a3'$$),
  '42501', 'T24 — UPDATE membre true→false : refusé (42501)');
select is(current_setting('test.err', true), 'PROFILE_ADMIN_FIELDS_READ_ONLY',
  'T25 — erreur stable PROFILE_ADMIN_FIELDS_READ_ONLY');
select is(
  (select is_premium from public.profiles
    where id = '00000000-0000-0000-0000-0000000000a3'),
  true, 'T26 — l''état Premium serveur reste intact');

select is(public._prem_as('00000000-0000-0000-0000-0000000000a3',
  $$update public.profiles set bio = 'Membre premium, édition libre.'
     where id = '00000000-0000-0000-0000-0000000000a3'$$),
  '', 'T27 — membre premium : édition ordinaire (bio) jamais entravée');

update public.profiles set is_premium = false
 where id = '00000000-0000-0000-0000-0000000000a3';
select is(
  (select is_premium from public.profiles
    where id = '00000000-0000-0000-0000-0000000000a3'),
  false, 'T28 — service_role : true→false accepté (bypass dans les deux sens)');

-- ###########################################################################
-- SECTION 6 — NON-RÉGRESSION des autres champs administratifs protégés
-- ###########################################################################

select is(public._prem_as('00000000-0000-0000-0000-0000000000a1',
  $$update public.profiles set verification_status = 'approved'
     where id = '00000000-0000-0000-0000-0000000000a1'$$),
  '42501', 'T29 — UPDATE membre verification_status : toujours refusé');

select is(public._prem_as('00000000-0000-0000-0000-0000000000a1',
  $$update public.profiles set account_status = 'suspended'
     where id = '00000000-0000-0000-0000-0000000000a1'$$),
  '42501', 'T30 — UPDATE membre account_status : toujours refusé');

select is(public._prem_as('00000000-0000-0000-0000-0000000000a4',
  $$insert into public.profiles (id, intention, verification_status)
    values ('00000000-0000-0000-0000-0000000000a4', 'mariage_serieux', 'approved')$$),
  '42501', 'T31 — INSERT membre verification_status fabriqué : toujours refusé');

select is(public._prem_as('00000000-0000-0000-0000-0000000000a4',
  $$insert into public.profiles (id, intention, account_status,
                                 suspended_at, suspension_reason)
    values ('00000000-0000-0000-0000-0000000000a4', 'mariage_serieux',
            'suspended', pg_catalog.now(), 'Etat fabrique par le membre.')$$),
  '42501', 'T32 — INSERT membre account_status fabriqué : toujours refusé');

-- ###########################################################################
-- SECTION 7 — DÉCOUVERTE toujours fonctionnelle (lit et trie is_premium)
-- ###########################################################################

select is(public._prem_as('00000000-0000-0000-0000-0000000000b1',
  $$select set_config('test.cnt',
      (select count(*)
         from public.discover_candidates('christian_marriage', 20, 0))::text,
      true)$$),
  '', 'T33 — discover_candidates s''exécute sans erreur pour un membre');
select is(current_setting('test.cnt', true), '1',
  'T34 — le candidat premium (posé côté serveur) est bien renvoyé');

-- ###########################################################################
-- SECTION 8 — POLICIES / PRIVILÈGES / TRIGGER inchangés
-- ###########################################################################

select policies_are('public', 'profiles',
  array['profiles_select_own', 'profiles_insert_own', 'profiles_update_own'],
  'T35 — policies RLS de profiles inchangées (aucune ajoutée/supprimée)');

select ok(has_table_privilege('authenticated', 'public.profiles', 'select'),
  'T36 — authenticated conserve SELECT');
select ok(has_table_privilege('authenticated', 'public.profiles', 'insert'),
  'T37 — authenticated conserve INSERT');
select ok(has_table_privilege('authenticated', 'public.profiles', 'update'),
  'T38 — authenticated conserve UPDATE');
select ok(not has_table_privilege('authenticated', 'public.profiles', 'delete'),
  'T39 — authenticated toujours SANS DELETE');

select has_trigger('public', 'profiles', 'trg_profiles_guard_admin_fields',
  'T40 — trigger de garde admin toujours en place');
select trigger_is('public', 'profiles', 'trg_profiles_guard_admin_fields',
  'public', 'guard_profiles_admin_fields',
  'T41 — le trigger pointe toujours sur guard_profiles_admin_fields');

-- ===========================================================================
select * from finish();
rollback;
