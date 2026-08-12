-- =============================================================================
-- Suite pgTAP — Lot B, gating premium des signaux entrants
-- (migration 20260812002000_gate_premium_incoming_signals).
--
-- Ce que la suite protège, dans l'ordre d'importance :
--   1. AUCUN signal entrant (qui me visite, qui m'ajoute en favori) ne sort
--      sans abonnement premium ACTIF — un abonnement expiré ne débloque rien ;
--   2. la liste SORTANTE des favoris reste GRATUITE : on ne reprend pas au
--      membre le contenu qu'il a lui-même créé ;
--   3. les compteurs restent libres — c'est ce qui permet d'afficher un état
--      verrouillé honnête au lieu d'un faux « aucun visiteur » ;
--   4. la discrétion prime sur le premium : un membre discret est invisible
--      des listes ET des compteurs, y compris pour un premium ;
--   5. le garde s'appuie sur profile_has_active_premium, jamais sur la
--      colonne dénormalisée profiles.is_premium ;
--   6. les grants restent minimaux (rien pour anon, helper interne clos).
--
-- Exécution : npx supabase test db — stack Supabase local avec Docker.
--
-- UUID de travail :
--   B1 = …0b1  homme, PREMIUM actif      — l'observateur de référence
--   B4 = …0b4  homme, SANS premium       — le témoin gratuit
--   B7 = …0b7  homme, premium EXPIRÉ     — le piège
--   B2 = …0b2  femme, visiteuse normale
--   B3 = …0b3  femme, visiteuse DISCRÈTE (discreet_visits)
--   B5 = …0b5  femme, met en favori, pseudo « Perle »
--   B6 = …0b6  femme, met en favori en mode DISCRET (discreet_favorites)
-- =============================================================================

begin;

create extension if not exists pgtap with schema extensions;

set search_path = extensions, public, pg_catalog;

select plan(19);

-- Helpers ---------------------------------------------------------------------

/** Exécute sous l'identité d'un membre et renvoie la 1re colonne en texte. */
create function public._gp_as(p_uid uuid, p_sql text)
returns text language plpgsql as $$
declare v_out text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
  execute p_sql into v_out;
  return coalesce(v_out, 'ok');
exception when others then
  return 'ERR:' || sqlerrm;
end;
$$;

/** Profil complet, approuvé et actif. */
create function public._gp_profile(p_id uuid, p_prenom text, p_genre public.gender,
                                   p_tel text)
returns void language plpgsql as $$
begin
  insert into auth.users (id, email) values (p_id, p_prenom || '@gp.test');
  insert into public.profiles (
    id, first_name, gender, birth_date, marital_status,
    country, city, discovery_universe, bio, partner_expectations,
    verification_status, account_status, whatsapp_phone,
    onboarding_completed_at
  ) values (
    p_id, p_prenom, p_genre, date '1993-05-14', 'celibataire',
    'Cameroun', 'Yaounde', 'open_marriage',
    'Presentation de test.', 'Attentes de test.',
    'approved', 'active'::public.account_status, p_tel,
    pg_catalog.now()
  );
end;
$$;

/** Abonnement premium borné dans le temps. */
create function public._gp_premium(p_id uuid, p_debut interval, p_fin interval)
returns void language plpgsql as $$
begin
  insert into public.premium_subscriptions
    (profile_id, profile_id_snapshot, plan_id, status, source, starts_at, ends_at)
  select p_id, p_id, p.id,
         'active'::public.premium_subscription_status,
         'admin'::public.premium_subscription_source,
         pg_catalog.now() + p_debut,
         pg_catalog.now() + p_fin
  from public.premium_plans p limit 1;
end;
$$;

-- Fixtures ---------------------------------------------------------------------

select public._gp_profile('00000000-0000-0000-0000-0000000000b1'::uuid,
  'Bakari', 'homme', '237610000001');
select public._gp_profile('00000000-0000-0000-0000-0000000000b2'::uuid,
  'Bintou', 'femme', '237610000002');
select public._gp_profile('00000000-0000-0000-0000-0000000000b3'::uuid,
  'Bella', 'femme', '237610000003');
select public._gp_profile('00000000-0000-0000-0000-0000000000b4'::uuid,
  'Boris', 'homme', '237610000004');
select public._gp_profile('00000000-0000-0000-0000-0000000000b5'::uuid,
  'Sandra', 'femme', '237610000005');
select public._gp_profile('00000000-0000-0000-0000-0000000000b6'::uuid,
  'Barbara', 'femme', '237610000006');
select public._gp_profile('00000000-0000-0000-0000-0000000000b7'::uuid,
  'Bruno', 'homme', '237610000007');

-- Réglages de discrétion et pseudo.
update public.profiles set discreet_visits = true
  where id = '00000000-0000-0000-0000-0000000000b3';
update public.profiles set discreet_favorites = true
  where id = '00000000-0000-0000-0000-0000000000b6';
update public.profiles set pseudo = 'Perle'
  where id = '00000000-0000-0000-0000-0000000000b5';

-- B1 est premium ; B7 l'a été (abonnement terminé hier) ; B4 ne l'a jamais été.
select public._gp_premium('00000000-0000-0000-0000-0000000000b1'::uuid,
  interval '-1 day', interval '30 days');
select public._gp_premium('00000000-0000-0000-0000-0000000000b7'::uuid,
  interval '-40 days', interval '-1 day');

-- Visites : B2 (normale) et B3 (discrète) ont consulté B1, B4 et B7.
insert into public.profile_visits (visitor_id, visited_profile_id)
values
  ('00000000-0000-0000-0000-0000000000b2',
   '00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000000b3',
   '00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000000b2',
   '00000000-0000-0000-0000-0000000000b4'),
  ('00000000-0000-0000-0000-0000000000b3',
   '00000000-0000-0000-0000-0000000000b4'),
  ('00000000-0000-0000-0000-0000000000b2',
   '00000000-0000-0000-0000-0000000000b7');

-- Favoris entrants : B5 (normale) et B6 (discrète) ont ajouté B1 et B4.
-- Favori SORTANT : B4 a lui-même enregistré B2.
insert into public.member_favorites (user_id, target_profile_id)
values
  ('00000000-0000-0000-0000-0000000000b5',
   '00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000000b6',
   '00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000000b5',
   '00000000-0000-0000-0000-0000000000b4'),
  ('00000000-0000-0000-0000-0000000000b6',
   '00000000-0000-0000-0000-0000000000b4'),
  ('00000000-0000-0000-0000-0000000000b4',
   '00000000-0000-0000-0000-0000000000b2');

-- 1..3 — Structure ---------------------------------------------------------------

select has_column('public', 'profiles', 'discreet_favorites',
  'la colonne discreet_favorites existe');

select col_default_is('public', 'profiles', 'discreet_favorites', 'false',
  'discreet_favorites vaut false par défaut : aucun changement de comportement');

select has_index('public', 'member_favorites', 'member_favorites_target_created_idx',
  'le sens ENTRANT des favoris est indexé');

-- 4..6 — Grants ------------------------------------------------------------------

select ok(
  not has_function_privilege('authenticated',
    'public.profile_has_active_premium(uuid)', 'execute'),
  'le helper premium reste strictement interne');

select ok(
  has_function_privilege('authenticated', 'public.list_favorited_by()', 'execute')
  and has_function_privilege('authenticated', 'public.count_favorited_by()', 'execute')
  and has_function_privilege('authenticated', 'public.count_profile_visitors()', 'execute'),
  'authenticated peut exécuter les nouvelles RPC');

select ok(
  not has_function_privilege('anon', 'public.list_favorited_by()', 'execute')
  and not has_function_privilege('anon', 'public.count_favorited_by()', 'execute')
  and not has_function_privilege('anon', 'public.count_profile_visitors()', 'execute'),
  'anon n''a AUCUN accès aux nouvelles RPC');

-- 7..10 — Visiteurs : la liste est premium, le compteur est libre -----------------

select is(
  public._gp_as('00000000-0000-0000-0000-0000000000b4',
    $$select count(*)::text from public.list_profile_visitors()$$),
  '0',
  'sans premium, la liste des visiteurs est vide');

select is(
  public._gp_as('00000000-0000-0000-0000-0000000000b4',
    $$select public.count_profile_visitors()::text$$),
  '1',
  'sans premium, le compteur de visiteurs reste LIBRE et honnête');

select is(
  public._gp_as('00000000-0000-0000-0000-0000000000b1',
    $$select count(*)::text from public.list_profile_visitors()$$),
  '1',
  'avec premium, la liste des visiteurs s''ouvre');

select is(
  public._gp_as('00000000-0000-0000-0000-0000000000b7',
    $$select count(*)::text from public.list_profile_visitors()$$),
  '0',
  'un abonnement EXPIRÉ ne débloque rien');

-- 11..12 — La discrétion prime sur le premium ------------------------------------

select is(
  public._gp_as('00000000-0000-0000-0000-0000000000b1',
    $$select string_agg(first_name, ',' order by first_name)
      from public.list_profile_visitors()$$),
  'Bintou',
  'la visiteuse discrète reste invisible, même pour un premium');

select is(
  public._gp_as('00000000-0000-0000-0000-0000000000b1',
    $$select public.count_profile_visitors()::text$$),
  '1',
  'le compteur exclut lui aussi la visiteuse discrète (aucune déduction possible)');

-- 13..16 — Favoris entrants ------------------------------------------------------

select is(
  public._gp_as('00000000-0000-0000-0000-0000000000b4',
    $$select count(*)::text from public.list_favorited_by()$$),
  '0',
  'sans premium, « qui m''a ajouté » est fermé');

select is(
  public._gp_as('00000000-0000-0000-0000-0000000000b4',
    $$select public.count_favorited_by()::text$$),
  '1',
  'sans premium, le compteur des favoris entrants reste LIBRE');

select is(
  public._gp_as('00000000-0000-0000-0000-0000000000b1',
    $$select string_agg(first_name, ',' order by first_name)
      from public.list_favorited_by()$$),
  'Perle',
  'avec premium : l''admiratrice discrète est exclue ET la règle pseudo s''applique');

select is(
  public._gp_as('00000000-0000-0000-0000-0000000000b1',
    $$select public.count_favorited_by()::text$$),
  '1',
  'le compteur des favoris entrants exclut aussi le mode discret');

-- 17 — NON-RÉGRESSION : la liste SORTANTE reste gratuite --------------------------

select is(
  public._gp_as('00000000-0000-0000-0000-0000000000b4',
    $$select count(*)::text from public.list_favorites()$$),
  '1',
  'list_favorites reste GRATUITE : le membre garde sa propre liste');

-- 18 — Le garde ne s'appuie PAS sur la colonne dénormalisée -----------------------
-- (assertion sur la définition : profiles.is_premium ne peut pas être forcé en
-- test, guard_profiles_admin_fields le verrouille depuis 20260715120000.)

select ok(
  pg_catalog.pg_get_functiondef('public.list_profile_visitors()'::regprocedure)
    like '%profile_has_active_premium%'
  and pg_catalog.pg_get_functiondef('public.list_profile_visitors()'::regprocedure)
    not like '%is_premium%'
  and pg_catalog.pg_get_functiondef('public.list_favorited_by()'::regprocedure)
    like '%profile_has_active_premium%'
  and pg_catalog.pg_get_functiondef('public.list_favorited_by()'::regprocedure)
    not like '%is_premium%',
  'le garde s''appuie sur profile_has_active_premium, jamais sur profiles.is_premium');

-- 19 — Un abonnement révoqué aux dates encore valides ne débloque rien -------------

-- On quitte l'identité membre laissée par le dernier _gp_as : la synchro de
-- profiles.is_premium déclenchée par l'abonnement est une écriture
-- administrative, refusée sous session membre (20260715120000).
select set_config('request.jwt.claims', '', true);

select public._gp_premium('00000000-0000-0000-0000-0000000000b4'::uuid,
  interval '-1 day', interval '30 days');

update public.premium_subscriptions
   set status = 'revoked'::public.premium_subscription_status,
       revoked_at = pg_catalog.now(),
       revocation_reason = 'Revocation de controle pour la suite pgTAP du Lot B.'
 where profile_id_snapshot = '00000000-0000-0000-0000-0000000000b4';

select is(
  public._gp_as('00000000-0000-0000-0000-0000000000b4',
    $$select count(*)::text from public.list_profile_visitors()$$),
  '0',
  'un abonnement RÉVOQUÉ aux dates valides ne débloque rien');

select * from finish();

rollback;
