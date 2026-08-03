-- =============================================================================
-- Suite pgTAP — Fondation notifications WhatsApp (PR A).
-- Cibles : consentement par canal (RPC grant/withdraw/status, phone requis),
--          enfilement notification_deliveries (types autorisés, consentement,
--          dédup pending), états terminaux immuables, triggers source
--          (nouveau message avec dédup non-lu, nouvel intérêt, intérêt
--          accepté), absence de contenu de message dans les notifications.
--
-- Exécution : npx supabase test db — stack Supabase local avec Docker.
--
-- Principe : TRANSACTION UNIQUE (begin … rollback), rôle `authenticated` via
-- JWT local pour les RPC membre, assertions en `postgres`, GUC de capture.
--
-- UUID de travail :
--   E1 = 00000000-0000-0000-0000-0000000000e1  (femme, numéro WhatsApp)
--   E2 = 00000000-0000-0000-0000-0000000000e2  (homme, SANS numéro)
--   E3 = 00000000-0000-0000-0000-0000000000e3  (homme, partenaire de match)
-- =============================================================================

begin;

create extension if not exists pgtap with schema extensions;

set search_path = extensions, public, pg_catalog;

-- Helpers --------------------------------------------------------------------
create function public._wa_cap(p_sql text)
returns void language plpgsql as $$
begin
  execute p_sql;
  perform set_config('test.state', '', true);
  perform set_config('test.err', '', true);
exception when others then
  perform set_config('test.state', sqlstate, true);
  perform set_config('test.err', sqlerrm, true);
end; $$;

create function public._wa_rpc_as(p_uid uuid, p_sql text)
returns text language plpgsql as $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
  perform public._wa_cap(p_sql);
  reset role;
  return current_setting('test.err', true);
end; $$;

-- Fixtures -------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'wa-e1@ex.test'),
  ('00000000-0000-0000-0000-0000000000e2', 'wa-e2@ex.test'),
  ('00000000-0000-0000-0000-0000000000e3', 'wa-e3@ex.test');

insert into public.profiles (id, first_name, gender, birth_date, whatsapp_phone)
values
  ('00000000-0000-0000-0000-0000000000e1', 'Estelle', 'femme', date '1993-02-01', '+237670000001'),
  ('00000000-0000-0000-0000-0000000000e2', 'Ernest',  'homme', date '1990-06-01', null),
  ('00000000-0000-0000-0000-0000000000e3', 'Edmond',  'homme', date '1988-09-01', null);

-- ===========================================================================
select plan(17);

-- 1..2. Tables présentes.
select has_table('public', 'notification_channel_consents', 'table consents présente');
select has_table('public', 'notification_deliveries', 'table deliveries présente');

-- 3. Accord SANS numéro → refus explicite (E2).
select matches(
  public._wa_rpc_as('00000000-0000-0000-0000-0000000000e2',
    'select public.grant_my_whatsapp_notifications()'),
  'NOTIFICATIONS_PHONE_REQUIRED',
  'accord refusé sans numéro WhatsApp');

-- 4. Accord AVEC numéro (E1) → consentement actif.
select is(
  public._wa_rpc_as('00000000-0000-0000-0000-0000000000e1',
    'select public.grant_my_whatsapp_notifications()'),
  '', 'accord accepté avec numéro');
select is(
  (select count(*)::int from public.notification_channel_consents
   where profile_id = '00000000-0000-0000-0000-0000000000e1'
     and channel = 'whatsapp' and withdrawn_at is null),
  1, 'consentement whatsapp actif pour E1');

-- 5. Enfilement : type autorisé + consentement → livraison pending.
insert into public.member_notifications (user_id, type, title, body)
values ('00000000-0000-0000-0000-0000000000e1', 'account_security',
        'Sécurité du compte', 'Une activité nécessite votre attention.');
select is(
  (select count(*)::int from public.notification_deliveries
   where profile_id = '00000000-0000-0000-0000-0000000000e1'
     and event_type = 'account_security' and status = 'pending'),
  1, 'livraison whatsapp enfilée pour un type autorisé');

-- 6. Dédup : second événement du même type → toujours UNE seule pending.
insert into public.member_notifications (user_id, type, title, body)
values ('00000000-0000-0000-0000-0000000000e1', 'account_security',
        'Sécurité du compte', 'Une activité nécessite votre attention.');
select is(
  (select count(*)::int from public.notification_deliveries
   where profile_id = '00000000-0000-0000-0000-0000000000e1'
     and event_type = 'account_security' and status = 'pending'),
  1, 'dédup : une seule livraison pending par (membre, type)');

-- 7. Type NON autorisé → aucune livraison.
insert into public.member_notifications (user_id, type, title, body)
values ('00000000-0000-0000-0000-0000000000e1', 'type_inconnu',
        'Divers', 'Événement hors périmètre.');
select is(
  (select count(*)::int from public.notification_deliveries
   where profile_id = '00000000-0000-0000-0000-0000000000e1'
     and event_type = 'type_inconnu'),
  0, 'type hors périmètre ignoré');

-- 8. États terminaux immuables.
update public.notification_deliveries set status = 'sent', sent_at = now()
 where profile_id = '00000000-0000-0000-0000-0000000000e1'
   and event_type = 'account_security';
select public._wa_cap(
  $sql$update public.notification_deliveries set status = 'failed'
     where event_type = 'account_security'$sql$);
select matches(current_setting('test.err', true),
  'DELIVERY_TERMINAL_STATUS_IMMUTABLE',
  'un état terminal ne se réécrit jamais');

-- 9. Retrait → plus AUCUNE livraison pour les événements suivants.
select is(
  public._wa_rpc_as('00000000-0000-0000-0000-0000000000e1',
    'select public.withdraw_my_whatsapp_notifications()'),
  '', 'retrait accepté');
insert into public.member_notifications (user_id, type, title, body)
values ('00000000-0000-0000-0000-0000000000e1', 'verification_approved',
        'Profil vérifié', 'Votre profil a été approuvé.');
select is(
  (select count(*)::int from public.notification_deliveries
   where profile_id = '00000000-0000-0000-0000-0000000000e1'
     and event_type = 'verification_approved'),
  0, 'après retrait, aucune nouvelle livraison');

-- 10. Nouvel intérêt (E3 → E2) : notification interne créée pour E2,
--     mais AUCUNE livraison (E2 sans numéro ni consentement).
insert into public.matches (user_a, user_b, status)
values ('00000000-0000-0000-0000-0000000000e3',
        '00000000-0000-0000-0000-0000000000e2', 'pending');
select is(
  (select count(*)::int from public.member_notifications
   where user_id = '00000000-0000-0000-0000-0000000000e2'
     and type = 'new_interest'
     and related_profile_id = '00000000-0000-0000-0000-0000000000e3'),
  1, 'nouvel intérêt : notification interne créée pour le destinataire');
select is(
  (select count(*)::int from public.notification_deliveries
   where profile_id = '00000000-0000-0000-0000-0000000000e2'),
  0, 'sans consentement : notification interne SANS livraison');

-- 11. Intérêt accepté : l''initiateur (E3) est notifié.
update public.matches set status = 'accepted'
 where user_a = '00000000-0000-0000-0000-0000000000e3'
   and user_b = '00000000-0000-0000-0000-0000000000e2';
select is(
  (select count(*)::int from public.member_notifications
   where user_id = '00000000-0000-0000-0000-0000000000e3'
     and type = 'interest_accepted'),
  1, 'intérêt accepté : l''initiateur est notifié');

-- 12..13. Nouveau message (E3 → E1 sur leur match accepté) : notification
--     SANS le contenu, et dédup tant que non lue.
insert into public.matches (user_a, user_b, status)
values ('00000000-0000-0000-0000-0000000000e1',
        '00000000-0000-0000-0000-0000000000e3', 'accepted');
insert into public.messages (match_id, sender_id, content)
select m.id, '00000000-0000-0000-0000-0000000000e3', 'contenu privé test'
from public.matches m
where m.user_a = '00000000-0000-0000-0000-0000000000e1'
  and m.user_b = '00000000-0000-0000-0000-0000000000e3';
select is(
  (select count(*)::int from public.member_notifications
   where user_id = '00000000-0000-0000-0000-0000000000e1'
     and type = 'new_message'),
  1, 'nouveau message : notification interne créée');
select is(
  (select count(*)::int from public.member_notifications
   where user_id = '00000000-0000-0000-0000-0000000000e1'
     and type = 'new_message'
     and (title ilike '%contenu privé%' or body ilike '%contenu privé%')),
  0, 'le CONTENU du message n''apparaît JAMAIS dans la notification');

-- 14. Dédup non-lu : second message → toujours UNE notification non lue.
insert into public.messages (match_id, sender_id, content)
select m.id, '00000000-0000-0000-0000-0000000000e3', 'second message'
from public.matches m
where m.user_a = '00000000-0000-0000-0000-0000000000e1'
  and m.user_b = '00000000-0000-0000-0000-0000000000e3';
select is(
  (select count(*)::int from public.member_notifications
   where user_id = '00000000-0000-0000-0000-0000000000e1'
     and type = 'new_message' and read_at is null),
  1, 'dédup : une seule notification new_message non lue par expéditeur');

select * from finish();

rollback;
