-- =============================================================================
-- Suite pgTAP — témoin de visite guidée `profiles.tour_completed_at`
-- (migration 65).
--
-- Cibles : la forme de la colonne, et surtout le CHEMIN RÉEL — un membre écrit
--          lui-même son témoin depuis le navigateur, sous le rôle
--          `authenticated`. Conformément à la règle tirée de l'incident du
--          12/08, on ne teste pas cette écriture sous le superutilisateur : on
--          rejoue l'identité du membre.
--
-- Exécution : scripts/pgtap/run-pgtap.sh (VPS).
--
-- UUID de travail : M1 = …e1 (le membre), M2 = …e2 (quelqu'un d'autre)
-- =============================================================================

begin;

create extension if not exists pgtap with schema extensions;

set search_path = extensions, public, pg_catalog;

select plan(7);

-- Helper ----------------------------------------------------------------------

/**
 * Joue `p_sql` SOUS LE RÔLE `authenticated`, puis rend la main. Renvoie NULL si
 * l'instruction passe, SQLERRM sinon. Le rôle est TOUJOURS rendu, erreur ou pas.
 */
create function public._tour_essai_membre(p_sql text)
returns text language plpgsql as $$
begin
  execute 'set local role authenticated';
  begin
    execute p_sql;
    execute 'reset role';
    return null;
  exception
    when others then
      execute 'reset role';
      return sqlerrm;
  end;
end;
$$;

/** Nombre de lignes touchées par `p_sql` sous le rôle `authenticated`. */
create function public._tour_lignes_membre(p_sql text)
returns integer language plpgsql as $$
declare
  v_lignes integer;
begin
  execute 'set local role authenticated';
  execute p_sql;
  get diagnostics v_lignes = row_count;
  execute 'reset role';
  return v_lignes;
end;
$$;

-- Fixtures --------------------------------------------------------------------

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'tour-e1@ex.test'),
  ('00000000-0000-0000-0000-0000000000e2', 'tour-e2@ex.test');

insert into public.profiles (id, first_name, verification_status, account_status)
values
  ('00000000-0000-0000-0000-0000000000e1', 'Testeuse', 'approved', 'active'),
  ('00000000-0000-0000-0000-0000000000e2', 'Autre', 'approved', 'active');

-- 1..3 — Forme de la colonne ----------------------------------------------------

select has_column('public', 'profiles', 'tour_completed_at',
  'la colonne tour_completed_at existe');

select col_type_is('public', 'profiles', 'tour_completed_at',
  'timestamp with time zone',
  'le témoin est une date complète, pas un booléen : on saura QUAND');

select col_is_null('public', 'profiles', 'tour_completed_at',
  'la colonne est NULLABLE — NULL signifie « visite à jouer »');

-- 4 — Les profils existants voient la visite --------------------------------------

select is(
  (select count(*)::int from public.profiles
   where id = '00000000-0000-0000-0000-0000000000e1'
     and tour_completed_at is null),
  1,
  'un profil créé sans mention part à NULL : il verra la visite une fois');

-- Session membre M1.
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}',
  true);

-- 5..7 — Le chemin réel, sous identité de membre -----------------------------------

select is(
  public._tour_essai_membre($$
    update public.profiles set tour_completed_at = now()
    where id = '00000000-0000-0000-0000-0000000000e1'
  $$),
  null,
  'le membre pose lui-même son témoin — aucune garde ne le refuse');

select is(
  public._tour_essai_membre($$
    update public.profiles set tour_completed_at = null
    where id = '00000000-0000-0000-0000-0000000000e1'
  $$),
  null,
  'le membre peut le remettre à NULL : c''est « Revoir la visite guidée »');

select is(
  public._tour_lignes_membre($$
    update public.profiles set tour_completed_at = now()
    where id = '00000000-0000-0000-0000-0000000000e2'
  $$),
  0,
  'le membre ne touche JAMAIS le témoin d''un autre : la RLS ne laisse '
  'passer aucune ligne');

select * from finish();

rollback;
