-- =============================================================================
-- Suite pgTAP — Religion déclarée du membre (profiles.religion, PR B).
-- Cibles : colonne + CHECK profiles_religion_chk, écriture RLS owner-only,
--          prédicat public.profile_meets_onboarding_requirements (religion
--          requise), RPC public.complete_member_onboarding
--          (ONBOARDING_INCOMPLETE_RELIGION), compatibilité des profils
--          historiques (marqueur posé + religion NULL), absence de déduction
--          depuis discovery_universe.
--
-- Exécution : npx supabase test db — nécessite un stack Supabase local avec
--             Docker (VPS Hostinger pour ce dépôt).
--
-- Principe : TRANSACTION UNIQUE (begin … rollback). Les opérations sensibles
-- sont exécutées SOUS le rôle applicatif `authenticated` (JWT local
-- `sub`+`role` → vrai auth.uid()) ; le résultat/exception est capturé dans des
-- GUC `test.*` ; les assertions pgTAP sont jouées en `postgres`.
--
-- UUID de travail :
--   C1 = 00000000-0000-0000-0000-0000000000c1  (CHECK + écriture owner)
--   C2 = 00000000-0000-0000-0000-0000000000c2  (RPC : refus puis succès)
--   C3 = 00000000-0000-0000-0000-0000000000c3  (historique : marqueur posé,
--                                               religion NULL)
-- =============================================================================

begin;

create extension if not exists pgtap with schema extensions;

set search_path = extensions, public, pg_catalog;

-- ---------------------------------------------------------------------------
-- Fonctions d'aide (SECURITY INVOKER — exécutent réellement sous le rôle
-- courant). Détruites au ROLLBACK.
-- ---------------------------------------------------------------------------

-- Appelle la RPC et capture le retour (timestamptz) OU l'exception.
create function public._rel_cap_rpc()
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
create function public._rel_cap(p_sql text)
returns void language plpgsql as $$
begin
  execute p_sql;
  perform set_config('test.state', '', true);
  perform set_config('test.err', '', true);
exception when others then
  perform set_config('test.state', sqlstate, true);
  perform set_config('test.err', sqlerrm, true);
end; $$;

-- Écrit la religion de C1 SOUS authenticated (RLS owner) et capture l'issue.
create function public._rel_write_own(p_value text)
returns text language plpgsql as $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub','00000000-0000-0000-0000-0000000000c1','role','authenticated')::text, true);
  perform public._rel_cap(format(
    $sql$update public.profiles set religion = %L
       where id = '00000000-0000-0000-0000-0000000000c1'$sql$, p_value));
  reset role;
  return current_setting('test.state', true);
end; $$;

-- ---------------------------------------------------------------------------
-- Fixtures (en `postgres`). « Profil complet » = toutes les exigences du
-- parcours SAUF la religion (l'objet de cette suite). L'acquisition est posée
-- directement (autorisé : postgres est le propriétaire des RPC dans le stack
-- local).
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'rel-c1@ex.test'),
  ('00000000-0000-0000-0000-0000000000c2', 'rel-c2@ex.test'),
  ('00000000-0000-0000-0000-0000000000c3', 'rel-c3@ex.test');

create function public._rel_seed_complete_sans_religion(p_id uuid)
returns void language plpgsql as $$
begin
  insert into public.profiles (
    id, first_name, gender, birth_date, marital_status,
    profession, education_level, height_cm,
    country, city, origin_country, region,
    marriage_goals, desired_partner_traits, polygamy_preference, children_intent,
    bio, partner_expectations,
    acquisition_source, acquisition_source_recorded_at
  ) values (
    p_id, 'Testeur', 'homme', date '1990-01-01', 'celibataire',
    'Ingénieur', 'master', 180,
    'Cameroun', 'Douala', 'Cameroun', 'Littoral',
    array['build_family','stable_home'], array['kindness','sincerity'], 'no', 'wants_children',
    'Présentation de test.', 'Attentes de test.',
    'google', pg_catalog.now()
  );
  insert into public.photos (profile_id, storage_path, is_primary)
  values (p_id, p_id::text || '/photo-principale.webp', true);
end; $$;

select public._rel_seed_complete_sans_religion('00000000-0000-0000-0000-0000000000c1');
select public._rel_seed_complete_sans_religion('00000000-0000-0000-0000-0000000000c2');

-- C3 = profil HISTORIQUE : finalisé (marqueur posé directement — postgres est
-- le propriétaire de la RPC, la garde l'autorise) et religion NULL.
select public._rel_seed_complete_sans_religion('00000000-0000-0000-0000-0000000000c3');
update public.profiles set onboarding_completed_at = pg_catalog.now()
 where id = '00000000-0000-0000-0000-0000000000c3';

-- ===========================================================================
select plan(22);
-- ===========================================================================

-- ###########################################################################
-- SECTION 1 — STRUCTURE
-- ###########################################################################

select has_column('public', 'profiles', 'religion',
  'T1 — colonne religion présente');
select col_type_is('public', 'profiles', 'religion', 'text',
  'T2 — type text');
select col_is_null('public', 'profiles', 'religion',
  'T3 — colonne nullable (compatibilité des profils historiques)');
select col_hasnt_default('public', 'profiles', 'religion',
  'T4 — aucune valeur par défaut');

-- ###########################################################################
-- SECTION 2 — CHECK + ÉCRITURE OWNER (sous authenticated, membre C1)
--   Chaque valeur autorisée est ACCEPTÉE via la propre ligne du membre
--   (preuve que les policies *_own couvrent la colonne) ; '' et hors-liste
--   sont REJETÉES par le CHECK (23514).
-- ###########################################################################

select is(public._rel_write_own('christianisme'), '',
  'T5 — valeur christianisme acceptée (écriture owner)');
select is(public._rel_write_own('islam'), '',
  'T6 — valeur islam acceptée');
select is(public._rel_write_own('autre'), '',
  'T7 — valeur autre acceptée');
select is(public._rel_write_own('sans_religion'), '',
  'T8 — valeur sans_religion acceptée');

select is(public._rel_write_own(''), '23514',
  'T9 — chaîne vide rejetée par le CHECK');
select is(public._rel_write_own('   '), '23514',
  'T10 — chaîne d''espaces rejetée par le CHECK');
select is(public._rel_write_own('bouddhisme'), '23514',
  'T11 — valeur hors liste rejetée par le CHECK');
select is(public._rel_write_own('Christianisme'), '23514',
  'T12 — casse différente rejetée (valeurs internes strictes)');

-- Le retour à NULL reste possible (en postgres : cas de maintenance ; le
-- front n'envoie jamais NULL après coup, mais le CHECK ne l'interdit pas).
update public.profiles set religion = null
 where id = '00000000-0000-0000-0000-0000000000c1';
select is(
  (select religion from public.profiles
    where id = '00000000-0000-0000-0000-0000000000c1'),
  null, 'T13 — NULL reste autorisé (rétrocompatibilité)');

-- ###########################################################################
-- SECTION 3 — PRÉDICAT + RPC : religion requise pour FINALISER (membre C2)
-- ###########################################################################

select ok(
  not public.profile_meets_onboarding_requirements(
    (select p from public.profiles p
      where id = '00000000-0000-0000-0000-0000000000c2')),
  'T14 — prédicat : profil complet SANS religion → non finalisable');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-0000000000c2','role','authenticated')::text, true);
select public._rel_cap_rpc();
reset role;
select is(current_setting('test.err', true), 'ONBOARDING_INCOMPLETE_RELIGION',
  'T15 — RPC : refus ONBOARDING_INCOMPLETE_RELIGION sans religion');
select is(
  (select onboarding_completed_at from public.profiles
    where id = '00000000-0000-0000-0000-0000000000c2'),
  null, 'T16 — le refus n''a pas posé le marqueur');

update public.profiles set religion = 'islam'
 where id = '00000000-0000-0000-0000-0000000000c2';

select ok(
  public.profile_meets_onboarding_requirements(
    (select p from public.profiles p
      where id = '00000000-0000-0000-0000-0000000000c2')),
  'T17 — prédicat : religion renseignée → finalisable');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-0000000000c2','role','authenticated')::text, true);
select public._rel_cap_rpc();
reset role;
select is(current_setting('test.state', true), '',
  'T18 — RPC : succès avec religion renseignée');
select isnt(
  (select onboarding_completed_at from public.profiles
    where id = '00000000-0000-0000-0000-0000000000c2'),
  null, 'T19 — marqueur posé pour C2');

-- ###########################################################################
-- SECTION 4 — COMPATIBILITÉ DES PROFILS HISTORIQUES (membre C3 : marqueur
--             posé, religion NULL) — stratégie douce, jamais re-bloqué.
-- ###########################################################################

-- T20 — la RPC idempotente renvoie le premier horodatage SANS revalider :
-- un membre historique sans religion n'est jamais re-bloqué.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-0000000000c3','role','authenticated')::text, true);
select public._rel_cap_rpc();
reset role;
select is(current_setting('test.state', true), '',
  'T20 — historique (religion NULL) : RPC idempotente, aucun re-blocage');

-- T21 — les éditions ordinaires du profil restent libres, religion intacte.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-0000000000c3','role','authenticated')::text, true);
select public._rel_cap(
  $$update public.profiles set city = 'Yaoundé'
     where id = '00000000-0000-0000-0000-0000000000c3'$$);
reset role;
select is(current_setting('test.state', true), '',
  'T21 — historique : édition ordinaire (ville) jamais entravée');

-- T22 — AUCUNE déduction : poser un univers de découverte ne renseigne
-- jamais la religion.
update public.profiles set discovery_universe = 'christian_marriage'
 where id = '00000000-0000-0000-0000-0000000000c3';
select is(
  (select religion from public.profiles
    where id = '00000000-0000-0000-0000-0000000000c3'),
  null, 'T22 — discovery_universe posé : religion reste NULL (jamais déduite)');

-- ===========================================================================
select * from finish();
rollback;
