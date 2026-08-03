-- =============================================================================
-- Suite pgTAP — Pseudo affiché (profiles.pseudo, §5.4).
-- Cibles : colonne + CHECK profiles_pseudo_len, écriture RLS owner-only,
--          remplacement du prénom par le pseudo dans discover_candidates et
--          list_my_relationships (comportemental, sous JWT authenticated),
--          présence du repli pseudo dans les deux projections vitrine
--          (structurel : pg_get_functiondef), repli sur le prénom quand le
--          pseudo est NULL (profils historiques jamais dégradés).
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
--   D1 = 00000000-0000-0000-0000-0000000000d1  (viewer femme, approuvée)
--   D2 = 00000000-0000-0000-0000-0000000000d2  (candidat homme, approuvé)
-- =============================================================================

begin;

create extension if not exists pgtap with schema extensions;

set search_path = extensions, public, pg_catalog;

-- ---------------------------------------------------------------------------
-- Fonctions d'aide. Détruites au ROLLBACK.
-- ---------------------------------------------------------------------------

-- Exécute un SQL arbitraire ; capture succès ('') ou exception (sqlstate).
create function public._pse_cap(p_sql text)
returns void language plpgsql as $$
begin
  execute p_sql;
  perform set_config('test.state', '', true);
  perform set_config('test.err', '', true);
exception when others then
  perform set_config('test.state', sqlstate, true);
  perform set_config('test.err', sqlerrm, true);
end; $$;

-- Écrit le pseudo de D2 SOUS authenticated (RLS owner) et capture l'issue.
create function public._pse_write_own(p_value text)
returns text language plpgsql as $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub','00000000-0000-0000-0000-0000000000d2','role','authenticated')::text, true);
  perform public._pse_cap(format(
    $sql$update public.profiles set pseudo = %L
       where id = '00000000-0000-0000-0000-0000000000d2'$sql$, p_value));
  reset role;
  return current_setting('test.state', true);
end; $$;

-- Nom affiché de D2 dans la découverte, VUE PAR D1 (authenticated).
create function public._pse_discover_name()
returns text language plpgsql as $$
declare v text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub','00000000-0000-0000-0000-0000000000d1','role','authenticated')::text, true);
  select d.first_name into v
  from public.discover_candidates('open_marriage', 20, 0) d
  where d.id = '00000000-0000-0000-0000-0000000000d2';
  reset role;
  return v;
end; $$;

-- Nom affiché de D2 dans les relations de D1 (authenticated).
create function public._pse_relationship_name()
returns text language plpgsql as $$
declare v text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub','00000000-0000-0000-0000-0000000000d1','role','authenticated')::text, true);
  select r.first_name into v
  from public.list_my_relationships() r
  where r.other_id = '00000000-0000-0000-0000-0000000000d2';
  reset role;
  return v;
end; $$;

-- ---------------------------------------------------------------------------
-- Fixtures (en `postgres`) : deux membres actifs approuvés de genres opposés
-- dans l'univers « open_marriage », une photo principale pour le candidat,
-- un match ACCEPTÉ entre eux (pour list_my_relationships).
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'pse-d1@ex.test'),
  ('00000000-0000-0000-0000-0000000000d2', 'pse-d2@ex.test');

insert into public.profiles (id, first_name, gender, birth_date, discovery_universe)
values
  ('00000000-0000-0000-0000-0000000000d1', 'Vivianne', 'femme', date '1992-05-01', 'open_marriage'),
  ('00000000-0000-0000-0000-0000000000d2', 'Candidat', 'homme', date '1988-03-01', 'open_marriage');

update public.profiles set verification_status = 'approved'
 where id in ('00000000-0000-0000-0000-0000000000d1',
              '00000000-0000-0000-0000-0000000000d2');

insert into public.photos (profile_id, storage_path, is_primary)
values ('00000000-0000-0000-0000-0000000000d2',
        '00000000-0000-0000-0000-0000000000d2/photo-principale.webp', true);

insert into public.matches (user_a, user_b, status)
values ('00000000-0000-0000-0000-0000000000d1',
        '00000000-0000-0000-0000-0000000000d2', 'accepted');

-- ===========================================================================
select plan(12);

-- 1. Colonne présente.
select has_column('public', 'profiles', 'pseudo', 'profiles.pseudo existe');

-- 2..5. CHECK profiles_pseudo_len (en postgres, directement sur la contrainte).
select public._pse_cap($sql$update public.profiles set pseudo = 'Sango'
  where id = '00000000-0000-0000-0000-0000000000d2'$sql$);
select is(current_setting('test.state', true), '',
  'pseudo valide (5 caractères) accepté');

select public._pse_cap($sql$update public.profiles set pseudo = 'a'
  where id = '00000000-0000-0000-0000-0000000000d2'$sql$);
select is(current_setting('test.state', true), '23514',
  'pseudo trop court (1 caractère) rejeté par le CHECK');

select public._pse_cap($sql$update public.profiles set pseudo = '   '
  where id = '00000000-0000-0000-0000-0000000000d2'$sql$);
select is(current_setting('test.state', true), '23514',
  'pseudo blanc rejeté par le CHECK (btrim)');

select public._pse_cap(format(
  $sql$update public.profiles set pseudo = %L
    where id = '00000000-0000-0000-0000-0000000000d2'$sql$,
  repeat('x', 31)));
select is(current_setting('test.state', true), '23514',
  'pseudo trop long (31 caractères) rejeté par le CHECK');

-- 6. Écriture RLS owner-only : le membre écrit SON pseudo sous authenticated.
select is(public._pse_write_own('MonPseudo'), '',
  'le membre écrit son propre pseudo (RLS owner)');

-- 7..8. Découverte : pseudo affiché quand présent, prénom en repli.
select is(public._pse_discover_name(), 'MonPseudo',
  'discover_candidates affiche le pseudo quand il est renseigné');

update public.profiles set pseudo = null
 where id = '00000000-0000-0000-0000-0000000000d2';
select is(public._pse_discover_name(), 'Candidat',
  'discover_candidates replie sur le prénom quand le pseudo est NULL');

-- 9..10. Relations : mêmes règles (couvre messagerie / favoris / visiteurs).
update public.profiles set pseudo = 'MonPseudo'
 where id = '00000000-0000-0000-0000-0000000000d2';
select is(public._pse_relationship_name(), 'MonPseudo',
  'list_my_relationships affiche le pseudo quand il est renseigné');

update public.profiles set pseudo = null
 where id = '00000000-0000-0000-0000-0000000000d2';
select is(public._pse_relationship_name(), 'Candidat',
  'list_my_relationships replie sur le prénom quand le pseudo est NULL');

-- 11..12. Vitrine (structurel) : les deux projections publiques portent le
-- repli pseudo (le comportemental complet exige la fixture de publication,
-- déjà couverte par la suite candidate_showcase).
select matches(
  pg_get_functiondef('public.get_public_candidate_showcase(text)'::regprocedure),
  'nullif\(pg_catalog\.btrim\(pr\.pseudo\)',
  'get_public_candidate_showcase projette le pseudo en priorité');

select matches(
  pg_get_functiondef('public.list_public_candidate_showcases(integer,integer)'::regprocedure),
  'nullif\(pg_catalog\.btrim\(pr\.pseudo\)',
  'list_public_candidate_showcases projette le pseudo en priorité');

select * from finish();

rollback;
