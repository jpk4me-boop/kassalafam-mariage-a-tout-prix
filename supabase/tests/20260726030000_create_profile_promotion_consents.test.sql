-- =============================================================================
-- pgTAP  Consentement promotionnel des profils
-- Migration cible :
--   20260726030000_create_profile_promotion_consents.sql
--
-- Aucun test neffectue une publication ou un appel à un réseau social.
-- Toutes les données sont fictives et annulées par ROLLBACK.
-- =============================================================================

begin;

create extension if not exists pgtap with schema extensions;

set search_path = extensions, public, pg_catalog;

-- ---------------------------------------------------------------------------
-- Helpers de test
-- ---------------------------------------------------------------------------

create function public._ppc_as(p_uid text)
returns void
language plpgsql
as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', p_uid,
      'role', 'authenticated'
    )::text,
    true
  );
end;
$$;

create function public._ppc_capture_sql(p_sql text)
returns void
language plpgsql
as $$
begin
  execute p_sql;

  perform set_config('test.state', '', true);
  perform set_config('test.err', '', true);
exception
  when others then
    perform set_config('test.state', sqlstate, true);
    perform set_config('test.err', sqlerrm, true);
end;
$$;

create function public._ppc_capture_count(p_sql text)
returns void
language plpgsql
as $$
declare
  v_count bigint;
begin
  execute p_sql into v_count;

  perform set_config('test.count', coalesce(v_count, 0)::text, true);
  perform set_config('test.state', '', true);
  perform set_config('test.err', '', true);
exception
  when others then
    perform set_config('test.count', '-1', true);
    perform set_config('test.state', sqlstate, true);
    perform set_config('test.err', sqlerrm, true);
end;
$$;

create function public._ppc_capture_set(
  p_photo_id uuid,
  p_channels text[],
  p_duration integer
)
returns void
language plpgsql
as $$
declare
  v_row record;
begin
  select *
  into v_row
  from public.set_my_profile_promotion_consent(
    p_photo_id,
    p_channels,
    p_duration
  );

  perform set_config(
    'test.consent_id',
    coalesce(v_row.consent_id::text, ''),
    true
  );

  perform set_config(
    'test.replaced',
    coalesce(v_row.replaced_previous::text, ''),
    true
  );

  perform set_config('test.state', '', true);
  perform set_config('test.err', '', true);
exception
  when others then
    perform set_config('test.consent_id', '', true);
    perform set_config('test.replaced', '', true);
    perform set_config('test.state', sqlstate, true);
    perform set_config('test.err', sqlerrm, true);
end;
$$;

create function public._ppc_capture_withdraw()
returns void
language plpgsql
as $$
declare
  v_result boolean;
begin
  v_result := public.withdraw_my_profile_promotion_consent();

  perform set_config(
    'test.withdrawn',
    coalesce(v_result::text, ''),
    true
  );

  perform set_config('test.state', '', true);
  perform set_config('test.err', '', true);
exception
  when others then
    perform set_config('test.withdrawn', '', true);
    perform set_config('test.state', sqlstate, true);
    perform set_config('test.err', sqlerrm, true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

insert into auth.users(id, email)
values
  (
    '00000000-0000-0000-0000-0000000000a1',
    'promotion-a@example.test'
  ),
  (
    '00000000-0000-0000-0000-0000000000b1',
    'promotion-b@example.test'
  );

insert into public.profiles(id, first_name)
values
  (
    '00000000-0000-0000-0000-0000000000a1',
    'Membre A'
  ),
  (
    '00000000-0000-0000-0000-0000000000b1',
    'Membre B'
  );

insert into public.photos(
  id,
  profile_id,
  storage_path,
  is_primary
)
values
  (
    '10000000-0000-0000-0000-0000000000a1',
    '00000000-0000-0000-0000-0000000000a1',
    '00000000-0000-0000-0000-0000000000a1/promotion-a.jpg',
    true
  ),
  (
    '10000000-0000-0000-0000-0000000000b1',
    '00000000-0000-0000-0000-0000000000b1',
    '00000000-0000-0000-0000-0000000000b1/promotion-b.jpg',
    true
  );

select plan(44);

-- ---------------------------------------------------------------------------
-- Structure
-- ---------------------------------------------------------------------------

-- 1
select has_table(
  'public',
  'profile_promotion_consents',
  'table profile_promotion_consents présente'
);

-- 2
select columns_are(
  'public',
  'profile_promotion_consents',
  array[
    'id',
    'profile_id',
    'photo_id',
    'policy_version',
    'consent_text',
    'channels',
    'duration_days',
    'consented_at',
    'expires_at',
    'withdrawn_at',
    'withdrawn_by',
    'withdrawal_reason',
    'created_at'
  ],
  'colonnes exactes'
);

-- 3
select is(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.profile_promotion_consents'::regclass
  ),
  true,
  'RLS activée'
);

-- 4
select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profile_promotion_consents'
  ),
  1,
  'une seule policy SELECT own'
);

-- 5
select is(
  (
    select prosecdef
    from pg_proc
    where oid =
      'public.set_my_profile_promotion_consent(uuid,text[],integer)'::regprocedure
  ),
  true,
  'set consent est SECURITY DEFINER'
);

-- 6
select is(
  (
    select prosecdef
    from pg_proc
    where oid =
      'public.withdraw_my_profile_promotion_consent()'::regprocedure
  ),
  true,
  'withdraw consent est SECURITY DEFINER'
);

-- 7
select ok(
  (
    select proconfig::text like '%search_path=%'
    from pg_proc
    where oid =
      'public.set_my_profile_promotion_consent(uuid,text[],integer)'::regprocedure
  ),
  'search_path fixé sur set'
);

-- 8
select ok(
  (
    select proconfig::text like '%search_path=%'
    from pg_proc
    where oid =
      'public.withdraw_my_profile_promotion_consent()'::regprocedure
  ),
  'search_path fixé sur withdraw'
);

-- 9
select is(
  has_function_privilege(
    'authenticated',
    'public.set_my_profile_promotion_consent(uuid,text[],integer)',
    'EXECUTE'
  ),
  true,
  'authenticated peut appeler set'
);

-- 10
select is(
  has_function_privilege(
    'anon',
    'public.set_my_profile_promotion_consent(uuid,text[],integer)',
    'EXECUTE'
  ),
  false,
  'anon ne peut pas appeler set'
);

-- 11
select is(
  has_function_privilege(
    'authenticated',
    'public.withdraw_my_profile_promotion_consent()',
    'EXECUTE'
  ),
  true,
  'authenticated peut appeler withdraw'
);

-- 12
select is(
  has_function_privilege(
    'anon',
    'public.withdraw_my_profile_promotion_consent()',
    'EXECUTE'
  ),
  false,
  'anon ne peut pas appeler withdraw'
);

-- 13
select is(
  has_table_privilege(
    'anon',
    'public.profile_promotion_consents',
    'SELECT'
  ),
  false,
  'anon ne peut pas lire'
);

-- 14
select is(
  has_table_privilege(
    'authenticated',
    'public.profile_promotion_consents',
    'SELECT'
  ),
  true,
  'authenticated possède SELECT'
);

-- 15
select is(
  has_table_privilege(
    'authenticated',
    'public.profile_promotion_consents',
    'INSERT'
  )
  or has_table_privilege(
    'authenticated',
    'public.profile_promotion_consents',
    'UPDATE'
  )
  or has_table_privilege(
    'authenticated',
    'public.profile_promotion_consents',
    'DELETE'
  ),
  false,
  'aucune écriture directe authenticated'
);

-- 16
select has_index(
  'public',
  'profile_promotion_consents',
  'profile_promotion_consents_one_active',
  'index actif unique présent'
);

-- 17
select has_check(
  'public',
  'profile_promotion_consents',
  'profile_promotion_consents_channels_valid',
  'contrainte canaux présente'
);

-- 18
select has_check(
  'public',
  'profile_promotion_consents',
  'profile_promotion_consents_duration_valid',
  'contrainte durée présente'
);

-- 19
select has_check(
  'public',
  'profile_promotion_consents',
  'profile_promotion_consents_expiry_valid',
  'contrainte expiration présente'
);

-- 20
select has_check(
  'public',
  'profile_promotion_consents',
  'profile_promotion_consents_withdrawal_coherence',
  'contrainte retrait présente'
);

-- ---------------------------------------------------------------------------
-- Anonyme
-- ---------------------------------------------------------------------------

set local role anon;

select public._ppc_capture_sql(
  $sql$
    select *
    from public.set_my_profile_promotion_consent(
      '10000000-0000-0000-0000-0000000000a1',
      array['facebook'],
      7
    )
  $sql$
);

reset role;

-- 21
select is(
  current_setting('test.state', true),
  '42501',
  'appel anonyme refusé'
);

-- ---------------------------------------------------------------------------
-- Premier consentement du membre A
-- ---------------------------------------------------------------------------

set local role authenticated;

select public._ppc_as(
  '00000000-0000-0000-0000-0000000000a1'
);

select public._ppc_capture_set(
  '10000000-0000-0000-0000-0000000000a1',
  array['instagram', 'facebook', 'facebook'],
  7
);

reset role;

-- 22
select is(
  current_setting('test.state', true),
  '',
  'premier consentement réussi'
);

-- 23
select is(
  current_setting('test.replaced', true),
  'false',
  'premier consentement ne remplace rien'
);

-- 24
select is(
  (
    select policy_version
    from public.profile_promotion_consents
    where profile_id =
      '00000000-0000-0000-0000-0000000000a1'
      and withdrawn_at is null
  ),
  '2026-07-social-v1',
  'version définie côté serveur'
);

-- 25
select is(
  (
    select consent_text
    from public.profile_promotion_consents
    where profile_id =
      '00000000-0000-0000-0000-0000000000a1'
      and withdrawn_at is null
  ),
  'Jautorise KASSALAFAM à utiliser la photo que je sélectionne et une présentation limitée de mon profil à des fins de promotion de la plateforme sur les réseaux sociaux que je choisis, pendant la durée indiquée. Je peux retirer cette autorisation à tout moment pour les nouvelles publications.',
  'texte officiel défini côté serveur'
);

-- 26
select is(
  (
    select photo_id
    from public.profile_promotion_consents
    where profile_id =
      '00000000-0000-0000-0000-0000000000a1'
      and withdrawn_at is null
  ),
  '10000000-0000-0000-0000-0000000000a1'::uuid,
  'photo appartenant à A enregistrée'
);

-- 27
select is(
  (
    select channels
    from public.profile_promotion_consents
    where profile_id =
      '00000000-0000-0000-0000-0000000000a1'
      and withdrawn_at is null
  ),
  array['facebook', 'instagram']::text[],
  'canaux normalisés et dédupliqués'
);

-- 28
select is(
  (
    select expires_at - consented_at
    from public.profile_promotion_consents
    where profile_id =
      '00000000-0000-0000-0000-0000000000a1'
      and withdrawn_at is null
  ),
  interval '7 days',
  'durée de sept jours exacte'
);

-- 29
select is(
  (
    select count(*)::integer
    from public.profile_promotion_consents
    where profile_id =
      '00000000-0000-0000-0000-0000000000a1'
      and withdrawn_at is null
  ),
  1,
  'une seule ligne active'
);

-- ---------------------------------------------------------------------------
-- Isolation RLS
-- ---------------------------------------------------------------------------

set local role authenticated;

select public._ppc_as(
  '00000000-0000-0000-0000-0000000000a1'
);

select public._ppc_capture_count(
  'select count(*) from public.profile_promotion_consents'
);

reset role;

-- 30
select is(
  current_setting('test.count', true),
  '1',
  'A voit sa ligne'
);

set local role authenticated;

select public._ppc_as(
  '00000000-0000-0000-0000-0000000000b1'
);

select public._ppc_capture_count(
  'select count(*) from public.profile_promotion_consents'
);

reset role;

-- 31
select is(
  current_setting('test.count', true),
  '0',
  'B ne voit pas la ligne de A'
);

-- B tente dutiliser la photo de A.
set local role authenticated;

select public._ppc_as(
  '00000000-0000-0000-0000-0000000000b1'
);

select public._ppc_capture_set(
  '10000000-0000-0000-0000-0000000000a1',
  array['facebook'],
  7
);

reset role;

-- 32
select is(
  current_setting('test.state', true),
  'P0002',
  'B ne peut pas sélectionner la photo de A'
);

-- ---------------------------------------------------------------------------
-- Remplacement du consentement
-- ---------------------------------------------------------------------------

set local role authenticated;

select public._ppc_as(
  '00000000-0000-0000-0000-0000000000a1'
);

select public._ppc_capture_set(
  '10000000-0000-0000-0000-0000000000a1',
  array['whatsapp'],
  30
);

reset role;

-- 33
select is(
  current_setting('test.state', true),
  '',
  'remplacement réussi'
);

-- 34
select is(
  current_setting('test.replaced', true),
  'true',
  'RPC signale le remplacement'
);

-- 35
select is(
  (
    select count(*)::integer
    from public.profile_promotion_consents
    where profile_id =
      '00000000-0000-0000-0000-0000000000a1'
  ),
  2,
  'historique de deux lignes conservé'
);

-- 36
select is(
  (
    select count(*)::integer
    from public.profile_promotion_consents
    where profile_id =
      '00000000-0000-0000-0000-0000000000a1'
      and withdrawal_reason = 'replaced'
  ),
  1,
  'ancienne autorisation marquée replaced'
);

-- 37
select is(
  (
    select count(*)::integer
    from public.profile_promotion_consents
    where profile_id =
      '00000000-0000-0000-0000-0000000000a1'
      and withdrawn_at is null
  ),
  1,
  'toujours une seule autorisation active'
);

-- ---------------------------------------------------------------------------
-- Retrait
-- ---------------------------------------------------------------------------

set local role authenticated;

select public._ppc_as(
  '00000000-0000-0000-0000-0000000000a1'
);

select public._ppc_capture_withdraw();

reset role;

-- 38
select is(
  current_setting('test.withdrawn', true),
  'true',
  'retrait actif retourne true'
);

-- 39
select is(
  (
    select count(*)::integer
    from public.profile_promotion_consents
    where profile_id =
      '00000000-0000-0000-0000-0000000000a1'
      and withdrawn_at is null
  ),
  0,
  'aucune ligne active après retrait'
);

set local role authenticated;

select public._ppc_as(
  '00000000-0000-0000-0000-0000000000a1'
);

select public._ppc_capture_withdraw();

reset role;

-- 40
select is(
  current_setting('test.withdrawn', true),
  'false',
  'retrait répété idempotent'
);

-- ---------------------------------------------------------------------------
-- Entrées invalides
-- ---------------------------------------------------------------------------

set local role authenticated;

select public._ppc_as(
  '00000000-0000-0000-0000-0000000000a1'
);

select public._ppc_capture_set(
  '10000000-0000-0000-0000-0000000000a1',
  array['tiktok'],
  7
);

reset role;

-- 41
select is(
  current_setting('test.state', true),
  '22023',
  'canal non autorisé refusé'
);

set local role authenticated;

select public._ppc_as(
  '00000000-0000-0000-0000-0000000000a1'
);

select public._ppc_capture_set(
  '10000000-0000-0000-0000-0000000000a1',
  array['facebook'],
  365
);

reset role;

-- 42
select is(
  current_setting('test.state', true),
  '22023',
  'durée non autorisée refusée'
);

set local role authenticated;

select public._ppc_as(
  '00000000-0000-0000-0000-0000000000a1'
);

select public._ppc_capture_set(
  '10000000-0000-0000-0000-000000000099',
  array['facebook'],
  7
);

reset role;

-- 43
select is(
  current_setting('test.state', true),
  'P0002',
  'photo inexistante refusée'
);

set local role authenticated;

select public._ppc_as(
  '00000000-0000-0000-0000-0000000000a1'
);

select public._ppc_capture_sql(
  $sql$
    insert into public.profile_promotion_consents (
      profile_id,
      photo_id,
      policy_version,
      consent_text,
      channels,
      duration_days,
      expires_at
    )
    values (
      '00000000-0000-0000-0000-0000000000a1',
      '10000000-0000-0000-0000-0000000000a1',
      'hack',
      'hack',
      array['facebook'],
      7,
      now() + interval '7 days'
    )
  $sql$
);

reset role;

-- 44
select is(
  current_setting('test.state', true),
  '42501',
  'INSERT direct authenticated refusé'
);

select * from finish();

rollback;