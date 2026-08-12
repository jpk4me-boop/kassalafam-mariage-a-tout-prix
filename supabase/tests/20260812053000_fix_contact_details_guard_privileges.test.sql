-- =============================================================================
-- Suite pgTAP — le garde-fou « coordonnées » doit fonctionner SOUS L'IDENTITÉ
-- D'UN MEMBRE (migration 64, correctif de 20260806073500).
--
-- POURQUOI cette suite existe :
--   La suite 20260806073500 valide la DÉTECTION et le REFUS, mais elle exécute
--   tout sous l'identité du superutilisateur qui joue les migrations. Or la
--   panne du 06→12/08 ne se voyait QUE sous le rôle `authenticated` : le
--   trigger, laissé en SECURITY INVOKER, n'avait pas le droit d'appeler
--   `text_has_contact_details`, restée interne. Toute écriture de membre sur
--   `profiles` tombait en « permission denied » — page /profile ET onboarding.
--   Une suite qui ne change jamais de rôle ne peut pas voir ce genre de bug.
--
--   RÈGLE TIRÉE DE L'INCIDENT : dès qu'une garde s'appuie sur un objet dont les
--   privilèges sont durcis, la suite DOIT rejouer le chemin sous
--   `set local role authenticated`, pas seulement sous postgres.
--
-- Exécution : scripts/pgtap/run-pgtap.sh (VPS) — filtre possible sur le nom.
--
-- UUID de travail : M1 = …d1 (membre ordinaire, vérifié et actif)
-- =============================================================================

begin;

create extension if not exists pgtap with schema extensions;

set search_path = extensions, public, pg_catalog;

select plan(6);

-- Helper ----------------------------------------------------------------------

/**
 * Joue `p_sql` SOUS LE RÔLE `authenticated`, puis rend la main au rôle du test.
 * Renvoie NULL si l'instruction passe, SQLERRM sinon. Le rôle est TOUJOURS
 * rendu, y compris sur erreur : sans cela, les assertions suivantes tourneraient
 * sous une identité de membre et mentiraient.
 */
create function public._cdg_essai_membre(p_sql text)
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

-- Fixtures --------------------------------------------------------------------

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'cdg-d1@ex.test');

insert into public.profiles (id, first_name, bio, verification_status,
                             account_status)
values ('00000000-0000-0000-0000-0000000000d1', 'Testeuse',
        'Je cherche un mariage serieux.', 'approved', 'active');

-- Session membre : le trigger et la RLS doivent voir ce membre-là.
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}',
  true);

-- 1..2 — La forme du correctif -------------------------------------------------

select ok(
  (select p.prosecdef
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'profiles_reject_contact_details'),
  'le trigger est SECURITY DEFINER — sinon un membre ne peut pas appeler la '
  'fonction d''aide et TOUTE écriture de profil échoue');

select ok(
  not has_function_privilege('authenticated',
    'public.text_has_contact_details(text)', 'execute'),
  'la fonction d''aide reste INTERNE : le correctif ne rend aucun privilège '
  'au rôle authenticated');

-- 3..5 — Le chemin réel, sous identité de membre --------------------------------

select is(
  public._cdg_essai_membre($$
    update public.profiles set blur_photos = true
    where id = '00000000-0000-0000-0000-0000000000d1'
  $$),
  null,
  'un membre peut écrire une colonne NON surveillée — c''est exactement ce qui '
  'échouait : le droit sur la fonction est vérifié à la planification, la '
  'court-circuitation logique ne protège de rien');

select is(
  public._cdg_essai_membre($$
    update public.profiles set bio = 'Croyante, douce, j''aime cuisiner.'
    where id = '00000000-0000-0000-0000-0000000000d1'
  $$),
  null,
  'un membre peut enregistrer une biographie honnête');

select is(
  public._cdg_essai_membre($$
    update public.profiles set bio = 'ecris moi au 691849494'
    where id = '00000000-0000-0000-0000-0000000000d1'
  $$),
  'PROFILE_CONTACT_DETAILS_NOT_ALLOWED',
  'la garde REFUSE toujours un numéro sous identité de membre — le correctif '
  'de privilèges n''ouvre aucune brèche');

-- 6 — Le chemin privilégié n'a pas bougé ----------------------------------------

select throws_ok($$
    update public.profiles set bio = 'appelle 691849494'
    where id = '00000000-0000-0000-0000-0000000000d1'
  $$,
  '22023',
  'PROFILE_CONTACT_DETAILS_NOT_ALLOWED',
  'la garde refuse aussi sous rôle privilégié : comportement inchangé');

select * from finish();

rollback;
