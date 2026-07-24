-- =============================================================================
-- pgTAP — V2 projection publique limitée de la vitrine des candidats.
-- Base jetable uniquement. Transaction unique + ROLLBACK.
-- =============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set search_path = extensions, public, pg_catalog;

create function public._csv_v2_direct_as(
  p_role text,
  p_sql text
)
returns text
language plpgsql
as $$
declare
  v_dummy text;
  v_state text := '';
begin
  case p_role
    when 'service_role' then set local role service_role;
    when 'authenticated' then set local role authenticated;
    when 'anon' then set local role anon;
    else raise exception 'unsupported test role';
  end case;

  execute p_sql into v_dummy;
  reset role;
  return v_state;
exception when others then
  v_state := sqlstate;
  reset role;
  return v_state;
end;
$$;

select set_config(
  'test.legacy_consents_before',
  (select count(*)::text from public.profile_share_consents),
  true
);
select set_config(
  'test.legacy_links_before',
  (select count(*)::text from public.profile_share_links),
  true
);

insert into auth.users(id, email) values
  ('00000000-0000-0000-a200-000000000001', 'v2-a@example.test'),
  ('00000000-0000-0000-b200-000000000002', 'v2-b@example.test'),
  ('00000000-0000-0000-c200-000000000003', 'v2-c@example.test'),
  ('00000000-0000-0000-d200-000000000004', 'v2-d@example.test'),
  ('00000000-0000-0000-e200-000000000005', 'v2-e@example.test'),
  ('00000000-0000-0000-f200-000000000006', 'v2-f@example.test'),
  ('00000000-0000-0000-7200-000000000007', 'v2-g@example.test');

insert into public.profiles(
  id, first_name, gender, birth_date, country, city, bio, blur_photos,
  verification_status, marital_status, partner_expectations,
  discovery_universe, account_status, profession, education_level, height_cm,
  origin_country, origin_city, region, marriage_goals,
  desired_partner_traits, polygamy_preference, children_intent,
  onboarding_completed_at, religion, suspended_at, suspended_by,
  suspension_reason
) values
  (
    '00000000-0000-0000-a200-000000000001',
    ' Aline ', 'femme', '1994-01-01', ' Cameroun ', ' Douala ',
    'Présentation publique fictive A.', false, 'approved', 'celibataire',
    'Attentes matrimoniales fictives A.', 'christian_marriage', 'active',
    'Ingénieure', 'master', 168, 'Cameroun', 'Bafoussam', 'Littoral',
    array['build_family','life_partner'], array['kindness','sincerity'],
    'no', 'wants_children', now(), 'christianisme', null, null, null
  ),
  (
    '00000000-0000-0000-b200-000000000002',
    'Boris', 'homme', '1990-01-01', 'Cameroun', 'Yaoundé',
    'Présentation publique fictive B.', false, 'approved', 'celibataire',
    'Attentes matrimoniales fictives B.', 'christian_marriage', 'suspended',
    'Comptable', 'bachelor', 178, 'Cameroun', 'Bertoua', 'Centre',
    array['build_family','stable_home'], array['kindness','family_oriented'],
    'no', 'wants_children', now(), 'christianisme', now(),
    '00000000-0000-0000-a200-000000000001',
    'Suspension fictive valide pour la suite de test.'
  ),
  (
    '00000000-0000-0000-c200-000000000003',
    'Carole', 'femme', '1992-01-01', 'Cameroun', 'Douala',
    'Présentation publique fictive C.', false, 'approved', 'celibataire',
    'Attentes matrimoniales fictives C.', 'open_marriage', 'active',
    'Enseignante', 'master', 165, 'Cameroun', 'Garoua', 'Littoral',
    array['life_partner','mutual_support'], array['sincerity','calm_mature'],
    'discuss', 'discuss', now(), 'sans_religion', null, null, null
  ),
  (
    '00000000-0000-0000-d200-000000000004',
    'David', 'homme', '1988-01-01', 'Cameroun', 'Douala',
    'Présentation publique fictive D.', true, 'approved', 'celibataire',
    'Attentes matrimoniales fictives D.', 'open_marriage', 'active',
    'Entrepreneur', 'bachelor', 180, 'Cameroun', 'Ebolowa', 'Littoral',
    array['stable_home','serenity'], array['kindness','sense_of_humor'],
    'no', 'has_children', now(), 'autre', null, null, null
  ),
  (
    '00000000-0000-0000-e200-000000000005',
    'Estelle', 'femme', '1995-01-01', 'Cameroun', 'Yaoundé',
    'Présentation publique fictive E.', false, 'approved', 'divorce',
    'Attentes matrimoniales fictives E.', 'islamic_marriage', 'active',
    'Médecin', 'doctorate', 170, 'Cameroun', 'Maroua', 'Centre',
    array['build_family','grow_together'], array['cultured','family_oriented'],
    'discuss', 'wants_children', now(), 'islam', null, null, null
  ),
  (
    '00000000-0000-0000-f200-000000000006',
    'Franck', 'homme', '1986-01-01', 'Cameroun', 'Buea',
    'Présentation publique fictive F.', false, 'approved', 'veuf',
    'Attentes matrimoniales fictives F.', 'open_marriage', 'active',
    'Architecte', 'master', 181, 'Cameroun', 'Buea', 'Sud-Ouest',
    array['stable_home','life_partner'], array['kindness','cultured'],
    'no', 'has_children', now(), 'autre', null, null, null
  ),
  (
    '00000000-0000-0000-7200-000000000007',
    'Grâce', 'femme', '1996-01-01', 'Cameroun', 'Yaoundé',
    repeat('B', 700), false, 'approved', 'separe', repeat('E', 700),
    'islamic_marriage', 'active', 'Juriste', 'master', 169,
    'Cameroun', 'Ngaoundéré', 'Centre',
    array['build_family','serenity'], array['sincerity','calm_mature'],
    'discuss', 'wants_children', now(), 'islam', null, null, null
  );

insert into public.photos(
  id, profile_id, storage_path, is_primary, mime_type, size_bytes
) values
  ('20000000-0000-0000-a200-000000000001',
   '00000000-0000-0000-a200-000000000001',
   '00000000-0000-0000-a200-000000000001/a.jpg', true, 'image/jpeg', 120000),
  ('20000000-0000-0000-b200-000000000002',
   '00000000-0000-0000-b200-000000000002',
   '00000000-0000-0000-b200-000000000002/b.jpg', true, 'image/jpeg', 120000),
  ('20000000-0000-0000-c200-000000000003',
   '00000000-0000-0000-c200-000000000003',
   '00000000-0000-0000-c200-000000000003/c.jpg', true, 'image/jpeg', 120000),
  ('20000000-0000-0000-d200-000000000004',
   '00000000-0000-0000-d200-000000000004',
   '00000000-0000-0000-d200-000000000004/d.jpg', true, 'image/jpeg', 120000),
  ('20000000-0000-0000-e200-000000000005',
   '00000000-0000-0000-e200-000000000005',
   '00000000-0000-0000-e200-000000000005/e.pdf', true, 'application/pdf', 120000),
  ('20000000-0000-0000-f200-000000000006',
   '00000000-0000-0000-f200-000000000006',
   '00000000-0000-0000-f200-000000000006/f.webp', true, 'image/webp', 120000),
  ('20000000-0000-0000-7200-000000000007',
   '00000000-0000-0000-7200-000000000007',
   '00000000-0000-0000-7200-000000000007/g.png', true, 'image/png', 130000);

insert into public.candidate_showcase_consents(
  id, profile_id, policy_version, consent_text, consented_at,
  withdrawn_at, withdrawn_by
) values
  ('30000000-0000-0000-a200-000000000001',
   '00000000-0000-0000-a200-000000000001', '2026-07-showcase-v1',
   repeat('A', 80), now() - interval '2 days', null, null),
  ('30000000-0000-0000-b200-000000000002',
   '00000000-0000-0000-b200-000000000002', '2026-07-showcase-v1',
   repeat('B', 80), now() - interval '2 days', null, null),
  ('30000000-0000-0000-c200-000000000003',
   '00000000-0000-0000-c200-000000000003', '2026-07-showcase-v1',
   repeat('C', 80), now() - interval '3 days', now() - interval '1 day',
   '00000000-0000-0000-c200-000000000003'),
  ('30000000-0000-0000-d200-000000000004',
   '00000000-0000-0000-d200-000000000004', '2026-07-showcase-v1',
   repeat('D', 80), now() - interval '2 days', null, null),
  ('30000000-0000-0000-e200-000000000005',
   '00000000-0000-0000-e200-000000000005', '2026-07-showcase-v1',
   repeat('E', 80), now() - interval '2 days', null, null),
  ('30000000-0000-0000-f200-000000000006',
   '00000000-0000-0000-f200-000000000006', '2026-07-showcase-v1',
   repeat('F', 80), now() - interval '2 days', null, null),
  ('30000000-0000-0000-7200-000000000007',
   '00000000-0000-0000-7200-000000000007', '2026-07-showcase-v1',
   repeat('G', 80), now() - interval '2 days', null, null);

insert into public.candidate_showcase_publications(
  id, profile_id, public_slug, selected_photo_id, listing_enabled,
  published_at, unpublished_at
) values
  ('40000000-0000-0000-a200-000000000001',
   '00000000-0000-0000-a200-000000000001', 'A000000000000000000000',
   '20000000-0000-0000-a200-000000000001', true,
   now() - interval '1 day', null),
  ('40000000-0000-0000-b200-000000000002',
   '00000000-0000-0000-b200-000000000002', 'B000000000000000000000',
   '20000000-0000-0000-b200-000000000002', true,
   now() - interval '1 day', null),
  ('40000000-0000-0000-c200-000000000003',
   '00000000-0000-0000-c200-000000000003', 'C000000000000000000000',
   '20000000-0000-0000-c200-000000000003', true,
   now() - interval '1 day', null),
  ('40000000-0000-0000-d200-000000000004',
   '00000000-0000-0000-d200-000000000004', 'D000000000000000000000',
   '20000000-0000-0000-d200-000000000004', true,
   now() - interval '1 day', null),
  ('40000000-0000-0000-e200-000000000005',
   '00000000-0000-0000-e200-000000000005', 'E000000000000000000000',
   '20000000-0000-0000-e200-000000000005', true,
   now() - interval '1 day', null),
  ('40000000-0000-0000-f200-000000000006',
   '00000000-0000-0000-f200-000000000006', 'F000000000000000000000',
   '20000000-0000-0000-f200-000000000006', false,
   now() - interval '2 days', now() - interval '1 day'),
  ('40000000-0000-0000-7200-000000000007',
   '00000000-0000-0000-7200-000000000007', 'G000000000000000000000',
   '20000000-0000-0000-7200-000000000007', true,
   now(), null);

select plan(58);

select has_function('public', 'list_public_candidate_showcases',
  array['integer','integer'], 'T1 — RPC de liste publique présente');
select has_function('public', 'get_public_candidate_showcase',
  array['text'], 'T2 — RPC de fiche publique présente');
select has_function('public', 'get_public_candidate_showcase_photo',
  array['text'], 'T3 — RPC photo serveur présente');
select has_function('public', 'list_public_candidate_showcase_sitemap',
  array[]::text[], 'T4 — RPC sitemap présente');

select is((
  select count(*)::int
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'list_public_candidate_showcases',
      'get_public_candidate_showcase',
      'get_public_candidate_showcase_photo',
      'list_public_candidate_showcase_sitemap'
    )
    and p.prosecdef
), 4, 'T5 — les quatre RPC sont SECURITY DEFINER');

select is((
  select count(*)::int
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'list_public_candidate_showcases',
      'get_public_candidate_showcase',
      'get_public_candidate_showcase_photo',
      'list_public_candidate_showcase_sitemap'
    )
    and p.provolatile = 's'
), 4, 'T6 — les quatre RPC sont STABLE');

select is((
  select count(*)::int
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'list_public_candidate_showcases',
      'get_public_candidate_showcase',
      'get_public_candidate_showcase_photo',
      'list_public_candidate_showcase_sitemap'
    )
    and p.proconfig = array['search_path=""']
), 4, 'T7 — search_path vide sur les quatre RPC');

select is((
  select count(*)::int
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'list_public_candidate_showcases',
      'get_public_candidate_showcase',
      'get_public_candidate_showcase_photo',
      'list_public_candidate_showcase_sitemap'
    )
    and has_function_privilege('service_role', p.oid, 'EXECUTE')
), 4, 'T8 — service_role exécute les quatre RPC');

select is((
  select count(*)::int
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'list_public_candidate_showcases',
      'get_public_candidate_showcase',
      'get_public_candidate_showcase_photo',
      'list_public_candidate_showcase_sitemap'
    )
    and has_function_privilege('anon', p.oid, 'EXECUTE')
), 0, 'T9 — anon n’exécute aucune RPC V2');

select is((
  select count(*)::int
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'list_public_candidate_showcases',
      'get_public_candidate_showcase',
      'get_public_candidate_showcase_photo',
      'list_public_candidate_showcase_sitemap'
    )
    and has_function_privilege('authenticated', p.oid, 'EXECUTE')
), 0, 'T10 — authenticated n’exécute aucune RPC V2');

select is((
  select count(*)::int
  from information_schema.routine_privileges
  where specific_schema = 'public'
    and routine_name in (
      'list_public_candidate_showcases',
      'get_public_candidate_showcase',
      'get_public_candidate_showcase_photo',
      'list_public_candidate_showcase_sitemap'
    )
    and grantee = 'PUBLIC'
), 0, 'T11 — PUBLIC n’a aucun EXECUTE V2');

select ok(
  pg_get_function_result(
    'public.get_public_candidate_showcase(text)'::regprocedure
  ) not like '%uuid%',
  'T12 — la fiche publique ne retourne aucun UUID'
);
select ok(
  pg_get_function_result(
    'public.get_public_candidate_showcase(text)'::regprocedure
  ) not like '%birth_date%',
  'T13 — la fiche publique ne retourne pas la date de naissance'
);
select ok(
  pg_get_function_result(
    'public.get_public_candidate_showcase(text)'::regprocedure
  ) not like '%religion%',
  'T14 — la fiche publique ne retourne pas la religion déclarée'
);
select ok(
  pg_get_function_result(
    'public.list_public_candidate_showcases(integer,integer)'::regprocedure
  ) not like '%storage_path%',
  'T15 — la liste publique ne retourne aucun chemin Storage'
);
select ok(
  pg_get_function_result(
    'public.get_public_candidate_showcase_photo(text)'::regprocedure
  ) like '%storage_path%',
  'T16 — le chemin Storage existe uniquement dans la RPC photo serveur'
);

select is(public._csv_v2_direct_as(
  'service_role',
  'select count(*)::text from public.list_public_candidate_showcases(24, 0)'
), '', 'T17 — service_role appelle la liste V2');
select is(public._csv_v2_direct_as(
  'authenticated',
  'select count(*)::text from public.list_public_candidate_showcases(24, 0)'
), '42501', 'T18 — authenticated est refusé sur la liste V2');
select is(public._csv_v2_direct_as(
  'anon',
  'select count(*)::text from public.get_public_candidate_showcase(''A000000000000000000000'')'
), '42501', 'T19 — anon est refusé sur la fiche V2');
select is(public._csv_v2_direct_as(
  'service_role',
  'select id::text from public.candidate_showcase_publications limit 1'
), '42501', 'T20 — service_role conserve zéro lecture directe des tables V1');

select is((select count(*)::int from public.list_public_candidate_showcases(24, 0)),
  2, 'T21 — seules les deux publications effectivement publiques sont listées');
select results_eq(
  $$select public_slug from public.list_public_candidate_showcases(24, 0)$$,
  $$values ('G000000000000000000000'::text),
           ('A000000000000000000000'::text)$$,
  'T22 — ordre déterministe par publication décroissante');
select is((select count(*)::int from public.list_public_candidate_showcases(1, 0)),
  1, 'T23 — la limite demandée est respectée');
select is((select count(*)::int from public.list_public_candidate_showcases(0, 0)),
  1, 'T24 — une limite nulle ou trop basse est bornée à un');
select is((select public_slug from public.list_public_candidate_showcases(24, 1) limit 1),
  'A000000000000000000000', 'T25 — offset appliqué de façon déterministe');

select is((select count(*)::int
  from public.get_public_candidate_showcase('A000000000000000000000')),
  1, 'T26 — la fiche A est résolue');
select is((select first_name
  from public.get_public_candidate_showcase('A000000000000000000000')),
  'Aline', 'T27 — prénom public normalisé par btrim');
select ok((select age between 18 and 120
  from public.get_public_candidate_showcase('A000000000000000000000')),
  'T28 — âge calculé sans exposer birth_date');
select is((select city
  from public.get_public_candidate_showcase('A000000000000000000000')),
  'Douala', 'T29 — ville publique normalisée');
select is((select country
  from public.get_public_candidate_showcase('A000000000000000000000')),
  'Cameroun', 'T30 — pays public normalisé');
select is((select discovery_universe
  from public.get_public_candidate_showcase('A000000000000000000000')),
  'christian_marriage', 'T31 — univers matrimonial exposé explicitement');
select is((select marital_status
  from public.get_public_candidate_showcase('A000000000000000000000')),
  'celibataire', 'T32 — situation matrimoniale exposée explicitement');
select is((select char_length(bio)
  from public.get_public_candidate_showcase('G000000000000000000000')),
  600, 'T33 — biographie publique bornée à 600 caractères');
select is((select char_length(partner_expectations)
  from public.get_public_candidate_showcase('G000000000000000000000')),
  600, 'T34 — attentes publiques bornées à 600 caractères');

select is((select count(*)::int from public.get_public_candidate_showcase('court')),
  0, 'T35 — slug de forme invalide rejeté uniformément');
select is((select count(*)::int
  from public.get_public_candidate_showcase('Z000000000000000000000')),
  0, 'T36 — slug inconnu rejeté uniformément');
select is((select count(*)::int
  from public.get_public_candidate_showcase('B000000000000000000000')),
  0, 'T37 — compte suspendu absent de la fiche publique');
select is((select count(*)::int
  from public.get_public_candidate_showcase('C000000000000000000000')),
  0, 'T38 — consentement retiré absent de la fiche publique');
select is((select count(*)::int
  from public.get_public_candidate_showcase('D000000000000000000000')),
  0, 'T39 — floutage activé absent de la fiche publique');
select is((select count(*)::int
  from public.get_public_candidate_showcase('E000000000000000000000')),
  0, 'T40 — photo invalide absente de la fiche publique');
select is((select count(*)::int
  from public.get_public_candidate_showcase('F000000000000000000000')),
  0, 'T41 — publication désactivée absente de la fiche publique');

select is((select count(*)::int
  from public.get_public_candidate_showcase_photo('A000000000000000000000')),
  1, 'T42 — métadonnées photo A résolues côté serveur');
select is((select storage_path
  from public.get_public_candidate_showcase_photo('A000000000000000000000')),
  '00000000-0000-0000-a200-000000000001/a.jpg',
  'T43 — chemin photo exact disponible uniquement côté serveur');
select is((select mime_type
  from public.get_public_candidate_showcase_photo('A000000000000000000000')),
  'image/jpeg', 'T44 — type MIME photo contrôlé');
select is((select size_bytes::bigint
  from public.get_public_candidate_showcase_photo('A000000000000000000000')),
  120000::bigint, 'T45 — taille photo contrôlée');
select is((select count(*)::int
  from public.get_public_candidate_showcase_photo('B000000000000000000000')),
  0, 'T46 — aucune photo servie pour un compte suspendu');
select is((select count(*)::int
  from public.get_public_candidate_showcase_photo('court')),
  0, 'T47 — aucune photo servie pour un slug invalide');

select is((select count(*)::int
  from public.list_public_candidate_showcase_sitemap()),
  2, 'T48 — sitemap contient uniquement les deux fiches publiques');
select results_eq(
  $$select public_slug from public.list_public_candidate_showcase_sitemap()$$,
  $$values ('A000000000000000000000'::text),
           ('G000000000000000000000'::text)$$,
  'T49 — sitemap ordonné et limité aux slugs publics');
select ok((select bool_and(last_modified is not null)
  from public.list_public_candidate_showcase_sitemap()),
  'T50 — chaque entrée sitemap possède un last_modified fiable');

update public.profiles
set account_status = 'suspended',
    suspended_at = now(),
    suspended_by = '00000000-0000-0000-7200-000000000007',
    suspension_reason = 'Suspension immédiate fictive A pour test V2.'
where id = '00000000-0000-0000-a200-000000000001';

select is((select count(*)::int from public.list_public_candidate_showcases(24, 0)),
  1, 'T51 — suspension retire immédiatement A de la liste');
select is((select count(*)::int
  from public.get_public_candidate_showcase('A000000000000000000000')),
  0, 'T52 — suspension rend immédiatement la fiche A introuvable');
select is((select count(*)::int
  from public.get_public_candidate_showcase_photo('A000000000000000000000')),
  0, 'T53 — suspension rend immédiatement la photo A introuvable');
select is((select count(*)::int
  from public.list_public_candidate_showcase_sitemap()
  where public_slug = 'A000000000000000000000'),
  0, 'T54 — suspension retire immédiatement A du sitemap');

update public.profiles
set account_status = 'active',
    suspended_at = null,
    suspended_by = null,
    suspension_reason = null
where id = '00000000-0000-0000-a200-000000000001';

update public.candidate_showcase_consents
set withdrawn_at = now(),
    withdrawn_by = '00000000-0000-0000-a200-000000000001'
where profile_id = '00000000-0000-0000-a200-000000000001'
  and withdrawn_at is null;

select is((select count(*)::int
  from public.get_public_candidate_showcase('A000000000000000000000')),
  0, 'T55 — retrait de consentement rend immédiatement A introuvable');
select is((select count(*)::int
  from public.list_public_candidate_showcase_sitemap()
  where public_slug = 'A000000000000000000000'),
  0, 'T56 — retrait de consentement retire immédiatement A du sitemap');

select ok(
  current_setting('test.legacy_consents_before', true)::int
    = (select count(*) from public.profile_share_consents)
  and current_setting('test.legacy_links_before', true)::int
    = (select count(*) from public.profile_share_links),
  'T57 — partage limité historique strictement inchangé'
);

select is((select count(*)::int
  from public.candidate_showcase_publication_events),
  0, 'T58 — les lectures V2 ne créent aucun événement ni aucune écriture');

select * from finish();
rollback;
