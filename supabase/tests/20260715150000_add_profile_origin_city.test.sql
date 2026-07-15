-- =============================================================================
-- Suite pgTAP — Ville d'origine (profiles.origin_city, PR Origine/Résidence).
-- Cibles : colonne + CHECK profiles_origin_city_chk, écriture RLS owner-only,
--          indépendance Origine/Résidence, prédicat
--          public.profile_meets_onboarding_requirements (les 4 champs géo
--          requis + région), RPC public.complete_member_onboarding
--          (ONBOARDING_INCOMPLETE_LOCATION), compatibilité des profils
--          historiques (marqueur posé + origin_city NULL, jamais re-bloqués),
--          absence de policy publique/anonyme, non-exposition dans la
--          projection de découverte, non-régression is_premium.
--
-- Exécution : npx supabase test db — nécessite un stack Supabase local avec
--             Docker (VPS Hostinger pour ce dépôt). JAMAIS en Production.
--
-- Principe : TRANSACTION UNIQUE (begin … rollback), aucune donnée conservée.
-- Les opérations membre sont exécutées SOUS le rôle applicatif `authenticated`
-- (JWT local `sub`+`role` → vrai auth.uid()) ; l'issue est capturée dans des
-- GUC `test.*` ; les assertions pgTAP sont jouées en `postgres`. Les claims
-- JWT sont VIDÉS après chaque opération membre.
--
-- UUID de travail :
--   D1 = 00000000-0000-0000-0000-0000000000d1 (CHECK + écriture owner +
--                                              indépendance Origine/Résidence)
--   D2 = 00000000-0000-0000-0000-0000000000d2 (prédicat + RPC : refus/succès)
--   D3 = 00000000-0000-0000-0000-0000000000d3 (historique : marqueur posé,
--                                              origin_city NULL)
--   D4 = 00000000-0000-0000-0000-0000000000d4 (cible du test inter-membres)
-- =============================================================================

begin;

create extension if not exists pgtap with schema extensions;

set search_path = extensions, public, pg_catalog;

-- Base AVANT fixtures : sur un stack reconstruit depuis les migrations seules,
-- ce compte vaut 0 → preuve que la migration (DDL pur) n'a modifié/créé
-- aucune ligne.
select set_config('test.pre_rows',
  (select count(*) from public.profiles)::text, true);

-- ---------------------------------------------------------------------------
-- Fonctions d'aide (SECURITY INVOKER). Détruites au ROLLBACK.
-- ---------------------------------------------------------------------------

-- Exécute un SQL arbitraire ; capture succès ('') ou exception (state + err).
create function public._oc_cap(p_sql text)
returns void language plpgsql as $$
begin
  execute p_sql;
  perform set_config('test.state', '', true);
  perform set_config('test.err', '', true);
exception when others then
  perform set_config('test.state', sqlstate, true);
  perform set_config('test.err', sqlerrm, true);
end; $$;

-- Exécute p_sql SOUS `authenticated` (JWT sub = p_sub), restaure le rôle
-- privilégié ET vide les claims.
create function public._oc_as(p_sub uuid, p_sql text)
returns text language plpgsql as $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
  perform public._oc_cap(p_sql);
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return current_setting('test.state', true);
end; $$;

-- Appelle la RPC de finalisation SOUS p_sub ; capture retour/erreur ; renvoie
-- le sqlstate ('' = succès).
create function public._oc_rpc(p_sub uuid)
returns text language plpgsql as $$
declare v timestamptz;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
  begin
    v := public.complete_member_onboarding();
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
end; $$;

-- Prédicat (exécuté en postgres — révoqué pour authenticated, par design).
create function public._oc_meets(p_id uuid)
returns boolean language sql as $$
  select public.profile_meets_onboarding_requirements(p)
  from public.profiles p where p.id = p_id;
$$;

-- Profil COMPLET (toutes les exigences, origin_city INCLUSE).
create function public._oc_seed_complete(p_id uuid)
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
    'Ingénieur', 'master', 180,
    'Sénégal', 'Dakar', 'Cameroun', 'Douala', 'Littoral',
    array['build_family','stable_home'], array['kindness','sincerity'], 'no', 'wants_children',
    'Présentation de test.', 'Attentes de test.',
    'google', pg_catalog.now()
  );
  insert into public.photos (profile_id, storage_path, is_primary)
  values (p_id, p_id::text || '/photo-principale.webp', true);
end; $$;

-- ---------------------------------------------------------------------------
-- Fixtures (en `postgres`, claims vides → bypass service_role légitime).
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'oc-d1@ex.test'),
  ('00000000-0000-0000-0000-0000000000d2', 'oc-d2@ex.test'),
  ('00000000-0000-0000-0000-0000000000d3', 'oc-d3@ex.test'),
  ('00000000-0000-0000-0000-0000000000d4', 'oc-d4@ex.test');

-- D1 : résidence + origine (pays) posées ; origin_city testée sous membre.
insert into public.profiles (id, intention, origin_country, country, city, region)
values ('00000000-0000-0000-0000-0000000000d1', 'mariage_serieux',
        'Cameroun', 'Cameroun', 'Douala', 'Littoral');

-- D2 : profil complet (refus/succès RPC pilotés par mutations ciblées).
select public._oc_seed_complete('00000000-0000-0000-0000-0000000000d2');

-- D3 : profil HISTORIQUE — complet SAUF origin_city, marqueur DÉJÀ posé
-- (write-once, posé directement : postgres est propriétaire de la RPC).
select public._oc_seed_complete('00000000-0000-0000-0000-0000000000d3');
update public.profiles
   set origin_city = null, onboarding_completed_at = pg_catalog.now()
 where id = '00000000-0000-0000-0000-0000000000d3';

-- D4 : cible du test inter-membres (origin_city posée côté serveur).
insert into public.profiles (id, intention, origin_city)
values ('00000000-0000-0000-0000-0000000000d4', 'mariage_serieux', 'Bafoussam');

-- ===========================================================================
select plan(40);
-- ===========================================================================

-- ###########################################################################
-- SECTION 1 — STRUCTURE + MIGRATION SANS DML
-- ###########################################################################

select has_column('public', 'profiles', 'origin_city',
  'T1 — colonne origin_city présente');
select col_type_is('public', 'profiles', 'origin_city', 'text',
  'T2 — type text');
select col_is_null('public', 'profiles', 'origin_city',
  'T3 — colonne nullable (compatibilité des profils historiques)');
select col_hasnt_default('public', 'profiles', 'origin_city',
  'T4 — aucune valeur par défaut');
select is(current_setting('test.pre_rows', true), '0',
  'T5 — stack reconstruit depuis les migrations : aucune ligne créée/modifiée par la migration');

-- ###########################################################################
-- SECTION 2 — CHECK + ÉCRITURE OWNER (sous authenticated, membre D1)
-- ###########################################################################

select is(public._oc_as('00000000-0000-0000-0000-0000000000d1',
  $$update public.profiles set origin_city = 'Yaoundé'
     where id = '00000000-0000-0000-0000-0000000000d1'$$),
  '', 'T6 — valeur valide acceptée (écriture owner : policies *_own couvrent la colonne)');
select is(
  (select origin_city from public.profiles
    where id = '00000000-0000-0000-0000-0000000000d1'),
  'Yaoundé', 'T7 — valeur persistée');

select is(public._oc_as('00000000-0000-0000-0000-0000000000d1',
  $$update public.profiles set origin_city = ''
     where id = '00000000-0000-0000-0000-0000000000d1'$$),
  '23514', 'T8 — chaîne vide rejetée par le CHECK');
select is(public._oc_as('00000000-0000-0000-0000-0000000000d1',
  $$update public.profiles set origin_city = '   '
     where id = '00000000-0000-0000-0000-0000000000d1'$$),
  '23514', 'T9 — espaces seuls rejetés par le CHECK');
select is(public._oc_as('00000000-0000-0000-0000-0000000000d1',
  format($$update public.profiles set origin_city = %L
     where id = '00000000-0000-0000-0000-0000000000d1'$$, repeat('a', 101))),
  '23514', 'T10 — plus de 100 caractères rejetés par le CHECK');

select is(public._oc_as('00000000-0000-0000-0000-0000000000d1',
  $$update public.profiles set origin_city = null
     where id = '00000000-0000-0000-0000-0000000000d1'$$),
  '', 'T11 — retour à NULL accepté (compatibilité historique)');
select is(
  (select origin_city from public.profiles
    where id = '00000000-0000-0000-0000-0000000000d1'),
  null, 'T12 — NULL persisté (jamais de chaîne vide imposée)');

-- ###########################################################################
-- SECTION 3 — INDÉPENDANCE ORIGINE / RÉSIDENCE (membre D1)
-- ###########################################################################

select is(public._oc_as('00000000-0000-0000-0000-0000000000d1',
  $$update public.profiles set origin_country = 'Sénégal', origin_city = 'Dakar'
     where id = '00000000-0000-0000-0000-0000000000d1'$$),
  '', 'T13 — changement du couple Origine accepté');
select is(
  (select country || '|' || city || '|' || region from public.profiles
    where id = '00000000-0000-0000-0000-0000000000d1'),
  'Cameroun|Douala|Littoral',
  'T14 — la Résidence (country, city, region) est INTACTE après changement d''origine');

select is(public._oc_as('00000000-0000-0000-0000-0000000000d1',
  $$update public.profiles set country = 'France', city = 'Paris'
     where id = '00000000-0000-0000-0000-0000000000d1'$$),
  '', 'T15 — changement du couple Résidence accepté');
select is(
  (select origin_country || '|' || origin_city from public.profiles
    where id = '00000000-0000-0000-0000-0000000000d1'),
  'Sénégal|Dakar',
  'T16 — l''Origine (origin_country, origin_city) est INTACTE après changement de résidence');

select is(public._oc_as('00000000-0000-0000-0000-0000000000d1',
  $$update public.profiles
      set origin_country = 'France', origin_city = 'Paris'
     where id = '00000000-0000-0000-0000-0000000000d1'$$),
  '', 'T17 — origine IDENTIQUE à la résidence acceptée (aucune règle d''égalité/différence)');

-- ###########################################################################
-- SECTION 4 — PRÉDICAT DE COMPLÉTUDE : les 4 champs géographiques (profil D2)
-- ###########################################################################

select ok(public._oc_meets('00000000-0000-0000-0000-0000000000d2'),
  'T18 — profil complet (4 champs géo + région renseignés) → prédicat vrai');

update public.profiles set origin_country = null
 where id = '00000000-0000-0000-0000-0000000000d2';
select ok(not public._oc_meets('00000000-0000-0000-0000-0000000000d2'),
  'T19 — sans origin_country → prédicat faux');
update public.profiles set origin_country = 'Sénégal'
 where id = '00000000-0000-0000-0000-0000000000d2';

update public.profiles set origin_city = null
 where id = '00000000-0000-0000-0000-0000000000d2';
select ok(not public._oc_meets('00000000-0000-0000-0000-0000000000d2'),
  'T20 — sans origin_city → prédicat faux');
update public.profiles set origin_city = 'Dakar'
 where id = '00000000-0000-0000-0000-0000000000d2';

update public.profiles set country = null
 where id = '00000000-0000-0000-0000-0000000000d2';
select ok(not public._oc_meets('00000000-0000-0000-0000-0000000000d2'),
  'T21 — sans country → prédicat faux');
update public.profiles set country = 'Cameroun'
 where id = '00000000-0000-0000-0000-0000000000d2';

update public.profiles set city = null
 where id = '00000000-0000-0000-0000-0000000000d2';
select ok(not public._oc_meets('00000000-0000-0000-0000-0000000000d2'),
  'T22 — sans city → prédicat faux');
update public.profiles set city = 'Douala'
 where id = '00000000-0000-0000-0000-0000000000d2';

update public.profiles set region = null
 where id = '00000000-0000-0000-0000-0000000000d2';
select ok(not public._oc_meets('00000000-0000-0000-0000-0000000000d2'),
  'T23 — non-régression : la région reste requise (complétude géo existante)');
update public.profiles set region = 'Littoral'
 where id = '00000000-0000-0000-0000-0000000000d2';

-- ###########################################################################
-- SECTION 5 — RPC : ONBOARDING_INCOMPLETE_LOCATION / succès (membre D2)
-- ###########################################################################

update public.profiles set origin_city = null
 where id = '00000000-0000-0000-0000-0000000000d2';
select isnt(public._oc_rpc('00000000-0000-0000-0000-0000000000d2'), '',
  'T24 — RPC : refus sans origin_city');
select is(current_setting('test.err', true), 'ONBOARDING_INCOMPLETE_LOCATION',
  'T25 — code stable ONBOARDING_INCOMPLETE_LOCATION (bloc géographique inchangé)');
select is(
  (select onboarding_completed_at from public.profiles
    where id = '00000000-0000-0000-0000-0000000000d2'),
  null, 'T26 — le refus n''a pas posé le marqueur');

update public.profiles set origin_city = 'Dakar', origin_country = null
 where id = '00000000-0000-0000-0000-0000000000d2';
select isnt(public._oc_rpc('00000000-0000-0000-0000-0000000000d2'), '',
  'T27 — RPC : refus sans origin_country');
select is(current_setting('test.err', true), 'ONBOARDING_INCOMPLETE_LOCATION',
  'T28 — même code stable pour tout le bloc géographique');
update public.profiles set origin_country = 'Sénégal'
 where id = '00000000-0000-0000-0000-0000000000d2';

select is(public._oc_rpc('00000000-0000-0000-0000-0000000000d2'), '',
  'T29 — RPC : succès lorsque les quatre champs géo + région sont renseignés');
select isnt(
  (select onboarding_completed_at from public.profiles
    where id = '00000000-0000-0000-0000-0000000000d2'),
  null, 'T30 — marqueur posé pour D2');

-- ###########################################################################
-- SECTION 6 — PROFIL HISTORIQUE (D3 : marqueur posé, origin_city NULL)
-- ###########################################################################

select ok(not public._oc_meets('00000000-0000-0000-0000-0000000000d3'),
  'T31 — historique : prédicat faux (signal « Profil incomplet » côté app)');
select is(public._oc_rpc('00000000-0000-0000-0000-0000000000d3'), '',
  'T32 — historique : RPC idempotente, jamais re-bloqué (premier horodatage rendu)');
select is(
  (select origin_city from public.profiles
    where id = '00000000-0000-0000-0000-0000000000d3'),
  null, 'T33 — origin_city reste NULL (rien d''écrit, jamais de "")');
select is(public._oc_as('00000000-0000-0000-0000-0000000000d3',
  $$update public.profiles set bio = 'Bio modifiée sans origine.'
     where id = '00000000-0000-0000-0000-0000000000d3'$$),
  '', 'T34 — historique : l''édition d''un autre champ (bio) n''exige pas l''origine');

-- ###########################################################################
-- SECTION 7 — RLS INTER-MEMBRES + POLICIES + PROJECTION DÉCOUVERTE
-- ###########################################################################

-- D1 tente d'écrire l'origine de D4 : la policy update_own filtre (0 ligne),
-- sans erreur — l'assertion utile est la valeur INTACTE.
select is(public._oc_as('00000000-0000-0000-0000-0000000000d1',
  $$update public.profiles set origin_city = 'Pirate'
     where id = '00000000-0000-0000-0000-0000000000d4'$$),
  '', 'T35 — tentative inter-membres : filtrée par la RLS sans erreur');
select is(
  (select origin_city from public.profiles
    where id = '00000000-0000-0000-0000-0000000000d4'),
  'Bafoussam', 'T36 — un membre ne peut PAS modifier l''origine d''un autre membre');

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
      and (roles::text[] && array['anon', 'public'])),
  0, 'T37 — aucune policy publique/anonyme sur profiles (policies *_own inchangées)');

select ok(
  pg_get_function_result(
    'public.discover_candidates(text,int,int)'::regprocedure) !~ 'origin',
  'T38 — la projection de découverte n''expose ni origin_country ni origin_city');

-- ###########################################################################
-- SECTION 8 — NON-RÉGRESSION PREMIUM (garde C1a) : ni les écritures
-- géographiques d'un membre, ni la RPC de finalisation ne touchent is_premium.
-- ###########################################################################

select is(
  (select is_premium from public.profiles
    where id = '00000000-0000-0000-0000-0000000000d1'),
  false,
  'T39 — les écritures Origine/Résidence du membre D1 n''ont pas modifié is_premium');
select is(
  (select is_premium from public.profiles
    where id = '00000000-0000-0000-0000-0000000000d2'),
  false,
  'T40 — la finalisation de l''onboarding (D2) n''a pas modifié is_premium');

-- ===========================================================================
select * from finish();
rollback;
