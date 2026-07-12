-- =============================================================================
-- Suite pgTAP — Consentement au partage public limité (PR1 partage de profils)
-- Cibles : table public.profile_share_consents (contraintes, index, RLS,
--          privilèges) et RPC public.grant_my_profile_share_consent() /
--          public.withdraw_my_profile_share_consent().
--
-- Exécution : npx supabase test db  (nécessite le stack local Docker).
--             NON exécuté sur cette machine (Docker indisponible) — préparé.
--
-- Principe : TRANSACTION UNIQUE (begin … rollback). Les opérations sensibles
-- sont réellement exécutées SOUS le rôle applicatif `authenticated`/`anon`
-- (JWT local avec `sub`+`role`, donc un vrai auth.uid()), le résultat ou
-- l'exception est capturé dans des GUC de session (`test.*`), puis les
-- assertions pgTAP sont jouées en `postgres`.
--
-- UUID de travail (constants) :
--   A = 00000000-0000-0000-0000-0000000000a1  (parcours nominal grant/withdraw)
--   B = 00000000-0000-0000-0000-0000000000b1  (isolation entre membres)
--   N = 00000000-0000-0000-0000-0000000000e1  (utilisateur SANS profil)
-- =============================================================================

begin;

create extension if not exists pgtap with schema extensions;

set search_path = extensions, public, pg_catalog;

-- ---------------------------------------------------------------------------
-- Fonctions d'aide (SECURITY INVOKER : héritent du rôle courant). Détruites
-- au ROLLBACK.
-- ---------------------------------------------------------------------------

-- Exécute un SQL arbitraire ; capture succès ('') ou exception.
create function public._psc_cap(p_sql text)
returns void language plpgsql as $$
begin
  execute p_sql;
  perform set_config('test.state', '', true);
  perform set_config('test.err', '', true);
exception when others then
  perform set_config('test.state', sqlstate, true);
  perform set_config('test.err', sqlerrm, true);
end; $$;

-- Exécute grant_my_profile_share_consent() ; capture (consent_id,
-- was_already_active) ou l'exception.
create function public._psc_cap_grant()
returns void language plpgsql as $$
declare v_id uuid; v_reused boolean;
begin
  select consent_id, was_already_active
    into v_id, v_reused
    from public.grant_my_profile_share_consent();
  perform set_config('test.grant_id', coalesce(v_id::text, ''), true);
  perform set_config('test.grant_reused', coalesce(v_reused::text, ''), true);
  perform set_config('test.state', '', true);
  perform set_config('test.err', '', true);
exception when others then
  perform set_config('test.grant_id', '', true);
  perform set_config('test.grant_reused', '', true);
  perform set_config('test.state', sqlstate, true);
  perform set_config('test.err', sqlerrm, true);
end; $$;

-- Exécute withdraw_my_profile_share_consent() ; capture le booléen ou l'exception.
create function public._psc_cap_withdraw()
returns void language plpgsql as $$
declare v boolean;
begin
  v := public.withdraw_my_profile_share_consent();
  perform set_config('test.withdrawn', coalesce(v::text, ''), true);
  perform set_config('test.state', '', true);
  perform set_config('test.err', '', true);
exception when others then
  perform set_config('test.withdrawn', '', true);
  perform set_config('test.state', sqlstate, true);
  perform set_config('test.err', sqlerrm, true);
end; $$;

-- Capture le scalaire d'une requête count(*) (respecte la RLS du rôle courant).
create function public._psc_cap_count(p_sql text)
returns void language plpgsql as $$
declare n bigint;
begin
  execute p_sql into n;
  perform set_config('test.cnt', coalesce(n, 0)::text, true);
  perform set_config('test.state', '', true);
  perform set_config('test.err', '', true);
exception when others then
  perform set_config('test.cnt', '-1', true);
  perform set_config('test.state', sqlstate, true);
  perform set_config('test.err', sqlerrm, true);
end; $$;

-- Bascule le rôle applicatif + identité JWT (raccourci lisible).
create function public._psc_as(p_uid text)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end; $$;

-- ---------------------------------------------------------------------------
-- Fixtures (créées en `postgres`, avant tout changement de rôle).
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'a@ex.test'),
  ('00000000-0000-0000-0000-0000000000b1', 'b@ex.test'),
  ('00000000-0000-0000-0000-0000000000e1', 'n@ex.test');

insert into public.profiles (id, first_name) values
  ('00000000-0000-0000-0000-0000000000a1', 'Membre A'),
  ('00000000-0000-0000-0000-0000000000b1', 'Membre B');
-- N (…e1) : utilisateur auth SANS profil (cas profil manquant).

-- ===========================================================================
select plan(34);
-- ===========================================================================


-- ###########################################################################
-- SECTION 1 — STRUCTURE SQL RÉELLE (assertions jouées en postgres)
-- ###########################################################################

-- T1..T2 : table + colonnes clés présentes
select has_table('public', 'profile_share_consents', 'table profile_share_consents présente');
select columns_are('public', 'profile_share_consents',
  array['id','profile_id','policy_version','consent_text','consented_at',
        'withdrawn_at','withdrawn_by','created_at'],
  'colonnes attendues exactes');

-- T3 : RLS activée
select is(
  (select relrowsecurity from pg_class where oid = 'public.profile_share_consents'::regclass),
  true, 'RLS activée sur profile_share_consents');

-- T4 : une seule policy (SELECT own) — aucune policy d'écriture
select is(
  (select count(*)::int from pg_policies
     where schemaname='public' and tablename='profile_share_consents'),
  1, 'exactement une policy (select_own), aucune policy d''écriture');

-- T5..T6 : RPC présentes et SECURITY DEFINER
select is(
  (select prosecdef from pg_proc
     where oid = 'public.grant_my_profile_share_consent()'::regprocedure),
  true, 'grant_my_profile_share_consent est SECURITY DEFINER');
select is(
  (select prosecdef from pg_proc
     where oid = 'public.withdraw_my_profile_share_consent()'::regprocedure),
  true, 'withdraw_my_profile_share_consent est SECURITY DEFINER');

-- T7..T8 : search_path verrouillé sur les deux RPC
select ok(
  (select proconfig::text like '%search_path=%' from pg_proc
     where oid = 'public.grant_my_profile_share_consent()'::regprocedure),
  'grant : search_path explicitement fixé');
select ok(
  (select proconfig::text like '%search_path=%' from pg_proc
     where oid = 'public.withdraw_my_profile_share_consent()'::regprocedure),
  'withdraw : search_path explicitement fixé');

-- T9..T12 : droits d'exécution — authenticated OUI, anon NON
select is(has_function_privilege('authenticated', 'public.grant_my_profile_share_consent()', 'EXECUTE'),
  true,  'authenticated peut exécuter grant');
select is(has_function_privilege('anon', 'public.grant_my_profile_share_consent()', 'EXECUTE'),
  false, 'anon ne peut pas exécuter grant');
select is(has_function_privilege('authenticated', 'public.withdraw_my_profile_share_consent()', 'EXECUTE'),
  true,  'authenticated peut exécuter withdraw');
select is(has_function_privilege('anon', 'public.withdraw_my_profile_share_consent()', 'EXECUTE'),
  false, 'anon ne peut pas exécuter withdraw');

-- T13..T14 : privilèges de table — anon rien, authenticated SELECT seul
select is(has_table_privilege('anon', 'public.profile_share_consents', 'SELECT'),
  false, 'anon ne peut pas lire la table');
select is(
  has_table_privilege('authenticated', 'public.profile_share_consents', 'INSERT')
  or has_table_privilege('authenticated', 'public.profile_share_consents', 'UPDATE')
  or has_table_privilege('authenticated', 'public.profile_share_consents', 'DELETE'),
  false, 'authenticated n''a AUCUN privilège d''écriture directe');


-- ###########################################################################
-- SECTION 2 — ANONYME REFUSÉ
-- ###########################################################################

-- T15 : la RPC grant échoue sous anon (pas d'EXECUTE → 42501)
set local role anon;
select public._psc_cap('select * from public.grant_my_profile_share_consent()');
reset role;
select is(current_setting('test.state', true), '42501', 'anon : grant refusé (42501)');

-- T16 : lecture de la table refusée sous anon
set local role anon;
select public._psc_cap('select count(*) from public.profile_share_consents');
reset role;
select is(current_setting('test.state', true), '42501', 'anon : lecture refusée (42501)');


-- ###########################################################################
-- SECTION 3 — PARCOURS NOMINAL DU MEMBRE A
-- ###########################################################################

-- T17 : grant crée un consentement actif (was_already_active = false)
set local role authenticated;
select public._psc_as('00000000-0000-0000-0000-0000000000a1');
select public._psc_cap_grant();
reset role;
select is(current_setting('test.state', true), '', 'A : grant réussit');
-- T18
select is(current_setting('test.grant_reused', true), 'false',
  'A : premier grant crée (was_already_active=false)');

-- T19 : la version et le texte sont bien ceux DU SERVEUR
select is(
  (select policy_version from public.profile_share_consents
     where profile_id = '00000000-0000-0000-0000-0000000000a1' and withdrawn_at is null),
  '2026-07-v1', 'policy_version définie côté serveur (2026-07-v1)');
-- T20
select is(
  (select consent_text from public.profile_share_consents
     where profile_id = '00000000-0000-0000-0000-0000000000a1' and withdrawn_at is null),
  'J’autorise KASSALAFAM à publier et partager une présentation limitée de mon profil à des fins de mise en relation matrimoniale.',
  'consent_text défini côté serveur (texte officiel v1)');

-- T21 : grant répété → même ligne, aucun doublon (was_already_active = true)
set local role authenticated;
select public._psc_as('00000000-0000-0000-0000-0000000000a1');
select public._psc_cap_grant();
reset role;
select is(current_setting('test.grant_reused', true), 'true',
  'A : grant répété réutilise (was_already_active=true)');
-- T22
select is(
  (select count(*)::int from public.profile_share_consents
     where profile_id = '00000000-0000-0000-0000-0000000000a1'),
  1, 'A : toujours UNE seule ligne après grant répété');

-- T23 : A lit son consentement via la table (RLS select_own)
set local role authenticated;
select public._psc_as('00000000-0000-0000-0000-0000000000a1');
select public._psc_cap_count('select count(*) from public.profile_share_consents');
reset role;
select is(current_setting('test.cnt', true), '1', 'A : lit sa propre ligne (RLS)');

-- T24 : B ne voit PAS le consentement de A (RLS select_own)
set local role authenticated;
select public._psc_as('00000000-0000-0000-0000-0000000000b1');
select public._psc_cap_count('select count(*) from public.profile_share_consents');
reset role;
select is(current_setting('test.cnt', true), '0', 'B : ne voit pas la ligne de A (RLS)');

-- T25 : INSERT direct refusé pour un membre (aucun privilège d'écriture)
set local role authenticated;
select public._psc_as('00000000-0000-0000-0000-0000000000b1');
select public._psc_cap(
  'insert into public.profile_share_consents (profile_id, policy_version, consent_text) '
  || 'values (''00000000-0000-0000-0000-0000000000b1'', ''hack'', ''hack'')');
reset role;
select is(current_setting('test.state', true), '42501', 'membre : INSERT direct refusé (42501)');

-- T26 : UPDATE direct refusé pour un membre (même sur SA ligne potentielle)
set local role authenticated;
select public._psc_as('00000000-0000-0000-0000-0000000000a1');
select public._psc_cap(
  'update public.profile_share_consents set policy_version = ''hack'' '
  || 'where profile_id = ''00000000-0000-0000-0000-0000000000a1''');
reset role;
select is(current_setting('test.state', true), '42501', 'membre : UPDATE direct refusé (42501)');

-- T27 : un membre ne peut JAMAIS consentir pour un autre profil — la RPC ne
--       prend aucun profile_id : l'identité vient d'auth.uid(). Le grant de B
--       n'a créé AUCUNE ligne pour A ni modifié la sienne : vérifions que le
--       grant sous l'identité B ne touche que B.
set local role authenticated;
select public._psc_as('00000000-0000-0000-0000-0000000000b1');
select public._psc_cap_grant();
reset role;
select is(
  (select count(*)::int from public.profile_share_consents
     where profile_id = '00000000-0000-0000-0000-0000000000b1' and withdrawn_at is null),
  1, 'B : grant sous identité B ne crée que pour B (auth.uid, pas de paramètre)');
-- T28 : … et la ligne de A est intacte (toujours 1, active)
select is(
  (select count(*)::int from public.profile_share_consents
     where profile_id = '00000000-0000-0000-0000-0000000000a1'),
  1, 'A : ligne inchangée par le grant de B');


-- ###########################################################################
-- SECTION 4 — RETRAIT (withdraw) ET RE-CONSENTEMENT
-- ###########################################################################

-- T29 : withdraw retire le consentement actif de A (true) sans supprimer
set local role authenticated;
select public._psc_as('00000000-0000-0000-0000-0000000000a1');
select public._psc_cap_withdraw();
reset role;
select is(current_setting('test.withdrawn', true), 'true', 'A : withdraw retourne true');
-- T30 : la ligne existe toujours (historique conservé), retirée et attribuée
select is(
  (select count(*)::int from public.profile_share_consents
     where profile_id = '00000000-0000-0000-0000-0000000000a1'
       and withdrawn_at is not null
       and withdrawn_by = '00000000-0000-0000-0000-0000000000a1'),
  1, 'A : ligne conservée, withdrawn_at + withdrawn_by renseignés');

-- T31 : withdraw répété = idempotent (false, aucune erreur)
set local role authenticated;
select public._psc_as('00000000-0000-0000-0000-0000000000a1');
select public._psc_cap_withdraw();
reset role;
select is(current_setting('test.withdrawn', true), 'false', 'A : withdraw répété retourne false');

-- T32 : un nouveau grant après retrait crée une NOUVELLE ligne (historique = 2)
set local role authenticated;
select public._psc_as('00000000-0000-0000-0000-0000000000a1');
select public._psc_cap_grant();
reset role;
select is(
  (select count(*)::int from public.profile_share_consents
     where profile_id = '00000000-0000-0000-0000-0000000000a1'),
  2, 'A : re-consentement = nouvelle ligne, historique conservé (2 lignes)');
-- T33 : … avec UNE seule ligne active (index partiel respecté)
select is(
  (select count(*)::int from public.profile_share_consents
     where profile_id = '00000000-0000-0000-0000-0000000000a1' and withdrawn_at is null),
  1, 'A : une seule ligne ACTIVE après re-consentement');


-- ###########################################################################
-- SECTION 5 — PROFIL MANQUANT
-- ###########################################################################

-- T34 : utilisateur auth SANS profil → grant refusé proprement (P0002)
set local role authenticated;
select public._psc_as('00000000-0000-0000-0000-0000000000e1');
select public._psc_cap_grant();
reset role;
select is(current_setting('test.state', true), 'P0002', 'sans profil : grant refusé (P0002)');


-- ===========================================================================
select * from finish();
rollback;
