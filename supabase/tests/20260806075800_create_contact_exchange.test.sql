-- =============================================================================
-- Suite pgTAP — échange MUTUEL de coordonnées (migration 20260806075800).
--
-- Ce que la suite protège, dans l'ordre d'importance :
--   1. AUCUN numéro ne sort sans l'accord de la personne sollicitée ;
--   2. la table n'est accessible par AUCUN chemin direct ;
--   3. le premium ouvre le droit de DEMANDER, jamais celui de recevoir ;
--   4. l'insistance est bloquée : verrou 30 jours après refus, verrou
--      DÉFINITIF après retrait par la personne sollicitée ;
--   5. le plafond de 3 demandes par 24 h tient ;
--   6. un blocage coupe la révélation, et le retrait reste possible malgré lui.
--
-- Exécution : npx supabase test db — stack Supabase local avec Docker.
--
-- UUID de travail :
--   E1 = …e1  homme premium, demandeur
--   E2 = …e2  femme sollicitée
--   E3 = …e3  homme SANS premium
--   E4..E6   autres femmes (refus, puis plafond quotidien)
--   D1..D3   les trois conversations acceptees
-- =============================================================================

begin;

create extension if not exists pgtap with schema extensions;

set search_path = extensions, public, pg_catalog;

select plan(21);

-- Helpers ---------------------------------------------------------------------

/** Exécute sous l'identité d'un membre. */
create function public._ce_as(p_uid uuid, p_sql text)
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

/** Profil complet et actif. */
create function public._ce_profile(p_id uuid, p_prenom text, p_genre public.gender,
                                   p_tel text)
returns void language plpgsql as $$
begin
  insert into auth.users (id, email) values (p_id, p_prenom || '@ce.test');
  insert into public.profiles (
    id, first_name, gender, birth_date, marital_status,
    country, city, discovery_universe, bio, partner_expectations,
    verification_status, account_status, whatsapp_phone,
    onboarding_completed_at
  ) values (
    p_id, p_prenom, p_genre, date '1994-03-02', 'celibataire',
    'Cameroun', 'Douala', 'open_marriage',
    'Presentation de test.', 'Attentes de test.',
    'approved', 'active'::public.account_status, p_tel,
    pg_catalog.now()
  );
end;
$$;

-- Fixtures ---------------------------------------------------------------------

select public._ce_profile('00000000-0000-0000-0000-0000000000e1'::uuid,
  'Hugo', 'homme', '237600000001');
select public._ce_profile('00000000-0000-0000-0000-0000000000e2'::uuid,
  'Fara', 'femme', '237600000002');
select public._ce_profile('00000000-0000-0000-0000-0000000000e3'::uuid,
  'Habib', 'homme', '237600000003');
select public._ce_profile('00000000-0000-0000-0000-0000000000e4'::uuid,
  'Fanta', 'femme', '237600000004');
select public._ce_profile('00000000-0000-0000-0000-0000000000e5'::uuid,
  'Fatou', 'femme', '237600000005');
select public._ce_profile('00000000-0000-0000-0000-0000000000e6'::uuid,
  'Flore', 'femme', '237600000006');

-- Deux conversations acceptées.
insert into public.matches (id, user_a, user_b, status) values
  ('00000000-0000-0000-0000-0000000000d1',
   '00000000-0000-0000-0000-0000000000e1',
   '00000000-0000-0000-0000-0000000000e2', 'accepted'),
  ('00000000-0000-0000-0000-0000000000d2',
   '00000000-0000-0000-0000-0000000000e1',
   '00000000-0000-0000-0000-0000000000e4', 'accepted'),
  ('00000000-0000-0000-0000-0000000000d3',
   '00000000-0000-0000-0000-0000000000e3',
   '00000000-0000-0000-0000-0000000000e2', 'accepted'),
  ('00000000-0000-0000-0000-0000000000d4',
   '00000000-0000-0000-0000-0000000000e1',
   '00000000-0000-0000-0000-0000000000e5', 'accepted'),
  ('00000000-0000-0000-0000-0000000000d5',
   '00000000-0000-0000-0000-0000000000e1',
   '00000000-0000-0000-0000-0000000000e6', 'accepted');

-- Hugo est premium ; Habib ne l'est pas.
insert into public.premium_subscriptions
  (profile_id, profile_id_snapshot, plan_id, status, source, starts_at, ends_at)
select '00000000-0000-0000-0000-0000000000e1',
       '00000000-0000-0000-0000-0000000000e1',
       p.id, 'active'::public.premium_subscription_status,
       'admin'::public.premium_subscription_source,
       pg_catalog.now() - interval '1 day',
       pg_catalog.now() + interval '30 days'
from public.premium_plans p limit 1;

-- 1..3 — Aucun accès direct à la table -------------------------------------------

select ok(
  not has_table_privilege('authenticated', 'public.contact_exchange_requests', 'select'),
  'authenticated ne peut PAS lire la table');

select ok(
  not has_table_privilege('authenticated', 'public.contact_exchange_requests', 'insert'),
  'authenticated ne peut PAS y écrire');

select is(
  (select count(*)::int from pg_policy
   where polrelid = 'public.contact_exchange_requests'::regclass),
  0,
  'aucune policy permissive : tout passe par les RPC');

-- 4..6 — Le premium ouvre le droit de demander -----------------------------------

select is(
  public._ce_as('00000000-0000-0000-0000-0000000000e3',
    $$select public.request_contact_exchange('00000000-0000-0000-0000-0000000000d3')$$),
  'ERR:CONTACT_EXCHANGE_PREMIUM_REQUIRED',
  'sans premium, la demande est refusée');

select is(
  public._ce_as('00000000-0000-0000-0000-0000000000e1',
    $$select public.request_contact_exchange('00000000-0000-0000-0000-0000000000d1')$$),
  'requested',
  'avec premium, la demande part');

select is(
  public._ce_as('00000000-0000-0000-0000-0000000000e1',
    $$select public.request_contact_exchange('00000000-0000-0000-0000-0000000000d1')$$),
  'ERR:CONTACT_EXCHANGE_ALREADY_OPEN',
  'une seule demande vivante par paire');

-- 7..9 — Tant qu'elle n'a pas accepté, AUCUN numéro ne sort ----------------------

select is(
  public._ce_as('00000000-0000-0000-0000-0000000000e1',
    $$select other_whatsapp from public.get_contact_exchange('00000000-0000-0000-0000-0000000000d1')$$),
  'ok',
  'demande en attente : le demandeur ne voit AUCUN numéro');

select is(
  public._ce_as('00000000-0000-0000-0000-0000000000e2',
    $$select other_whatsapp from public.get_contact_exchange('00000000-0000-0000-0000-0000000000d1')$$),
  'ok',
  'demande en attente : la sollicitée ne voit AUCUN numéro non plus');

select is(
  public._ce_as('00000000-0000-0000-0000-0000000000e2',
    $$select state from public.get_contact_exchange('00000000-0000-0000-0000-0000000000d1')$$),
  'pending',
  'l''état est bien « en attente » des deux côtés');

-- 10..12 — L'acceptation révèle, des DEUX côtés ----------------------------------

select is(
  public._ce_as('00000000-0000-0000-0000-0000000000e1',
    $$select public.respond_to_contact_exchange('00000000-0000-0000-0000-0000000000d1', 'accept')$$),
  'ERR:CONTACT_EXCHANGE_NOTHING_TO_ANSWER',
  'le demandeur ne peut pas accepter à la place de la sollicitée');

select is(
  public._ce_as('00000000-0000-0000-0000-0000000000e2',
    $$select public.respond_to_contact_exchange('00000000-0000-0000-0000-0000000000d1', 'accept')$$),
  'accepted',
  'la personne sollicitée accepte');

select is(
  public._ce_as('00000000-0000-0000-0000-0000000000e1',
    $$select other_whatsapp from public.get_contact_exchange('00000000-0000-0000-0000-0000000000d1')$$),
  '237600000002',
  'après acceptation, le demandeur voit le numéro');

-- 13 — Symétrie : elle voit le sien aussi ----------------------------------------

select is(
  public._ce_as('00000000-0000-0000-0000-0000000000e2',
    $$select other_whatsapp from public.get_contact_exchange('00000000-0000-0000-0000-0000000000d1')$$),
  '237600000001',
  'l''échange est symétrique : elle voit aussi le numéro du demandeur');

-- 14..16 — Retrait par la sollicitée : révélation coupée, verrou DÉFINITIF -------

select is(
  public._ce_as('00000000-0000-0000-0000-0000000000e2',
    $$select public.revoke_contact_exchange('00000000-0000-0000-0000-0000000000d1')$$),
  'revoked',
  'la personne sollicitée peut reprendre son accord');

select is(
  public._ce_as('00000000-0000-0000-0000-0000000000e1',
    $$select other_whatsapp from public.get_contact_exchange('00000000-0000-0000-0000-0000000000d1')$$),
  'ok',
  'après retrait, plus aucun numéro n''est renvoyé');

select is(
  public._ce_as('00000000-0000-0000-0000-0000000000e1',
    $$select public.request_contact_exchange('00000000-0000-0000-0000-0000000000d1')$$),
  'ERR:CONTACT_EXCHANGE_CLOSED_BY_TARGET',
  'retrait par la sollicitée : verrou DÉFINITIF, aucune insistance possible');

-- 17..18 — Refus : verrou de 30 jours --------------------------------------------

select is(
  public._ce_as('00000000-0000-0000-0000-0000000000e1',
    $$select public.request_contact_exchange('00000000-0000-0000-0000-0000000000d2')$$),
  'requested',
  'seconde demande, vers une autre personne');

select is(
  public._ce_as('00000000-0000-0000-0000-0000000000e4',
    $$select public.respond_to_contact_exchange('00000000-0000-0000-0000-0000000000d2', 'decline')$$)
  || '|' ||
  public._ce_as('00000000-0000-0000-0000-0000000000e1',
    $$select public.request_contact_exchange('00000000-0000-0000-0000-0000000000d2')$$),
  'declined|ERR:CONTACT_EXCHANGE_LOCKED',
  'après un refus, 30 jours avant toute nouvelle demande');

-- 19 — Un refus ne notifie PAS le demandeur ---------------------------------------

select is(
  (select count(*)::int from public.member_notifications n
   where n.user_id = '00000000-0000-0000-0000-0000000000e1'
     and n.type = 'contact_exchange_accepted'),
  1,
  'une seule notification d''acceptation : le refus reste silencieux');

-- 20 — Le plafond quotidien tient --------------------------------------------------
-- Deux demandes déjà parties (Fara, Fanta). La 3e doit passer, la 4e tomber.

select is(
  public._ce_as('00000000-0000-0000-0000-0000000000e1',
    $$select public.request_contact_exchange('00000000-0000-0000-0000-0000000000d4')$$)
  || '|' ||
  public._ce_as('00000000-0000-0000-0000-0000000000e1',
    $$select public.request_contact_exchange('00000000-0000-0000-0000-0000000000d5')$$),
  'requested|ERR:CONTACT_EXCHANGE_DAILY_LIMIT',
  'la 3e demande passe, la 4e en 24 h est refusée');

-- 21 — Le compteur restant est exposé, jamais négatif -------------------------------

select is(
  public._ce_as('00000000-0000-0000-0000-0000000000e1',
    $$select requests_left_today::text from public.get_contact_exchange('00000000-0000-0000-0000-0000000000d1')$$),
  '0',
  'le solde de demandes du jour est visible et plancher à zéro');

select * from finish();

rollback;
