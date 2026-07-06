-- =============================================================================
-- Suite pgTAP — Onboarding « Comment nous as-tu découverts ? »
-- Cibles : colonnes acquisition_*, contraintes, RPC write-once
--          public.record_acquisition_source(text, text) et le trigger de garde
--          trg_profiles_guard_acquisition_fields.
--
-- Exécution : npx supabase test db  (nécessite le stack local Docker).
--             NON exécuté sur cette machine (Docker indisponible) — préparé.
--
-- Principe : TRANSACTION UNIQUE (begin … rollback). Les opérations sensibles
-- sont réellement exécutées SOUS le rôle applicatif `authenticated`/`anon` (avec
-- un JWT local contenant `sub`+`role`, donc un vrai auth.uid()), puis leur
-- RÉSULTAT/EXCEPTION est capturé dans des GUC de session (`test.*`) ; les
-- ASSERTIONS pgTAP sont ensuite jouées en `postgres` (accès aux tables internes
-- pgTAP). Les fonctions d'aide sont créées dans la transaction et disparaissent
-- au ROLLBACK (aucune fonction de debug permanente ajoutée à la migration).
--
-- UUID de travail (constants) :
--   A  = 00000000-0000-0000-0000-0000000000a1  (parcours nominal, write-once)
--   B  = 00000000-0000-0000-0000-0000000000b1  (isolation entre membres)
--   V  = 00000000-0000-0000-0000-0000000000f1  (erreurs de validation)
--   O1 = 00000000-0000-0000-0000-0000000000c1  (source « other »)
--   D1 = 00000000-0000-0000-0000-0000000000d1  (UPDATE direct bloqué)
--   D2 = 00000000-0000-0000-0000-0000000000d2  (INSERT direct bloqué)
--   D3 = 00000000-0000-0000-0000-0000000000d3  (éditions ordinaires autorisées)
--   D4 = 00000000-0000-0000-0000-0000000000d4  (INSERT minimal autorisé)
-- =============================================================================

begin;

create extension if not exists pgtap with schema extensions;

-- pgTAP + catalogues + schéma applicatif accessibles sans qualification.
set search_path = extensions, public, pg_catalog;

-- ---------------------------------------------------------------------------
-- Fonctions d'aide (SECURITY INVOKER : héritent du rôle courant → exécutent
-- réellement l'opération sous `authenticated`/`anon`). Détruites au ROLLBACK.
-- ---------------------------------------------------------------------------

-- Exécute la RPC et capture le retour OU l'exception (SQLSTATE + message).
create function public._acq_cap_rpc(p_source text, p_other text)
returns void language plpgsql as $$
declare v text;
begin
  v := public.record_acquisition_source(p_source, p_other);
  perform set_config('test.ret', coalesce(v, ''), true);
  perform set_config('test.state', '', true);
  perform set_config('test.err', '', true);
exception when others then
  perform set_config('test.ret', '', true);
  perform set_config('test.state', sqlstate, true);
  perform set_config('test.err', sqlerrm, true);
end; $$;

-- Exécute un SQL arbitraire ; capture succès ('') ou exception.
create function public._acq_cap(p_sql text)
returns void language plpgsql as $$
begin
  execute p_sql;
  perform set_config('test.state', '', true);
  perform set_config('test.err', '', true);
exception when others then
  perform set_config('test.state', sqlstate, true);
  perform set_config('test.err', sqlerrm, true);
end; $$;

-- Exécute un DML ; capture le nombre de lignes affectées (ou -1 si exception).
create function public._acq_cap_rows(p_sql text)
returns void language plpgsql as $$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  perform set_config('test.rows', n::text, true);
  perform set_config('test.state', '', true);
  perform set_config('test.err', '', true);
exception when others then
  perform set_config('test.rows', '-1', true);
  perform set_config('test.state', sqlstate, true);
  perform set_config('test.err', sqlerrm, true);
end; $$;

-- Capture le scalaire d'une requête count(*) (respecte la RLS du rôle courant).
create function public._acq_cap_count(p_sql text)
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

-- Backstop : simule une FUTURE régression de la RPC — fonction SECURITY DEFINER
-- détenue par le MÊME propriétaire que la vraie RPC (alignée dynamiquement),
-- qui tente d'écraser une réponse déjà enregistrée. Le trigger doit la bloquer
-- avec ACQUISITION_ALREADY_RECORDED même dans ce contexte « autorisé ».
create function public._acq_sim_regression(p_id uuid, p_source text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles
     set acquisition_source = p_source,
         acquisition_source_recorded_at = pg_catalog.now()
   where id = p_id;
end; $$;

do $$
declare v_owner text;
begin
  select r.rolname into v_owner
    from pg_catalog.pg_proc p
    join pg_catalog.pg_roles r on r.oid = p.proowner
    where p.oid = 'public.record_acquisition_source(text, text)'::pg_catalog.regprocedure;
  execute format('alter function public._acq_sim_regression(uuid, text) owner to %I', v_owner);
end $$;

-- ---------------------------------------------------------------------------
-- Fixtures (créées en `postgres`, avant tout changement de rôle) :
--   utilisateurs auth.users + profils « legacy » minimaux (acquisition NULL).
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'a@ex.test'),
  ('00000000-0000-0000-0000-0000000000b1', 'b@ex.test'),
  ('00000000-0000-0000-0000-0000000000f1', 'v@ex.test'),
  ('00000000-0000-0000-0000-0000000000c1', 'o1@ex.test'),
  ('00000000-0000-0000-0000-0000000000d1', 'd1@ex.test'),
  ('00000000-0000-0000-0000-0000000000d2', 'd2@ex.test'),
  ('00000000-0000-0000-0000-0000000000d3', 'd3@ex.test'),
  ('00000000-0000-0000-0000-0000000000d4', 'd4@ex.test');

-- Profils legacy pré-existants (les 3 colonnes acquisition restent NULL).
insert into public.profiles (id, first_name) values
  ('00000000-0000-0000-0000-0000000000d1', 'Legacy D1'),
  ('00000000-0000-0000-0000-0000000000d3', 'Legacy D3');

-- ===========================================================================
select plan(62);
-- ===========================================================================


-- ###########################################################################
-- SECTION 1 — STRUCTURE SQL RÉELLE (assertions jouées en postgres)
-- ###########################################################################

-- T1..T3 : colonnes présentes
select has_column('profiles', 'acquisition_source',            'profiles.acquisition_source existe');
select has_column('profiles', 'acquisition_source_other',      'profiles.acquisition_source_other existe');
select has_column('profiles', 'acquisition_source_recorded_at','profiles.acquisition_source_recorded_at existe');

-- T4 : fonction RPC présente (signature (text,text))
select has_function('public', 'record_acquisition_source', ARRAY['text','text'],
  'record_acquisition_source(text,text) existe');

-- T5 : RPC = SECURITY DEFINER
select is(
  (select prosecdef from pg_proc
     where oid = 'public.record_acquisition_source(text,text)'::regprocedure),
  true, 'record_acquisition_source est SECURITY DEFINER (prosecdef=true)');

-- T6 : garde = SECURITY INVOKER (prosecdef=false)
select is(
  (select prosecdef from pg_proc
     where oid = 'public.guard_profile_acquisition_fields()'::regprocedure),
  false, 'guard_profile_acquisition_fields est SECURITY INVOKER (prosecdef=false)');

-- T7 : trigger présent
select has_trigger('profiles', 'trg_profiles_guard_acquisition_fields',
  'trigger de garde acquisition présent');

-- T8 : trigger actif (tgenabled = origin)
select is(
  (select tgenabled from pg_trigger
     where tgname = 'trg_profiles_guard_acquisition_fields'
       and tgrelid = 'public.profiles'::regclass),
  'O'::"char", 'trigger de garde acquisition actif');

-- T9 : authenticated possède EXECUTE sur la RPC
select is(
  has_function_privilege('authenticated', 'public.record_acquisition_source(text,text)', 'EXECUTE'),
  true, 'authenticated possède EXECUTE sur la RPC');

-- T10 : anon NE possède PAS EXECUTE
select is(
  has_function_privilege('anon', 'public.record_acquisition_source(text,text)', 'EXECUTE'),
  false, 'anon ne possède pas EXECUTE sur la RPC');

-- T11 : PUBLIC n'a aucun EXECUTE (grantee = 0 = PUBLIC dans aclexplode)
select is(
  (select count(*)::int
     from pg_proc p, aclexplode(p.proacl) a
     where p.oid = 'public.record_acquisition_source(text,text)'::regprocedure
       and a.grantee = 0
       and a.privilege_type = 'EXECUTE'),
  0, 'PUBLIC n''a pas EXECUTE sur la RPC');

-- T12..T14 : contraintes présentes
select is((select count(*)::int from pg_constraint
   where conname='profiles_acquisition_source_check' and conrelid='public.profiles'::regclass),
   1, 'contrainte profiles_acquisition_source_check présente');
select is((select count(*)::int from pg_constraint
   where conname='profiles_acquisition_source_other_check' and conrelid='public.profiles'::regclass),
   1, 'contrainte profiles_acquisition_source_other_check présente');
select is((select count(*)::int from pg_constraint
   where conname='profiles_acquisition_recorded_coherence' and conrelid='public.profiles'::regclass),
   1, 'contrainte profiles_acquisition_recorded_coherence présente');


-- ###########################################################################
-- SECTION 2 — CONTEXTE D'AUTHENTIFICATION
-- ###########################################################################

-- Devient l'utilisateur A et capture auth.uid() + current_user.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-0000000000a1','role','authenticated')::text, true);
select set_config('test.uid', (select auth.uid())::text, true);
select set_config('test.cu',  current_user, true);
reset role;

-- T15 : auth.uid() correspond bien à A
select is(current_setting('test.uid', true), '00000000-0000-0000-0000-0000000000a1',
  'auth.uid() = A sous le contexte authentifié de A');

-- T16 : current_user vaut bien 'authenticated' lors d'une écriture directe membre
select is(current_setting('test.cu', true), 'authenticated',
  'current_user = authenticated en contexte membre direct');


-- ###########################################################################
-- SECTION 3 — PARCOURS NOMINAL A : première écriture, idempotence, immutabilité
-- ###########################################################################

-- (A) 1re réponse via RPC (profil A inexistant).
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-0000000000a1','role','authenticated')::text, true);
select public._acq_cap_rpc('instagram', null);
reset role;

-- T17 : retour 'recorded' (la RPC écrit MALGRÉ le trigger de garde)
select is(current_setting('test.ret', true), 'recorded', 'A : 1er appel retourne recorded');
-- T18 : la RPC a créé le profil minimal
select is((select count(*)::int from public.profiles where id='00000000-0000-0000-0000-0000000000a1'),
  1, 'A : profil créé par la RPC');
-- T19 : source enregistrée = valeur envoyée
select is((select acquisition_source from public.profiles where id='00000000-0000-0000-0000-0000000000a1'),
  'instagram', 'A : source = instagram');
-- T20 : recorded_at non NULL
select is((select acquisition_source_recorded_at is not null
   from public.profiles where id='00000000-0000-0000-0000-0000000000a1'),
  true, 'A : recorded_at renseigné');
-- T21 : champs administratifs aux défauts sûrs
select is((select verification_status::text||'/'||account_status::text
   from public.profiles where id='00000000-0000-0000-0000-0000000000a1'),
  'pending/active', 'A : verification=pending, account=active (défauts sûrs)');
-- T22 : A n'a PAS pu écrire pour B (B n'a aucune donnée d'acquisition)
select is((select count(*)::int from public.profiles
   where id='00000000-0000-0000-0000-0000000000b1' and acquisition_source is not null),
  0, 'A ne peut pas enregistrer la réponse de B');

-- Mémorise l'horodatage initial de A pour prouver son immutabilité.
select set_config('test.a_at',
  (select acquisition_source_recorded_at::text from public.profiles
     where id='00000000-0000-0000-0000-0000000000a1'), true);

-- (A) 2e appel IDENTIQUE → unchanged (sans UPDATE).
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-0000000000a1','role','authenticated')::text, true);
select public._acq_cap_rpc('instagram', null);
reset role;
-- T23 : retour 'unchanged'
select is(current_setting('test.ret', true), 'unchanged', 'A : même réponse → unchanged');
-- T24 : recorded_at inchangé
select is((select acquisition_source_recorded_at::text from public.profiles
   where id='00000000-0000-0000-0000-0000000000a1'),
  current_setting('test.a_at', true), 'A : recorded_at inchangé après unchanged');

-- (A) 2e appel DIFFÉRENT → already_recorded (1re réponse conservée).
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-0000000000a1','role','authenticated')::text, true);
select public._acq_cap_rpc('facebook', null);
reset role;
-- T25 : retour 'already_recorded'
select is(current_setting('test.ret', true), 'already_recorded', 'A : réponse différente → already_recorded');
-- T26 : source initiale intacte
select is((select acquisition_source from public.profiles where id='00000000-0000-0000-0000-0000000000a1'),
  'instagram', 'A : source initiale intacte après already_recorded');
-- T27 : horodatage initial intact
select is((select acquisition_source_recorded_at::text from public.profiles
   where id='00000000-0000-0000-0000-0000000000a1'),
  current_setting('test.a_at', true), 'A : horodatage initial intact');

-- (A) édition ORDINAIRE ultérieure du profil : autorisée.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-0000000000a1','role','authenticated')::text, true);
select public._acq_cap('update public.profiles set first_name=''Aicha'' where id=''00000000-0000-0000-0000-0000000000a1''');
reset role;
-- T28 : succès (aucune exception)
select is(current_setting('test.err', true), '', 'A : édition ordinaire du profil autorisée');
-- T29 : valeur appliquée
select is((select first_name from public.profiles where id='00000000-0000-0000-0000-0000000000a1'),
  'Aicha', 'A : first_name mis à jour');

-- (A) écritures DIRECTES des colonnes acquisition : bloquées.
-- T30 : remplacer la source
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-0000000000a1','role','authenticated')::text, true);
select public._acq_cap('update public.profiles set acquisition_source=''facebook'' where id=''00000000-0000-0000-0000-0000000000a1''');
reset role;
select is(current_setting('test.state', true)||'|'||current_setting('test.err', true),
  '42501|ACQUISITION_FIELDS_READ_ONLY', 'A : remplacement direct de la source refusé');

-- T31 : effacer les trois champs
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-0000000000a1','role','authenticated')::text, true);
select public._acq_cap('update public.profiles set acquisition_source=null, acquisition_source_other=null, acquisition_source_recorded_at=null where id=''00000000-0000-0000-0000-0000000000a1''');
reset role;
select is(current_setting('test.state', true)||'|'||current_setting('test.err', true),
  '42501|ACQUISITION_FIELDS_READ_ONLY', 'A : effacement direct refusé');

-- T32 : modifier UNIQUEMENT recorded_at (valeur différente : now() serait
-- identique dans la même transaction → on force une date distincte).
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-0000000000a1','role','authenticated')::text, true);
select public._acq_cap('update public.profiles set acquisition_source_recorded_at=''2000-01-01T00:00:00Z''::timestamptz where id=''00000000-0000-0000-0000-0000000000a1''');
reset role;
select is(current_setting('test.state', true)||'|'||current_setting('test.err', true),
  '42501|ACQUISITION_FIELDS_READ_ONLY', 'A : modification directe de recorded_at seul refusée');

-- T33 : modifier UNIQUEMENT la précision other
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-0000000000a1','role','authenticated')::text, true);
select public._acq_cap('update public.profiles set acquisition_source_other=''bidouille'' where id=''00000000-0000-0000-0000-0000000000a1''');
reset role;
select is(current_setting('test.state', true)||'|'||current_setting('test.err', true),
  '42501|ACQUISITION_FIELDS_READ_ONLY', 'A : modification directe de other seul refusée');

-- T34 : BACKSTOP — même sous le propriétaire de la RPC (contexte « autorisé »),
-- l'écrasement d'une réponse déjà enregistrée est bloqué.
select public._acq_cap('select public._acq_sim_regression(''00000000-0000-0000-0000-0000000000a1''::uuid, ''youtube'')');
select is(current_setting('test.state', true)||'|'||current_setting('test.err', true),
  '42501|ACQUISITION_ALREADY_RECORDED',
  'Backstop : régression RPC simulée bloquée par le trigger (ACQUISITION_ALREADY_RECORDED)');
-- T35 : la 1re réponse de A reste intacte après toutes les tentatives
select is((select acquisition_source from public.profiles where id='00000000-0000-0000-0000-0000000000a1'),
  'instagram', 'A : réponse initiale immuable après toutes tentatives d''écrasement');


-- ###########################################################################
-- SECTION 4 — AUTHENTIFICATION / VALIDATION DES PARAMÈTRES
-- ###########################################################################

-- T36/T37 : anonyme ne peut pas exécuter la RPC (droit EXECUTE révoqué).
set local role anon;
select set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
select public._acq_cap_rpc('instagram', null);
reset role;
select is(current_setting('test.state', true), '42501', 'anon : appel RPC refusé (SQLSTATE 42501)');
select matches(current_setting('test.err', true), 'permission denied',
  'anon : message « permission denied » sur la RPC');

-- Erreurs de validation sous l'utilisateur V (authentifié). Aucune ne crée de ligne.
-- T38 : source inconnue
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-0000000000f1','role','authenticated')::text, true);
select public._acq_cap_rpc('linkedin', null);
reset role;
select is(current_setting('test.state', true)||'|'||current_setting('test.err', true),
  '22023|invalid acquisition source', 'V : source inconnue refusée');

-- T39 : other sans précision
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-0000000000f1','role','authenticated')::text, true);
select public._acq_cap_rpc('other', null);
reset role;
select is(current_setting('test.state', true)||'|'||current_setting('test.err', true),
  '22023|acquisition detail required for source other', 'V : other sans précision refusé');

-- T40 : other avec chaîne vide
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-0000000000f1','role','authenticated')::text, true);
select public._acq_cap_rpc('other', '');
reset role;
select is(current_setting('test.state', true)||'|'||current_setting('test.err', true),
  '22023|acquisition detail required for source other', 'V : other avec chaîne vide refusé');

-- T41 : other avec uniquement des espaces
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-0000000000f1','role','authenticated')::text, true);
select public._acq_cap_rpc('other', '   ');
reset role;
select is(current_setting('test.state', true)||'|'||current_setting('test.err', true),
  '22023|acquisition detail required for source other', 'V : other espaces seuls refusé');

-- T42 : précision > 120 caractères
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-0000000000f1','role','authenticated')::text, true);
select public._acq_cap_rpc('other', repeat('x', 121));
reset role;
select is(current_setting('test.state', true)||'|'||current_setting('test.err', true),
  '22023|acquisition detail too long', 'V : précision > 120 refusée');

-- T43 : précision fournie pour une source ≠ other
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-0000000000f1','role','authenticated')::text, true);
select public._acq_cap_rpc('google', 'via un ami');
reset role;
select is(current_setting('test.state', true)||'|'||current_setting('test.err', true),
  '22023|acquisition detail not allowed for this source', 'V : précision interdite hors other');


-- ###########################################################################
-- SECTION 5 — ÉCRITURES DIRECTES / ÉDITIONS ORDINAIRES (D1..D4)
-- ###########################################################################

-- T44 : UPDATE direct des colonnes acquisition (D1, sans réponse préalable) → bloqué
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-0000000000d1','role','authenticated')::text, true);
select public._acq_cap('update public.profiles set acquisition_source=''tiktok'', acquisition_source_recorded_at=now() where id=''00000000-0000-0000-0000-0000000000d1''');
reset role;
select is(current_setting('test.state', true)||'|'||current_setting('test.err', true),
  '42501|ACQUISITION_FIELDS_READ_ONLY', 'D1 : UPDATE direct acquisition refusé');

-- T45 : INSERT direct d'un profil portant des colonnes acquisition (D2) → bloqué
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-0000000000d2','role','authenticated')::text, true);
select public._acq_cap('insert into public.profiles (id, acquisition_source, acquisition_source_recorded_at) values (''00000000-0000-0000-0000-0000000000d2'', ''tiktok'', now())');
reset role;
select is(current_setting('test.state', true)||'|'||current_setting('test.err', true),
  '42501|ACQUISITION_FIELDS_READ_ONLY', 'D2 : INSERT direct avec acquisition refusé');

-- T46/T47 : INSERT minimal SANS acquisition (D4) → autorisé
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-0000000000d4','role','authenticated')::text, true);
select public._acq_cap('insert into public.profiles (id, first_name) values (''00000000-0000-0000-0000-0000000000d4'', ''Neo'')');
reset role;
select is(current_setting('test.err', true), '', 'D4 : INSERT minimal sans acquisition autorisé');
select is((select count(*)::int from public.profiles where id='00000000-0000-0000-0000-0000000000d4'),
  1, 'D4 : profil minimal bien créé');

-- T48..T50 : profil legacy (acquisition NULL) — éditions ordinaires autorisées (D3)
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-0000000000d3','role','authenticated')::text, true);
select public._acq_cap('update public.profiles set first_name=''Moussa'' where id=''00000000-0000-0000-0000-0000000000d3''');
reset role;
select is(current_setting('test.err', true), '', 'D3 legacy : modification de first_name autorisée');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-0000000000d3','role','authenticated')::text, true);
select public._acq_cap('update public.profiles set bio=''Quelques mots.'' where id=''00000000-0000-0000-0000-0000000000d3''');
reset role;
select is(current_setting('test.err', true), '', 'D3 legacy : modification de bio autorisée');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-0000000000d3','role','authenticated')::text, true);
select public._acq_cap('update public.profiles set city=''Dakar'' where id=''00000000-0000-0000-0000-0000000000d3''');
reset role;
select is(current_setting('test.err', true), '', 'D3 legacy : modification de city autorisée');


-- ###########################################################################
-- SECTION 6 — SOURCE « OTHER » (normalisation btrim + write-once)
-- ###########################################################################

-- T51..T53 : 1re réponse other valide → recorded, précision normalisée conservée.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-0000000000c1','role','authenticated')::text, true);
select public._acq_cap_rpc('other', '  Podcast mariage  ');
reset role;
select is(current_setting('test.ret', true), 'recorded', 'O1 : other valide → recorded');
select is((select acquisition_source_other from public.profiles where id='00000000-0000-0000-0000-0000000000c1'),
  'Podcast mariage', 'O1 : précision normalisée par btrim');
select is((select acquisition_source from public.profiles where id='00000000-0000-0000-0000-0000000000c1'),
  'other', 'O1 : source = other');

-- T54 : même other normalisé → unchanged
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-0000000000c1','role','authenticated')::text, true);
select public._acq_cap_rpc('other', 'Podcast mariage');
reset role;
select is(current_setting('test.ret', true), 'unchanged', 'O1 : même other normalisé → unchanged');

-- T55 : précision différente → already_recorded
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-0000000000c1','role','authenticated')::text, true);
select public._acq_cap_rpc('other', 'Autre chose');
reset role;
select is(current_setting('test.ret', true), 'already_recorded', 'O1 : autre précision → already_recorded');

-- T56 : première précision intacte
select is((select acquisition_source_other from public.profiles where id='00000000-0000-0000-0000-0000000000c1'),
  'Podcast mariage', 'O1 : première précision intacte');


-- ###########################################################################
-- SECTION 7 — ISOLATION ENTRE MEMBRES (A / B) + RLS
-- ###########################################################################

-- B enregistre sa propre source.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-0000000000b1','role','authenticated')::text, true);
select public._acq_cap_rpc('tiktok', null);
reset role;
-- T57 : B → recorded
select is(current_setting('test.ret', true), 'recorded', 'B : enregistre sa propre source (recorded)');
-- T58 : l'enregistrement de B n'altère pas A
select is((select acquisition_source from public.profiles where id='00000000-0000-0000-0000-0000000000a1'),
  'instagram', 'B : n''altère pas la réponse de A');
-- T59 : réponse finale de A = première valeur
select is((select acquisition_source from public.profiles where id='00000000-0000-0000-0000-0000000000a1'),
  'instagram', 'A : réponse finale = première valeur enregistrée');
-- T60 : réponse finale de B = sa propre valeur
select is((select acquisition_source from public.profiles where id='00000000-0000-0000-0000-0000000000b1'),
  'tiktok', 'B : réponse finale = tiktok');

-- T61 : A ne peut pas LIRE la ligne de B (RLS select_own).
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-0000000000a1','role','authenticated')::text, true);
select public._acq_cap_count('select count(*) from public.profiles where id=''00000000-0000-0000-0000-0000000000b1''');
reset role;
select is(current_setting('test.cnt', true), '0', 'RLS : A ne voit pas la ligne de B');

-- T62 : A ne peut pas MODIFIER la ligne de B (RLS update_own → 0 ligne affectée).
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-0000000000a1','role','authenticated')::text, true);
select public._acq_cap_rows('update public.profiles set first_name=''X'' where id=''00000000-0000-0000-0000-0000000000b1''');
reset role;
select is(current_setting('test.rows', true), '0', 'RLS : A ne peut pas modifier la ligne de B');


-- ===========================================================================
select * from finish();
rollback;
