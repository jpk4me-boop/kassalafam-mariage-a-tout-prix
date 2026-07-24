-- =============================================================================
-- pgTAP — V1 backend de consentement et publication de la vitrine publique.
-- Base jetable uniquement. Transaction unique + ROLLBACK.
-- =============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set search_path = extensions, public, pg_catalog;

create function public._csv_clear_results()
returns void
language plpgsql
as $$
begin
  perform set_config('test.state', '', true);
  perform set_config('test.error', '', true);
  perform set_config('test.id', '', true);
  perform set_config('test.slug', '', true);
  perform set_config('test.photo_id', '', true);
  perform set_config('test.policy', '', true);
  perform set_config('test.published_at', '', true);
  perform set_config('test.bool1', '', true);
  perform set_config('test.bool2', '', true);
  perform set_config('test.reason', '', true);
end;
$$;

create function public._csv_call(
  p_uid uuid,
  p_action text,
  p_photo_id uuid default null
)
returns void
language plpgsql
as $$
declare
  v_id uuid;
  v_slug text;
  v_photo uuid;
  v_policy text;
  v_published timestamptz;
  v_bool1 boolean;
  v_bool2 boolean;
  v_reason text;
begin
  perform public._csv_clear_results();

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text,
    true
  );

  case p_action
    when 'grant' then
      select consent_id, policy_version, was_already_active
      into v_id, v_policy, v_bool1
      from public.grant_my_candidate_showcase_consent();

    when 'publish' then
      select publication_id, public_slug, photo_id, published_at,
             was_already_published
      into v_id, v_slug, v_photo, v_published, v_bool1
      from public.publish_my_candidate_showcase(p_photo_id);

    when 'unpublish' then
      v_bool1 := public.unpublish_my_candidate_showcase();

    when 'withdraw' then
      select consent_withdrawn, listing_unpublished
      into v_bool1, v_bool2
      from public.withdraw_my_candidate_showcase_consent();

    when 'status' then
      select publication_id, public_slug, selected_photo_id,
             consent_policy_version, consent_active, listing_enabled,
             eligibility_reason
      into v_id, v_slug, v_photo, v_policy, v_bool1, v_bool2, v_reason
      from public.get_my_candidate_showcase_status();

      perform set_config(
        'test.effective',
        coalesce((
          select effectively_public::text
          from public.get_my_candidate_showcase_status()
        ), ''),
        true
      );

    when 'delete_photo' then
      delete from public.photos ph
      where ph.id = p_photo_id;

    else
      raise exception 'unknown test action';
  end case;

  reset role;
  perform set_config('request.jwt.claims', '', true);

  perform set_config('test.id', coalesce(v_id::text, ''), true);
  perform set_config('test.slug', coalesce(v_slug, ''), true);
  perform set_config('test.photo_id', coalesce(v_photo::text, ''), true);
  perform set_config('test.policy', coalesce(v_policy, ''), true);
  perform set_config('test.published_at', coalesce(v_published::text, ''), true);
  perform set_config('test.bool1', coalesce(v_bool1::text, ''), true);
  perform set_config('test.bool2', coalesce(v_bool2::text, ''), true);
  perform set_config('test.reason', coalesce(v_reason, ''), true);
exception when others then
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform public._csv_clear_results();
  perform set_config('test.state', sqlstate, true);
  perform set_config('test.error', sqlerrm, true);
end;
$$;

create function public._csv_direct_as(
  p_uid uuid,
  p_sql text
)
returns text
language plpgsql
as $$
declare
  v_dummy text;
  v_state text := '';
begin
  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text,
    true
  );

  execute p_sql into v_dummy;

  reset role;
  perform set_config('request.jwt.claims', '', true);
  return v_state;
exception when others then
  v_state := sqlstate;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return v_state;
end;
$$;

insert into auth.users(id, email) values
  ('00000000-0000-0000-a100-000000000001', 'showcase-a@example.test'),
  ('00000000-0000-0000-b100-000000000002', 'showcase-b@example.test'),
  ('00000000-0000-0000-c100-000000000003', 'showcase-c@example.test'),
  ('00000000-0000-0000-d100-000000000004', 'showcase-d@example.test'),
  ('00000000-0000-0000-e100-000000000005', 'showcase-e@example.test');

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
    '00000000-0000-0000-a100-000000000001',
    'Aline', 'femme', '1994-01-01', 'Cameroun', 'Douala',
    'Présentation publique fictive A.', false, 'approved', 'celibataire',
    'Attentes matrimoniales fictives A.', 'christian_marriage', 'active',
    'Ingénieure', 'master', 168, 'Cameroun', 'Bafoussam', 'Littoral',
    array['build_family','life_partner'],
    array['kindness','sincerity'],
    'no', 'wants_children', now(), 'christianisme',
    null, null, null
  ),
  (
    '00000000-0000-0000-b100-000000000002',
    'Boris', 'homme', '1990-01-01', 'Cameroun', 'Yaoundé',
    'Présentation publique fictive B.', false, 'approved', 'celibataire',
    'Attentes matrimoniales fictives B.', 'christian_marriage', 'suspended',
    'Comptable', 'bachelor', 178, 'Cameroun', 'Bertoua', 'Centre',
    array['build_family','stable_home'],
    array['kindness','family_oriented'],
    'no', 'wants_children', now(), 'christianisme',
    now(), '00000000-0000-0000-a100-000000000001',
    'Suspension fictive valide pour la suite de test.'
  ),
  (
    '00000000-0000-0000-c100-000000000003',
    'Carole', 'femme', '1992-01-01', 'Cameroun', 'Douala',
    'Présentation publique fictive C.', true, 'approved', 'celibataire',
    'Attentes matrimoniales fictives C.', 'open_marriage', 'active',
    'Enseignante', 'master', 165, 'Cameroun', 'Garoua', 'Littoral',
    array['life_partner','mutual_support'],
    array['sincerity','calm_mature'],
    'discuss', 'discuss', now(), 'sans_religion',
    null, null, null
  ),
  (
    '00000000-0000-0000-d100-000000000004',
    'David', 'homme', '1988-01-01', 'Cameroun', 'Douala',
    'Présentation publique fictive D.', false, 'approved', 'celibataire',
    'Attentes matrimoniales fictives D.', 'open_marriage', 'active',
    'Entrepreneur', 'bachelor', 180, 'Cameroun', 'Ebolowa', 'Littoral',
    array['stable_home','serenity'],
    array['kindness','sense_of_humor'],
    'no', 'has_children', null, 'autre',
    null, null, null
  ),
  (
    '00000000-0000-0000-e100-000000000005',
    'Estelle', 'femme', '1995-01-01', 'Cameroun', 'Yaoundé',
    'Présentation publique fictive E.', false, 'approved', 'divorce',
    'Attentes matrimoniales fictives E.', 'islamic_marriage', 'active',
    'Médecin', 'doctorate', 170, 'Cameroun', 'Maroua', 'Centre',
    array['build_family','grow_together'],
    array['cultured','family_oriented'],
    'discuss', 'wants_children', now(), 'islam',
    null, null, null
  );

insert into public.photos(
  id, profile_id, storage_path, is_primary, mime_type, size_bytes
) values
  (
    '10000000-0000-0000-a100-000000000001',
    '00000000-0000-0000-a100-000000000001',
    '00000000-0000-0000-a100-000000000001/a1.jpg',
    true, 'image/jpeg', 120000
  ),
  (
    '10000000-0000-0000-a100-000000000002',
    '00000000-0000-0000-a100-000000000001',
    '00000000-0000-0000-a100-000000000001/a2.webp',
    false, 'image/webp', 130000
  ),
  (
    '10000000-0000-0000-b100-000000000001',
    '00000000-0000-0000-b100-000000000002',
    '00000000-0000-0000-b100-000000000002/b1.jpg',
    true, 'image/jpeg', 120000
  ),
  (
    '10000000-0000-0000-c100-000000000001',
    '00000000-0000-0000-c100-000000000003',
    '00000000-0000-0000-c100-000000000003/c1.jpg',
    true, 'image/jpeg', 120000
  ),
  (
    '10000000-0000-0000-d100-000000000001',
    '00000000-0000-0000-d100-000000000004',
    '00000000-0000-0000-d100-000000000004/d1.jpg',
    true, 'image/jpeg', 120000
  ),
  (
    '10000000-0000-0000-e100-000000000001',
    '00000000-0000-0000-e100-000000000005',
    '00000000-0000-0000-e100-000000000005/e1.png',
    true, 'image/png', 120000
  );

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

select plan(112);

select has_table('public', 'candidate_showcase_consents',
  'T1 — table des consentements vitrine présente');
select has_table('public', 'candidate_showcase_publications',
  'T2 — table des publications vitrine présente');
select has_table('public', 'candidate_showcase_publication_events',
  'T3 — table des événements vitrine présente');

select ok((select relrowsecurity from pg_class
  where oid = 'public.candidate_showcase_consents'::regclass),
  'T4 — RLS active sur les consentements');
select ok((select relrowsecurity from pg_class
  where oid = 'public.candidate_showcase_publications'::regclass),
  'T5 — RLS active sur les publications');
select ok((select relrowsecurity from pg_class
  where oid = 'public.candidate_showcase_publication_events'::regclass),
  'T6 — RLS active sur les événements');

select is((
  select count(*)::int from pg_policies
  where schemaname = 'public'
    and tablename in (
      'candidate_showcase_consents',
      'candidate_showcase_publications',
      'candidate_showcase_publication_events'
    )
), 0, 'T7 — aucune policy client sur les trois tables');

select is((
  select count(*)::int from information_schema.table_privileges
  where table_schema = 'public'
    and table_name in (
      'candidate_showcase_consents',
      'candidate_showcase_publications',
      'candidate_showcase_publication_events'
    )
    and grantee in ('PUBLIC', 'anon', 'authenticated')
), 0, 'T8 — aucun privilège direct pour PUBLIC, anon ou authenticated');

select is((
  select count(*)::int from information_schema.table_privileges
  where table_schema = 'public'
    and table_name in (
      'candidate_showcase_consents',
      'candidate_showcase_publications',
      'candidate_showcase_publication_events'
    )
    and grantee = 'service_role'
), 0, 'T9 — aucun privilège direct pour service_role');

select has_index('public', 'candidate_showcase_consents',
  'candidate_showcase_consents_one_active',
  'T10 — unicité partielle du consentement actif');
select has_index('public', 'candidate_showcase_consents',
  'candidate_showcase_consents_profile_history',
  'T11 — index historique des consentements');
select has_index('public', 'candidate_showcase_publications',
  'candidate_showcase_publications_enabled',
  'T12 — index des publications activées');
select has_index('public', 'candidate_showcase_publication_events',
  'candidate_showcase_events_profile_history',
  'T13 — index historique des événements');

select has_trigger('public', 'candidate_showcase_publications',
  'trg_candidate_showcase_publications_updated_at',
  'T14 — trigger updated_at des publications');
select has_trigger('public', 'candidate_showcase_publication_events',
  'trg_candidate_showcase_events_no_mutation',
  'T15 — trigger append-only des événements');
select has_trigger('public', 'photos',
  'trg_candidate_showcase_photo_mutation',
  'T16 — trigger de protection de la photo sélectionnée');

select has_function('public', 'candidate_showcase_events_no_mutation',
  array[]::text[], 'T17 — fonction append-only présente');
select has_function('public', 'candidate_showcase_eligibility_reason',
  array['uuid','uuid'], 'T18 — helper d’éligibilité présent');
select has_function('public', 'grant_my_candidate_showcase_consent',
  array[]::text[], 'T19 — RPC de consentement présente');
select has_function('public', 'publish_my_candidate_showcase',
  array['uuid'], 'T20 — RPC de publication présente');
select has_function('public', 'unpublish_my_candidate_showcase',
  array[]::text[], 'T21 — RPC de dépublication présente');
select has_function('public', 'withdraw_my_candidate_showcase_consent',
  array[]::text[], 'T22 — RPC de retrait présente');
select has_function('public', 'get_my_candidate_showcase_status',
  array[]::text[], 'T23 — RPC de statut présente');
select has_function('public', 'candidate_showcase_handle_photo_mutation',
  array[]::text[], 'T24 — fonction de garde photo présente');

select is((
  select count(*)::int from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'grant_my_candidate_showcase_consent',
      'publish_my_candidate_showcase',
      'unpublish_my_candidate_showcase',
      'withdraw_my_candidate_showcase_consent',
      'get_my_candidate_showcase_status'
    )
    and has_function_privilege('authenticated', p.oid, 'EXECUTE')
), 5, 'T25 — authenticated exécute exactement les cinq RPC membre');

select is((
  select count(*)::int from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname like '%candidate_showcase%'
    and has_function_privilege('anon', p.oid, 'EXECUTE')
), 0, 'T26 — anon n’exécute aucune fonction V1');

select is((
  select count(*)::int from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname like '%candidate_showcase%'
    and has_function_privilege('service_role', p.oid, 'EXECUTE')
), 0, 'T27 — service_role n’exécute aucune fonction V1');

select is((select count(*)::int from public.candidate_showcase_consents),
  0, 'T28 — aucun consentement créé automatiquement');
select is((select count(*)::int from public.candidate_showcase_publications),
  0, 'T29 — aucune publication créée automatiquement');
select is((select count(*)::int
  from public.candidate_showcase_publication_events),
  0, 'T30 — aucun événement créé automatiquement');

select is(public._csv_direct_as(
  '00000000-0000-0000-a100-000000000001',
  $sql$
    insert into public.candidate_showcase_consents(
      profile_id, policy_version, consent_text
    ) values (
      '00000000-0000-0000-a100-000000000001',
      'forbidden', repeat('x', 50)
    ) returning id::text
  $sql$
), '42501', 'T31 — INSERT direct du consentement refusé');

select is(public._csv_direct_as(
  '00000000-0000-0000-a100-000000000001',
  $sql$
    select id::text from public.candidate_showcase_publications limit 1
  $sql$
), '42501', 'T32 — SELECT direct des publications refusé');

select public._csv_call(
  '00000000-0000-0000-a100-000000000001', 'grant');
select is(current_setting('test.state', true), '',
  'T33 — consentement A réussi');
select isnt(current_setting('test.id', true), '',
  'T34 — consentement A retourne un identifiant');
select is(current_setting('test.policy', true), '2026-07-showcase-v1',
  'T35 — version officielle du consentement imposée');
select is((select count(*)::int
  from public.candidate_showcase_consents
  where profile_id = '00000000-0000-0000-a100-000000000001'
    and withdrawn_at is null), 1,
  'T36 — un consentement actif pour A');
select ok((select consent_text ilike '%indexée par les moteurs de recherche%'
  from public.candidate_showcase_consents
  where profile_id = '00000000-0000-0000-a100-000000000001'
    and withdrawn_at is null),
  'T37 — le texte informe explicitement de l’indexation');

select public._csv_call(
  '00000000-0000-0000-a100-000000000001', 'grant');
select is(current_setting('test.state', true), '',
  'T38 — second consentement A idempotent');
select is(current_setting('test.bool1', true), 'true',
  'T39 — second consentement signalé comme déjà actif');
select is((select count(*)::int
  from public.candidate_showcase_consents
  where profile_id = '00000000-0000-0000-a100-000000000001'
    and withdrawn_at is null), 1,
  'T40 — aucun doublon de consentement actif');

select public._csv_call(
  '00000000-0000-0000-a100-000000000001', 'status');
select is(current_setting('test.bool1', true), 'true',
  'T41 — statut A indique le consentement actif');
select is(current_setting('test.bool2', true), 'false',
  'T42 — statut A indique la publication désactivée');
select is(current_setting('test.effective', true), 'false',
  'T43 — A n’est pas effectivement public');
select is(current_setting('test.reason', true), 'photo_required',
  'T44 — le statut demande une photo avant publication');

select public._csv_call(
  '00000000-0000-0000-a100-000000000001', 'publish', null);
select is(current_setting('test.state', true), '',
  'T45 — publication A avec photo principale réussie');
select is(current_setting('test.photo_id', true),
  '10000000-0000-0000-a100-000000000001',
  'T46 — NULL sélectionne la photo principale A1');
select matches(current_setting('test.slug', true),
  '^[A-Za-z0-9_-]{22}$',
  'T47 — slug public opaque de 22 caractères');
select is(current_setting('test.bool1', true), 'false',
  'T48 — première publication non idempotente');
select is((select count(*)::int
  from public.candidate_showcase_publication_events
  where profile_id = '00000000-0000-0000-a100-000000000001'
    and action_type = 'published'), 1,
  'T49 — événement de première publication créé');

select set_config('test.first_slug',
  current_setting('test.slug', true), true);
select set_config('test.first_published_at',
  current_setting('test.published_at', true), true);

select public._csv_call(
  '00000000-0000-0000-a100-000000000001', 'publish', null);
select is(current_setting('test.state', true), '',
  'T50 — republication identique réussie');
select is(current_setting('test.bool1', true), 'true',
  'T51 — republication identique reconnue');
select is((select count(*)::int
  from public.candidate_showcase_publication_events
  where profile_id = '00000000-0000-0000-a100-000000000001'
    and action_type = 'published'), 1,
  'T52 — aucun événement dupliqué lors de l’idempotence');

select public._csv_call(
  '00000000-0000-0000-a100-000000000001', 'publish',
  '10000000-0000-0000-a100-000000000002');
select is(current_setting('test.state', true), '',
  'T53 — changement vers la photo A2 réussi');
select is(current_setting('test.photo_id', true),
  '10000000-0000-0000-a100-000000000002',
  'T54 — A2 devient la photo publique');
select is(current_setting('test.bool1', true), 'false',
  'T55 — changement de photo non idempotent');
select is((select count(*)::int
  from public.candidate_showcase_publication_events
  where profile_id = '00000000-0000-0000-a100-000000000001'
    and action_type = 'photo_changed'), 1,
  'T56 — changement de photo audité');
select is(current_setting('test.published_at', true),
  current_setting('test.first_published_at', true),
  'T57 — changement de photo conserve la date de publication');

select public._csv_call(
  '00000000-0000-0000-a100-000000000001', 'unpublish');
select is(current_setting('test.state', true), '',
  'T58 — dépublication A réussie');
select is(current_setting('test.bool1', true), 'true',
  'T59 — première dépublication retourne true');
select is((select listing_enabled
  from public.candidate_showcase_publications
  where profile_id = '00000000-0000-0000-a100-000000000001'),
  false, 'T60 — publication A désactivée');
select ok((select unpublished_at is not null
  from public.candidate_showcase_publications
  where profile_id = '00000000-0000-0000-a100-000000000001'),
  'T61 — date de dépublication renseignée');
select is((select count(*)::int
  from public.candidate_showcase_publication_events
  where profile_id = '00000000-0000-0000-a100-000000000001'
    and action_type = 'unpublished'), 1,
  'T62 — dépublication auditée');

select public._csv_call(
  '00000000-0000-0000-a100-000000000001', 'unpublish');
select is(current_setting('test.bool1', true), 'false',
  'T63 — seconde dépublication idempotente');
select is((select count(*)::int
  from public.candidate_showcase_publication_events
  where profile_id = '00000000-0000-0000-a100-000000000001'
    and action_type = 'unpublished'), 1,
  'T64 — aucune duplication d’événement de dépublication');

select public._csv_call(
  '00000000-0000-0000-a100-000000000001', 'publish',
  '10000000-0000-0000-a100-000000000002');
select is(current_setting('test.state', true), '',
  'T65 — republication A réussie');
select is(current_setting('test.slug', true),
  current_setting('test.first_slug', true),
  'T66 — le slug reste stable après dépublication');
select is((select listing_enabled
  from public.candidate_showcase_publications
  where profile_id = '00000000-0000-0000-a100-000000000001'),
  true, 'T67 — publication A réactivée');
select is((select count(*)::int
  from public.candidate_showcase_publication_events
  where profile_id = '00000000-0000-0000-a100-000000000001'
    and action_type = 'published'), 2,
  'T68 — republication auditée une seule fois');

select public._csv_call(
  '00000000-0000-0000-a100-000000000001', 'withdraw');
select is(current_setting('test.state', true), '',
  'T69 — retrait du consentement A réussi');
select is(current_setting('test.bool1', true), 'true',
  'T70 — consentement A retiré');
select is(current_setting('test.bool2', true), 'true',
  'T71 — publication A dépubliée atomiquement');
select is((select count(*)::int
  from public.candidate_showcase_consents
  where profile_id = '00000000-0000-0000-a100-000000000001'
    and withdrawn_at is null), 0,
  'T72 — plus aucun consentement actif A');
select is((select listing_enabled
  from public.candidate_showcase_publications
  where profile_id = '00000000-0000-0000-a100-000000000001'),
  false, 'T73 — publication A désactivée par le retrait');
select is((select count(*)::int
  from public.candidate_showcase_publication_events
  where profile_id = '00000000-0000-0000-a100-000000000001'
    and action_type = 'consent_withdrawn'), 1,
  'T74 — retrait de consentement audité');

select public._csv_call(
  '00000000-0000-0000-a100-000000000001', 'withdraw');
select is(current_setting('test.bool1', true), 'false',
  'T75 — second retrait sans consentement retourne false');
select is(current_setting('test.bool2', true), 'false',
  'T76 — second retrait sans publication retourne false');
select is((select count(*)::int
  from public.candidate_showcase_publication_events
  where profile_id = '00000000-0000-0000-a100-000000000001'
    and action_type = 'consent_withdrawn'), 1,
  'T77 — aucun doublon d’audit au second retrait');

select public._csv_call(
  '00000000-0000-0000-a100-000000000001', 'publish',
  '10000000-0000-0000-a100-000000000002');
select is(current_setting('test.state', true), '22023',
  'T78 — publication sans consentement refusée');
select is(current_setting('test.error', true), 'SHOWCASE_CONSENT_REQUIRED',
  'T79 — erreur stable de consentement requis');

select public._csv_call(
  '00000000-0000-0000-a100-000000000001', 'grant');
select is(current_setting('test.state', true), '',
  'T80 — nouveau consentement A réussi');
select is((select count(*)::int
  from public.candidate_showcase_consents
  where profile_id = '00000000-0000-0000-a100-000000000001'
    and withdrawn_at is null), 1,
  'T81 — exactement un nouveau consentement actif');
select is((select count(*)::int
  from public.candidate_showcase_consents
  where profile_id = '00000000-0000-0000-a100-000000000001'),
  2, 'T82 — historique des deux consentements conservé');

select public._csv_call(
  '00000000-0000-0000-a100-000000000001', 'publish',
  '10000000-0000-0000-a100-000000000002');
select is(current_setting('test.state', true), '',
  'T83 — publication après nouveau consentement réussie');
select is(current_setting('test.slug', true),
  current_setting('test.first_slug', true),
  'T84 — le slug stable n’est pas régénéré');

select public._csv_call(
  '00000000-0000-0000-b100-000000000002', 'grant');
select is(current_setting('test.state', true), '42501',
  'T85 — consentement d’un compte suspendu refusé');
select is(current_setting('test.error', true), 'ACCOUNT_SUSPENDED',
  'T86 — erreur stable de suspension');

select public._csv_call(
  '00000000-0000-0000-c100-000000000003', 'grant');
select is(current_setting('test.state', true), '',
  'T87 — consentement C accepté indépendamment de l’éligibilité');
select public._csv_call(
  '00000000-0000-0000-c100-000000000003', 'publish', null);
select is(current_setting('test.state', true), '22023',
  'T88 — publication avec photos masquées refusée');
select is(current_setting('test.error', true),
  'SHOWCASE_PHOTO_PRIVACY_ENABLED',
  'T89 — erreur stable de confidentialité photo');

select public._csv_call(
  '00000000-0000-0000-d100-000000000004', 'grant');
select is(current_setting('test.state', true), '',
  'T90 — consentement D accepté avant complétude');
select public._csv_call(
  '00000000-0000-0000-d100-000000000004', 'publish', null);
select is(current_setting('test.state', true), '22023',
  'T91 — profil sans onboarding finalisé refusé');
select is(current_setting('test.error', true),
  'SHOWCASE_PROFILE_NOT_ELIGIBLE',
  'T92 — erreur stable de profil non éligible');

select public._csv_call(
  '00000000-0000-0000-e100-000000000005', 'grant');
select is(current_setting('test.state', true), '',
  'T93 — consentement E réussi');

select public._csv_call(
  '00000000-0000-0000-a100-000000000001', 'publish',
  '10000000-0000-0000-e100-000000000001');
select is(current_setting('test.state', true), '22023',
  'T94 — photo d’un autre profil refusée');
select is(current_setting('test.error', true), 'SHOWCASE_PHOTO_INVALID',
  'T95 — erreur stable de photo invalide');

select public._csv_call(
  '00000000-0000-0000-a100-000000000001', 'status');
select is(current_setting('test.bool1', true), 'true',
  'T96 — statut A conserve le consentement actif');
select is(current_setting('test.bool2', true), 'true',
  'T97 — statut A indique la publication demandée');
select is(current_setting('test.effective', true), 'true',
  'T98 — A est effectivement public avant invalidation');
select is(current_setting('test.reason', true), 'eligible',
  'T99 — diagnostic A éligible');

select public._csv_call(
  '00000000-0000-0000-a100-000000000001', 'delete_photo',
  '10000000-0000-0000-a100-000000000002');
select is(current_setting('test.state', true), '',
  'T100 — suppression de la photo sélectionnée réussie');
select is((select count(*)::int from public.photos
  where id = '10000000-0000-0000-a100-000000000002'),
  0, 'T101 — photo A2 supprimée');
select is((select listing_enabled
  from public.candidate_showcase_publications
  where profile_id = '00000000-0000-0000-a100-000000000001'),
  false, 'T102 — suppression de photo dépublie A');
select is((select selected_photo_id
  from public.candidate_showcase_publications
  where profile_id = '00000000-0000-0000-a100-000000000001'),
  null::uuid, 'T103 — sélection photo effacée');
select is((select count(*)::int
  from public.candidate_showcase_publication_events
  where profile_id = '00000000-0000-0000-a100-000000000001'
    and action_type = 'photo_invalidated'), 1,
  'T104 — invalidation de photo auditée');

select public._csv_call(
  '00000000-0000-0000-a100-000000000001', 'status');
select is(current_setting('test.effective', true), 'false',
  'T105 — A n’est plus effectivement public');
select is(current_setting('test.reason', true), 'photo_required',
  'T106 — statut A exige une nouvelle photo');

select throws_ok(
  $sql$
    update public.candidate_showcase_publication_events
    set reason = 'Modification interdite.'
    where profile_id = '00000000-0000-0000-a100-000000000001'
  $sql$,
  '42501',
  'CANDIDATE_SHOWCASE_EVENTS_APPEND_ONLY',
  'T107 — historique de publication non modifiable'
);

select ok(
  current_setting('test.legacy_consents_before', true)::int
    = (select count(*) from public.profile_share_consents)
  and current_setting('test.legacy_links_before', true)::int
    = (select count(*) from public.profile_share_links),
  'T108 — partage limité historique strictement inchangé'
);


-- Cas limite : une photo supprimée après dépublication dans la même transaction
-- ne doit pas générer un faux événement photo_invalidated.
select public._csv_call(
  '00000000-0000-0000-e100-000000000005', 'publish', null);
select is(current_setting('test.state', true), '',
  'T109 — publication E réussie pour le cas limite');

select public._csv_call(
  '00000000-0000-0000-e100-000000000005', 'unpublish');
select is(current_setting('test.bool1', true), 'true',
  'T110 — publication E dépubliée avant suppression photo');

select public._csv_call(
  '00000000-0000-0000-e100-000000000005', 'delete_photo',
  '10000000-0000-0000-e100-000000000001');
select is(current_setting('test.state', true), '',
  'T111 — suppression de la photo E après dépublication réussie');

select is((select count(*)::int
  from public.candidate_showcase_publication_events
  where profile_id = '00000000-0000-0000-e100-000000000005'
    and action_type = 'photo_invalidated'), 0,
  'T112 — aucune invalidation auditée pour une publication déjà désactivée');

select * from finish();
rollback;
