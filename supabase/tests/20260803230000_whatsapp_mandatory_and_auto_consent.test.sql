-- =============================================================================
-- Suite pgTAP — Numéro WhatsApp obligatoire + consentement automatique
-- (migration 20260803230000).
-- Cibles : prédicat profile_meets_onboarding_requirements (numéro exigé),
--          RPC complete_member_onboarding_v2 (ONBOARDING_INCOMPLETE_WHATSAPP
--          puis succès), idempotence pour un profil déjà finalisé SANS numéro
--          (jamais re-bloqué), consentement posé AUTOMATIQUEMENT à
--          l'enregistrement du numéro, retrait explicite JAMAIS annulé par le
--          trigger, et enfilement effectif d'une livraison sans aucun geste
--          du membre.
--
-- Exécution : npx supabase test db — stack Supabase local avec Docker.
--
-- UUID de travail :
--   F1 = …f1  (parcours complet SANS numéro → refus, puis succès avec numéro)
--   F2 = …f2  (profil historique déjà finalisé, sans numéro)
--   F3 = …f3  (retrait explicite puis nouvelle écriture du numéro)
-- =============================================================================

begin;

create extension if not exists pgtap with schema extensions;

set search_path = extensions, public, pg_catalog;

-- Helpers --------------------------------------------------------------------
create function public._wam_cap(p_sql text)
returns void language plpgsql as $$
begin
  execute p_sql;
  perform set_config('test.state', '', true);
  perform set_config('test.err', '', true);
exception when others then
  perform set_config('test.state', sqlstate, true);
  perform set_config('test.err', sqlerrm, true);
end; $$;

/** Appelle la RPC de finalisation SOUS `authenticated` ; renvoie '' ou l'erreur. */
create function public._wam_finalize_as(p_uid uuid)
returns text language plpgsql as $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
  perform public._wam_cap('select public.complete_member_onboarding_v2()');
  reset role;
  return current_setting('test.err', true);
end; $$;

/** Profil complet SAUF le numéro WhatsApp. */
create function public._wam_seed(p_id uuid)
returns void language plpgsql as $$
begin
  insert into public.profiles (
    id, first_name, gender, birth_date, marital_status, religion,
    profession, education_level, height_cm,
    country, city, origin_country, origin_city, region,
    marriage_goals, desired_partner_traits, polygamy_preference, children_intent,
    bio, partner_expectations,
    acquisition_source, acquisition_source_recorded_at
  ) values (
    p_id, 'Testeur', 'homme', date '1990-01-01', 'celibataire', 'christianisme',
    'Ingénieur', 'master', 180,
    'Cameroun', 'Douala', 'Cameroun', 'Yaoundé', 'Littoral',
    array['build_family','stable_home'], array['kindness','sincerity'], 'no', 'wants_children',
    'Présentation de test.', 'Attentes de test.',
    'google', pg_catalog.now()
  );
  insert into public.photos (profile_id, storage_path, is_primary)
  values (p_id, p_id::text || '/photo-principale.webp', true);
end; $$;

-- Fixtures -------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'wam-f1@ex.test'),
  ('00000000-0000-0000-0000-0000000000f2', 'wam-f2@ex.test'),
  ('00000000-0000-0000-0000-0000000000f3', 'wam-f3@ex.test');

select public._wam_seed('00000000-0000-0000-0000-0000000000f1');
select public._wam_seed('00000000-0000-0000-0000-0000000000f2');
select public._wam_seed('00000000-0000-0000-0000-0000000000f3');

-- F2 = profil HISTORIQUE : finalisé AVANT la règle, sans numéro.
update public.profiles set onboarding_completed_at = pg_catalog.now()
 where id = '00000000-0000-0000-0000-0000000000f2';

-- ===========================================================================
select plan(12);

-- 1. Le prédicat refuse un profil complet SANS numéro.
select is(
  (select public.profile_meets_onboarding_requirements(p)
   from public.profiles p where p.id = '00000000-0000-0000-0000-0000000000f1'),
  false, 'prédicat : numéro WhatsApp manquant → non conforme');

-- 2. La RPC refuse avec l'erreur stable dédiée.
select matches(
  public._wam_finalize_as('00000000-0000-0000-0000-0000000000f1'),
  'ONBOARDING_INCOMPLETE_WHATSAPP',
  'finalisation refusée sans numéro WhatsApp');

-- 3. Aucun consentement tant qu'aucun numéro n'est enregistré.
select is(
  (select count(*)::int from public.notification_channel_consents
   where profile_id = '00000000-0000-0000-0000-0000000000f1'),
  0, 'aucun consentement sans numéro');

-- 4..5. Enregistrement du numéro → consentement posé AUTOMATIQUEMENT.
update public.profiles set whatsapp_phone = '237670000011'
 where id = '00000000-0000-0000-0000-0000000000f1';
select is(
  (select count(*)::int from public.notification_channel_consents
   where profile_id = '00000000-0000-0000-0000-0000000000f1'
     and channel = 'whatsapp' and withdrawn_at is null),
  1, 'consentement whatsapp posé automatiquement, sans geste du membre');
select is(
  (select public.profile_meets_onboarding_requirements(p)
   from public.profiles p where p.id = '00000000-0000-0000-0000-0000000000f1'),
  true, 'prédicat : profil conforme une fois le numéro renseigné');

-- 6. La finalisation aboutit désormais.
select is(
  public._wam_finalize_as('00000000-0000-0000-0000-0000000000f1'),
  '', 'finalisation acceptée avec le numéro');

-- 7. Une notification autorisée produit une livraison SANS aucun opt-in manuel.
insert into public.member_notifications (user_id, type, title, body)
values ('00000000-0000-0000-0000-0000000000f1', 'new_interest',
        'Nouvel intérêt', 'Un membre s''intéresse à votre profil.');
select is(
  (select count(*)::int from public.notification_deliveries
   where profile_id = '00000000-0000-0000-0000-0000000000f1'
     and channel = 'whatsapp' and status = 'pending'),
  1, 'livraison enfilée automatiquement (notifications intégrées au service)');

-- 8..9. Profil HISTORIQUE déjà finalisé, sans numéro : JAMAIS re-bloqué.
select is(
  public._wam_finalize_as('00000000-0000-0000-0000-0000000000f2'),
  '', 'profil déjà finalisé : la RPC reste idempotente, aucun re-blocage');
select isnt(
  (select onboarding_completed_at from public.profiles
   where id = '00000000-0000-0000-0000-0000000000f2'),
  null, 'le marqueur du profil historique est intact');

-- 10..12. Retrait EXPLICITE : jamais annulé par le trigger.
update public.profiles set whatsapp_phone = '237670000033'
 where id = '00000000-0000-0000-0000-0000000000f3';
update public.notification_channel_consents set withdrawn_at = pg_catalog.now()
 where profile_id = '00000000-0000-0000-0000-0000000000f3' and channel = 'whatsapp';
select is(
  (select count(*)::int from public.notification_channel_consents
   where profile_id = '00000000-0000-0000-0000-0000000000f3'
     and withdrawn_at is not null),
  1, 'retrait explicite enregistré');

-- Nouvelle écriture du numéro : le trigger ne doit PAS rallumer le consentement.
update public.profiles set whatsapp_phone = '237670000044'
 where id = '00000000-0000-0000-0000-0000000000f3';
select is(
  (select count(*)::int from public.notification_channel_consents
   where profile_id = '00000000-0000-0000-0000-0000000000f3'
     and withdrawn_at is null),
  0, 'le trigger ne rallume JAMAIS un consentement explicitement retiré');

insert into public.member_notifications (user_id, type, title, body)
values ('00000000-0000-0000-0000-0000000000f3', 'new_interest',
        'Nouvel intérêt', 'Un membre s''intéresse à votre profil.');
select is(
  (select count(*)::int from public.notification_deliveries
   where profile_id = '00000000-0000-0000-0000-0000000000f3'),
  0, 'après retrait : aucune livraison malgré un numéro présent');

select * from finish();

rollback;
