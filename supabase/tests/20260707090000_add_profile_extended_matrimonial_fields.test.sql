-- =============================================================================
-- Suite pgTAP — Champs matrimoniaux étendus du profil
-- Cibles : colonnes profession / education_level / height_cm / origin_country /
--          region / marriage_goals / desired_partner_traits / polygamy_preference
--          / children_intent, leurs contraintes CHECK, la fonction de validation
--          public.profiles_valid_choice_set(text[],text[],int,int), et la
--          compatibilité avec un profil historique (toutes nouvelles colonnes NULL).
--
-- Exécution : npx supabase test db  (nécessite le stack local Docker).
--             NON exécuté sur cette machine (Docker indisponible) — préparé.
--
-- Principe : TRANSACTION UNIQUE (begin … rollback). Les CHECK s'appliquent à TOUS
-- les rôles (y compris le superutilisateur) : on teste donc les contraintes en
-- exécutant les DML via une fonction d'aide `_ext_cap` qui capture le SQLSTATE /
-- message dans des GUC de session (`test.*`), puis les ASSERTIONS pgTAP relisent
-- ces GUC. 23514 = check_violation. La fonction d'aide disparaît au ROLLBACK.
--
-- UUID de travail :
--   L = …e0  (profil « legacy » : first_name seul, nouvelles colonnes NULL)
--   P = …e1  (profil cible des essais de validation)
-- =============================================================================

begin;

create extension if not exists pgtap with schema extensions;

set search_path = extensions, public, pg_catalog;

-- ---------------------------------------------------------------------------
-- Fonction d'aide : exécute un SQL et capture succès ('') ou exception.
-- ---------------------------------------------------------------------------
create function public._ext_cap(p_sql text)
returns void language plpgsql as $$
begin
  execute p_sql;
  perform set_config('test.state', '', true);
  perform set_config('test.err', '', true);
exception when others then
  perform set_config('test.state', sqlstate, true);
  perform set_config('test.err', sqlerrm, true);
end; $$;

-- ---------------------------------------------------------------------------
-- Fixtures : utilisateurs + profils minimaux (nouvelles colonnes toutes NULL).
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e0', 'legacy@ex.test'),
  ('00000000-0000-0000-0000-0000000000e1', 'target@ex.test');

insert into public.profiles (id, first_name) values
  ('00000000-0000-0000-0000-0000000000e0', 'Legacy Fatou'),
  ('00000000-0000-0000-0000-0000000000e1', 'Cible Awa');

-- ===========================================================================
select plan(62);
-- ===========================================================================


-- ###########################################################################
-- SECTION 1 — STRUCTURE (colonnes, types, fonction, contraintes)
-- ###########################################################################

-- T1..T9 : colonnes présentes
select has_column('profiles', 'profession',             'profiles.profession existe');
select has_column('profiles', 'education_level',        'profiles.education_level existe');
select has_column('profiles', 'height_cm',              'profiles.height_cm existe');
select has_column('profiles', 'origin_country',         'profiles.origin_country existe');
select has_column('profiles', 'region',                 'profiles.region existe');
select has_column('profiles', 'marriage_goals',         'profiles.marriage_goals existe');
select has_column('profiles', 'desired_partner_traits', 'profiles.desired_partner_traits existe');
select has_column('profiles', 'polygamy_preference',    'profiles.polygamy_preference existe');
select has_column('profiles', 'children_intent',        'profiles.children_intent existe');

-- T10..T12 : types clés
select col_type_is('profiles', 'height_cm', 'smallint', 'height_cm est smallint');
select col_type_is('profiles', 'marriage_goals', 'text[]', 'marriage_goals est text[]');
select col_type_is('profiles', 'desired_partner_traits', 'text[]', 'desired_partner_traits est text[]');

-- T13 : fonction de validation présente (signature (text[],text[],int,int))
select has_function('public', 'profiles_valid_choice_set',
  ARRAY['text[]','text[]','integer','integer'],
  'profiles_valid_choice_set(text[],text[],int,int) existe');

-- T14 : fonction IMMUTABLE (provolatile = 'i')
select is(
  (select provolatile from pg_proc
     where oid = 'public.profiles_valid_choice_set(text[],text[],integer,integer)'::regprocedure),
  'i'::"char", 'profiles_valid_choice_set est IMMUTABLE');

-- T15..T23 : contraintes présentes
select is((select count(*)::int from pg_constraint
   where conname='profiles_profession_chk' and conrelid='public.profiles'::regclass),
   1, 'contrainte profiles_profession_chk présente');
select is((select count(*)::int from pg_constraint
   where conname='profiles_education_level_chk' and conrelid='public.profiles'::regclass),
   1, 'contrainte profiles_education_level_chk présente');
select is((select count(*)::int from pg_constraint
   where conname='profiles_height_cm_chk' and conrelid='public.profiles'::regclass),
   1, 'contrainte profiles_height_cm_chk présente');
select is((select count(*)::int from pg_constraint
   where conname='profiles_origin_country_chk' and conrelid='public.profiles'::regclass),
   1, 'contrainte profiles_origin_country_chk présente');
select is((select count(*)::int from pg_constraint
   where conname='profiles_region_chk' and conrelid='public.profiles'::regclass),
   1, 'contrainte profiles_region_chk présente');
select is((select count(*)::int from pg_constraint
   where conname='profiles_marriage_goals_chk' and conrelid='public.profiles'::regclass),
   1, 'contrainte profiles_marriage_goals_chk présente');
select is((select count(*)::int from pg_constraint
   where conname='profiles_desired_partner_traits_chk' and conrelid='public.profiles'::regclass),
   1, 'contrainte profiles_desired_partner_traits_chk présente');
select is((select count(*)::int from pg_constraint
   where conname='profiles_polygamy_preference_chk' and conrelid='public.profiles'::regclass),
   1, 'contrainte profiles_polygamy_preference_chk présente');
select is((select count(*)::int from pg_constraint
   where conname='profiles_children_intent_chk' and conrelid='public.profiles'::regclass),
   1, 'contrainte profiles_children_intent_chk présente');


-- ###########################################################################
-- SECTION 2 — FONCTION profiles_valid_choice_set (tests directs)
-- ###########################################################################

-- T24 : sous-ensemble valide (2 éléments distincts, dans le domaine) → true
select is(
  public.profiles_valid_choice_set(array['a','b']::text[], array['a','b','c']::text[], 2, 3),
  true, 'choice_set : 2 valeurs valides distinctes → true');

-- T25 : doublon → false
select is(
  public.profiles_valid_choice_set(array['a','a']::text[], array['a','b','c']::text[], 2, 3),
  false, 'choice_set : doublon → false');

-- T26 : trop peu (1 < min 2) → false
select is(
  public.profiles_valid_choice_set(array['a']::text[], array['a','b','c']::text[], 2, 3),
  false, 'choice_set : sous le minimum → false');

-- T27 : trop nombreux (4 > max 3) → false
select is(
  public.profiles_valid_choice_set(array['a','b','c','d']::text[], array['a','b','c','d']::text[], 2, 3),
  false, 'choice_set : au-dessus du maximum → false');

-- T28 : NULL → false (jamais NULL renvoyé)
select is(
  public.profiles_valid_choice_set(null, array['a','b']::text[], 2, 3),
  false, 'choice_set : NULL → false');

-- T29 : valeur hors domaine → false
select is(
  public.profiles_valid_choice_set(array['a','z']::text[], array['a','b','c']::text[], 2, 3),
  false, 'choice_set : valeur hors domaine → false');

-- T30 : élément NULL dans la liste → false
select is(
  public.profiles_valid_choice_set(array['a', null]::text[], array['a','b','c']::text[], 2, 3),
  false, 'choice_set : élément NULL → false');


-- ###########################################################################
-- SECTION 3 — COMPATIBILITÉ PROFIL HISTORIQUE (L)
-- ###########################################################################

-- T31 : le profil legacy existe (INSERT minimal accepté avec toutes nouvelles cols NULL)
select is((select count(*)::int from public.profiles where id='00000000-0000-0000-0000-0000000000e0'),
  1, 'legacy : profil minimal créé (nouvelles colonnes NULL)');

-- T32 : toutes les nouvelles colonnes sont NULL et le profil satisfait les CHECK
select is((select (
      profession is null and education_level is null and height_cm is null
  and origin_country is null and region is null and marriage_goals is null
  and desired_partner_traits is null and polygamy_preference is null
  and children_intent is null)
   from public.profiles where id='00000000-0000-0000-0000-0000000000e0'),
  true, 'legacy : nouvelles colonnes toutes NULL (compatibilité)');


-- ###########################################################################
-- SECTION 4 — CONTRAINTES CHECK (via P) : valeurs valides et invalides
-- ###########################################################################

-- --- profession ---
-- T33 : valide
select public._ext_cap('update public.profiles set profession=''Sage-femme'' where id=''00000000-0000-0000-0000-0000000000e1''');
select is(current_setting('test.state', true), '', 'profession valide acceptée');
-- T34 : trop courte (1 caractère)
select public._ext_cap('update public.profiles set profession=''a'' where id=''00000000-0000-0000-0000-0000000000e1''');
select is(current_setting('test.state', true), '23514', 'profession < 2 caractères refusée');
-- T35 : trop longue (101 caractères)
select public._ext_cap('update public.profiles set profession=repeat(''x'',101) where id=''00000000-0000-0000-0000-0000000000e1''');
select is(current_setting('test.state', true), '23514', 'profession > 100 caractères refusée');
-- T36 : espaces seuls (btrim vide)
select public._ext_cap('update public.profiles set profession=''   '' where id=''00000000-0000-0000-0000-0000000000e1''');
select is(current_setting('test.state', true), '23514', 'profession espaces seuls refusée');

-- --- education_level ---
-- T37 : valide
select public._ext_cap('update public.profiles set education_level=''master'' where id=''00000000-0000-0000-0000-0000000000e1''');
select is(current_setting('test.state', true), '', 'education_level valide accepté');
-- T38 : invalide
select public._ext_cap('update public.profiles set education_level=''phd'' where id=''00000000-0000-0000-0000-0000000000e1''');
select is(current_setting('test.state', true), '23514', 'education_level hors domaine refusé');

-- --- height_cm ---
-- T39 : valide
select public._ext_cap('update public.profiles set height_cm=180 where id=''00000000-0000-0000-0000-0000000000e1''');
select is(current_setting('test.state', true), '', 'height_cm valide accepté');
-- T40 : sous la borne (119)
select public._ext_cap('update public.profiles set height_cm=119 where id=''00000000-0000-0000-0000-0000000000e1''');
select is(current_setting('test.state', true), '23514', 'height_cm < 120 refusé');
-- T41 : au-dessus de la borne (231)
select public._ext_cap('update public.profiles set height_cm=231 where id=''00000000-0000-0000-0000-0000000000e1''');
select is(current_setting('test.state', true), '23514', 'height_cm > 230 refusé');

-- --- origin_country ---
-- T42 : valide
select public._ext_cap('update public.profiles set origin_country=''Sénégal'' where id=''00000000-0000-0000-0000-0000000000e1''');
select is(current_setting('test.state', true), '', 'origin_country valide accepté');
-- T43 : vide
select public._ext_cap('update public.profiles set origin_country='''' where id=''00000000-0000-0000-0000-0000000000e1''');
select is(current_setting('test.state', true), '23514', 'origin_country vide refusé');
-- T44 : trop long (101 caractères)
select public._ext_cap('update public.profiles set origin_country=repeat(''y'',101) where id=''00000000-0000-0000-0000-0000000000e1''');
select is(current_setting('test.state', true), '23514', 'origin_country > 100 caractères refusé');

-- --- region ---
-- T45 : valide
select public._ext_cap('update public.profiles set region=''Dakar'' where id=''00000000-0000-0000-0000-0000000000e1''');
select is(current_setting('test.state', true), '', 'region valide acceptée');
-- T46 : trop longue (121 caractères)
select public._ext_cap('update public.profiles set region=repeat(''z'',121) where id=''00000000-0000-0000-0000-0000000000e1''');
select is(current_setting('test.state', true), '23514', 'region > 120 caractères refusée');

-- --- marriage_goals (tableau 2..3, unique, domaine) ---
-- T47 : valide 2 éléments
select public._ext_cap('update public.profiles set marriage_goals=array[''build_family'',''stable_home''] where id=''00000000-0000-0000-0000-0000000000e1''');
select is(current_setting('test.state', true), '', 'marriage_goals 2 valeurs valides acceptées');
-- T48 : valide 3 éléments
select public._ext_cap('update public.profiles set marriage_goals=array[''build_family'',''stable_home'',''serenity''] where id=''00000000-0000-0000-0000-0000000000e1''');
select is(current_setting('test.state', true), '', 'marriage_goals 3 valeurs valides acceptées');
-- T49 : trop peu (1)
select public._ext_cap('update public.profiles set marriage_goals=array[''build_family''] where id=''00000000-0000-0000-0000-0000000000e1''');
select is(current_setting('test.state', true), '23514', 'marriage_goals 1 valeur refusée');
-- T50 : trop nombreux (4)
select public._ext_cap('update public.profiles set marriage_goals=array[''build_family'',''stable_home'',''serenity'',''life_partner''] where id=''00000000-0000-0000-0000-0000000000e1''');
select is(current_setting('test.state', true), '23514', 'marriage_goals 4 valeurs refusées');
-- T51 : doublon
select public._ext_cap('update public.profiles set marriage_goals=array[''build_family'',''build_family''] where id=''00000000-0000-0000-0000-0000000000e1''');
select is(current_setting('test.state', true), '23514', 'marriage_goals doublon refusé');
-- T52 : valeur hors domaine
select public._ext_cap('update public.profiles set marriage_goals=array[''build_family'',''unknown_goal''] where id=''00000000-0000-0000-0000-0000000000e1''');
select is(current_setting('test.state', true), '23514', 'marriage_goals hors domaine refusé');
-- T53 : élément NULL
select public._ext_cap('update public.profiles set marriage_goals=array[''build_family'', null]::text[] where id=''00000000-0000-0000-0000-0000000000e1''');
select is(current_setting('test.state', true), '23514', 'marriage_goals élément NULL refusé');

-- --- desired_partner_traits (tableau 2..3, unique, domaine) ---
-- T54 : valide
select public._ext_cap('update public.profiles set desired_partner_traits=array[''kindness'',''sincerity''] where id=''00000000-0000-0000-0000-0000000000e1''');
select is(current_setting('test.state', true), '', 'desired_partner_traits 2 valeurs valides acceptées');
-- T55 : hors domaine
select public._ext_cap('update public.profiles set desired_partner_traits=array[''kindness'',''rich''] where id=''00000000-0000-0000-0000-0000000000e1''');
select is(current_setting('test.state', true), '23514', 'desired_partner_traits hors domaine refusé');
-- T56 : doublon
select public._ext_cap('update public.profiles set desired_partner_traits=array[''kindness'',''kindness''] where id=''00000000-0000-0000-0000-0000000000e1''');
select is(current_setting('test.state', true), '23514', 'desired_partner_traits doublon refusé');

-- --- polygamy_preference ---
-- T57 : valide
select public._ext_cap('update public.profiles set polygamy_preference=''discuss'' where id=''00000000-0000-0000-0000-0000000000e1''');
select is(current_setting('test.state', true), '', 'polygamy_preference valide acceptée');
-- T58 : invalide
select public._ext_cap('update public.profiles set polygamy_preference=''maybe'' where id=''00000000-0000-0000-0000-0000000000e1''');
select is(current_setting('test.state', true), '23514', 'polygamy_preference hors domaine refusée');

-- --- children_intent ---
-- T59 : valide
select public._ext_cap('update public.profiles set children_intent=''has_children'' where id=''00000000-0000-0000-0000-0000000000e1''');
select is(current_setting('test.state', true), '', 'children_intent valide accepté');
-- T60 : invalide
select public._ext_cap('update public.profiles set children_intent=''someday'' where id=''00000000-0000-0000-0000-0000000000e1''');
select is(current_setting('test.state', true), '23514', 'children_intent hors domaine refusé');


-- ###########################################################################
-- SECTION 5 — REMPLISSAGE COMPLET VALIDE (compatibilité d'écriture)
-- ###########################################################################

-- T61 : remplir toutes les nouvelles colonnes ensemble avec des valeurs valides
select public._ext_cap($sql$
  update public.profiles set
    profession = 'Enseignante',
    education_level = 'bachelor',
    height_cm = 168,
    origin_country = 'Mali',
    region = 'Bamako',
    marriage_goals = array['build_family','mutual_support'],
    desired_partner_traits = array['kindness','family_oriented','calm_mature'],
    polygamy_preference = 'no',
    children_intent = 'wants_children'
  where id = '00000000-0000-0000-0000-0000000000e0'
$sql$);
select is(current_setting('test.state', true), '', 'remplissage complet valide accepté (legacy → complet)');

-- T62 : les valeurs sont bien persistées
select is((select profession||'/'||education_level||'/'||height_cm::text||'/'
                  ||array_to_string(marriage_goals, ',')||'/'||polygamy_preference
             from public.profiles where id='00000000-0000-0000-0000-0000000000e0'),
  'Enseignante/bachelor/168/build_family,mutual_support/no',
  'remplissage complet : valeurs persistées');


-- ===========================================================================
select * from finish();
rollback;
