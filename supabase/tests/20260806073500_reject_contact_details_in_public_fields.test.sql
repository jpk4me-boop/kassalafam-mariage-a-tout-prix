-- =============================================================================
-- Suite pgTAP — coordonnées personnelles refusées dans les champs PUBLICS
-- (migration 20260806073500).
--
-- Cibles : la détection `text_has_contact_details` — vrais positifs ET faux
--          positifs, qui comptent tout autant : refuser une biographie honnête
--          est pire que laisser passer un cas tordu ; le trigger sur
--          `profiles` (refus à l'INSERT comme à l'UPDATE, champ fautif nommé
--          dans DETAIL) ; la garantie qu'un profil existant n'est JAMAIS
--          re-bloqué par une écriture qui ne touche pas ces colonnes ; et le
--          fait que la fonction reste INTERNE.
--
-- Exécution : npx supabase test db — stack Supabase local avec Docker.
--
-- UUID de travail :
--   C1 = …c1  (création propre, puis tentatives de modification)
-- =============================================================================

begin;

create extension if not exists pgtap with schema extensions;

set search_path = extensions, public, pg_catalog;

select plan(24);

-- Helpers --------------------------------------------------------------------

/** Vrai si l'instruction échoue AVEC notre erreur métier. */
create function public._rcd_refuse(p_sql text)
returns boolean language plpgsql as $$
begin
  execute p_sql;
  return false;
exception
  when others then
    return sqlerrm = 'PROFILE_CONTACT_DETAILS_NOT_ALLOWED';
end;
$$;

/** Vrai si l'instruction passe sans erreur. */
create function public._rcd_accepte(p_sql text)
returns boolean language plpgsql as $$
begin
  execute p_sql;
  return true;
exception
  when others then
    return false;
end;
$$;

/** DETAIL de l'erreur levée — c'est le nom du champ fautif. */
create function public._rcd_champ(p_sql text)
returns text language plpgsql as $$
declare
  v_detail text;
begin
  execute p_sql;
  return null;
exception
  when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    return v_detail;
end;
$$;

-- Fixtures --------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'rcd-c1@ex.test');

-- 1..10 — Détection : ce qui DOIT être refusé ---------------------------------

select ok(public.text_has_contact_details('Appelez-moi au 691849494'),
  'un numéro à 9 chiffres est détecté');

select ok(public.text_has_contact_details('mon numero : 6 91 84 94 94'),
  'un numéro espacé est détecté');

select ok(public.text_has_contact_details('237-691-84-94-94'),
  'un numéro tireté est détecté');

select ok(public.text_has_contact_details('+237 691849'),
  'un indicatif international est détecté');

select ok(public.text_has_contact_details('ecrivez a moi@gmail.com'),
  'une adresse email est détectée');

select ok(public.text_has_contact_details('mon insta @belle_ame'),
  'un identifiant précédé de @ est détecté');

select ok(public.text_has_contact_details('contactez moi sur WhatsApp'),
  'la mention WhatsApp est détectée, casse indifférente');

select ok(public.text_has_contact_details('whats app direct'),
  'la graphie « whats app » est détectée');

select ok(public.text_has_contact_details('https://wa.me/237691849494'),
  'un lien wa.me est détecté');

select ok(public.text_has_contact_details('rejoins moi sur Telegram'),
  'une autre messagerie est détectée');

-- 11..17 — Détection : ce qui doit PASSER --------------------------------------

select ok(not public.text_has_contact_details(null),
  'un texte nul passe');

select ok(not public.text_has_contact_details('   '),
  'un texte vide passe');

select ok(not public.text_has_contact_details(
  'J''ai 34 ans, 2 enfants, et je vis à Douala depuis 2019.'),
  'âges, nombre d''enfants et année passent');

select ok(not public.text_has_contact_details(
  'Née le 12/05/1990, je cherche un foyer stable.'),
  'une date 12/05/1990 passe — le « / » n''est pas un séparateur accepté');

select ok(not public.text_has_contact_details(
  'Mon budget mariage tourne autour de 2 500 000 FCFA.'),
  'un montant en FCFA passe');

select ok(not public.text_has_contact_details(
  'Je suis croyante, douce, et j''aime cuisiner le ndolé.'),
  'une biographie ordinaire passe');

select ok(not public.text_has_contact_details('Marie-Grâce'),
  'un prénom composé passe');

-- 18..23 — Trigger --------------------------------------------------------------

select ok(
  public._rcd_refuse($$
    insert into public.profiles (id, first_name, bio)
    values ('00000000-0000-0000-0000-0000000000c1', 'Testeuse',
            'ecris moi au 691849494')
  $$),
  'INSERT avec un numéro dans la bio est refusé');

select ok(
  public._rcd_accepte($$
    insert into public.profiles (id, first_name, bio)
    values ('00000000-0000-0000-0000-0000000000c1', 'Testeuse',
            'Je cherche un mariage serieux.')
  $$),
  'INSERT propre accepté');

select ok(
  public._rcd_refuse($$
    update public.profiles
    set partner_expectations = 'contacte moi : moi@gmail.com'
    where id = '00000000-0000-0000-0000-0000000000c1'
  $$),
  'UPDATE avec un email dans les attentes est refusé');

select ok(
  public._rcd_refuse($$
    update public.profiles set pseudo = 'belle@ame237'
    where id = '00000000-0000-0000-0000-0000000000c1'
  $$),
  'UPDATE avec un identifiant dans le pseudo est refusé');

select is(
  public._rcd_champ($$
    update public.profiles set bio = 'mon numero 691849494'
    where id = '00000000-0000-0000-0000-0000000000c1'
  $$),
  'bio',
  'le champ fautif est nommé dans DETAIL, pour que l''UI pointe le bon encadré');

select ok(
  public._rcd_accepte($$
    update public.profiles set blur_photos = true
    where id = '00000000-0000-0000-0000-0000000000c1'
  $$),
  'écrire sur une AUTRE colonne ne déclenche aucune validation');

-- 24 — La fonction reste interne -------------------------------------------------

select ok(
  not has_function_privilege('authenticated',
    'public.text_has_contact_details(text)', 'execute'),
  'text_has_contact_details n''est PAS exécutable par authenticated');

select * from finish();

rollback;
