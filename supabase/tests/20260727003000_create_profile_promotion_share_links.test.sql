-- =============================================================================
-- pgTAP — liens promotionnels administrateur pour les réseaux sociaux.
-- Base locale jetable uniquement. Transaction unique + ROLLBACK.
-- =============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set search_path = extensions, public, pg_catalog;

-- -----------------------------------------------------------------------------
-- Helpers de capture.
-- -----------------------------------------------------------------------------
create function public._ppsl_clear()
returns void
language plpgsql
as $$
begin
  perform set_config('test.state', '', true);
  perform set_config('test.error', '', true);
  perform set_config('test.link_id', '', true);
  perform set_config('test.token', '', true);
  perform set_config('test.prefix', '', true);
  perform set_config('test.channel', '', true);
  perform set_config('test.expires', '', true);
  perform set_config('test.consent_expires', '', true);
  perform set_config('test.bool', '', true);
end;
$$;

create function public._ppsl_cap_create(
  p_profile uuid,
  p_actor uuid,
  p_channel text,
  p_expires timestamptz default null
)
returns void
language plpgsql
as $$
declare
  v_id uuid;
  v_token text;
  v_prefix text;
  v_channel text;
  v_expires timestamptz;
  v_consent_expires timestamptz;
begin
  perform public._ppsl_clear();

  select
    link_id,
    token,
    token_prefix,
    channel,
    expires_at,
    consent_expires_at
  into
    v_id,
    v_token,
    v_prefix,
    v_channel,
    v_expires,
    v_consent_expires
  from public.create_profile_promotion_share_link(
    p_profile,
    p_actor,
    p_channel,
    p_expires
  );

  perform set_config('test.link_id', coalesce(v_id::text, ''), true);
  perform set_config('test.token', coalesce(v_token, ''), true);
  perform set_config('test.prefix', coalesce(v_prefix, ''), true);
  perform set_config('test.channel', coalesce(v_channel, ''), true);
  perform set_config('test.expires', coalesce(v_expires::text, ''), true);
  perform set_config(
    'test.consent_expires',
    coalesce(v_consent_expires::text, ''),
    true
  );
exception when others then
  perform public._ppsl_clear();
  perform set_config('test.state', sqlstate, true);
  perform set_config('test.error', sqlerrm, true);
end;
$$;

create function public._ppsl_cap_revoke(
  p_link uuid,
  p_actor uuid,
  p_reason text default null
)
returns void
language plpgsql
as $$
declare
  v_result boolean;
begin
  perform public._ppsl_clear();
  v_result := public.revoke_profile_promotion_share_link(
    p_link,
    p_actor,
    p_reason
  );
  perform set_config('test.bool', coalesce(v_result::text, ''), true);
exception when others then
  perform public._ppsl_clear();
  perform set_config('test.state', sqlstate, true);
  perform set_config('test.error', sqlerrm, true);
end;
$$;

create function public._ppsl_resolve_count(p_token text)
returns integer
language sql
as $$
  select count(*)::integer
  from public.resolve_profile_promotion_share_link(p_token);
$$;

-- -----------------------------------------------------------------------------
-- Fixtures.
-- -----------------------------------------------------------------------------
insert into auth.users(id, email) values
  ('00000000-0000-0000-aa00-000000000001', 'admin-promo@example.test'),
  ('00000000-0000-0000-aa00-000000000002', 'eligible@example.test'),
  ('00000000-0000-0000-aa00-000000000003', 'no-consent@example.test'),
  ('00000000-0000-0000-aa00-000000000004', 'suspended@example.test'),
  ('00000000-0000-0000-aa00-000000000005', 'blurred@example.test');

insert into public.profiles(
  id,
  first_name,
  gender,
  birth_date,
  country,
  city,
  bio,
  blur_photos,
  verification_status,
  marital_status,
  partner_expectations,
  discovery_universe,
  account_status,
  suspended_at,
  suspended_by,
  suspension_reason,
  onboarding_completed_at
) values
  (
    '00000000-0000-0000-aa00-000000000002',
    'Aline',
    'femme',
    '1994-01-01',
    'Cameroun',
    'Douala',
    'Présentation promotionnelle fictive et suffisamment complète.',
    false,
    'approved',
    'celibataire',
    'Attentes matrimoniales fictives et suffisamment complètes.',
    'christian_marriage',
    'active',
    null,
    null,
    null,
    now()
  ),
  (
    '00000000-0000-0000-aa00-000000000003',
    'Benoît',
    'homme',
    '1990-01-01',
    'Cameroun',
    'Yaoundé',
    'Présentation promotionnelle fictive et suffisamment complète.',
    false,
    'approved',
    'celibataire',
    'Attentes matrimoniales fictives et suffisamment complètes.',
    'open_marriage',
    'active',
    null,
    null,
    null,
    now()
  ),
  (
    '00000000-0000-0000-aa00-000000000004',
    'Carole',
    'femme',
    '1992-01-01',
    'Cameroun',
    'Douala',
    'Présentation promotionnelle fictive et suffisamment complète.',
    false,
    'approved',
    'celibataire',
    'Attentes matrimoniales fictives et suffisamment complètes.',
    'open_marriage',
    'suspended',
    now(),
    '00000000-0000-0000-aa00-000000000001',
    'Suspension de test valide.',
    now()
  ),
  (
    '00000000-0000-0000-aa00-000000000005',
    'David',
    'homme',
    '1988-01-01',
    'Cameroun',
    'Douala',
    'Présentation promotionnelle fictive et suffisamment complète.',
    true,
    'approved',
    'celibataire',
    'Attentes matrimoniales fictives et suffisamment complètes.',
    'open_marriage',
    'active',
    null,
    null,
    null,
    now()
  );

insert into public.photos(
  id,
  profile_id,
  storage_path,
  is_primary,
  mime_type,
  size_bytes
) values
  (
    '10000000-0000-0000-aa00-000000000002',
    '00000000-0000-0000-aa00-000000000002',
    '00000000-0000-0000-aa00-000000000002/promo.jpg',
    true,
    'image/jpeg',
    120000
  ),
  (
    '10000000-0000-0000-aa00-000000000003',
    '00000000-0000-0000-aa00-000000000003',
    '00000000-0000-0000-aa00-000000000003/promo.jpg',
    true,
    'image/jpeg',
    120000
  ),
  (
    '10000000-0000-0000-aa00-000000000004',
    '00000000-0000-0000-aa00-000000000004',
    '00000000-0000-0000-aa00-000000000004/promo.jpg',
    true,
    'image/jpeg',
    120000
  ),
  (
    '10000000-0000-0000-aa00-000000000005',
    '00000000-0000-0000-aa00-000000000005',
    '00000000-0000-0000-aa00-000000000005/promo.jpg',
    true,
    'image/jpeg',
    120000
  );

insert into public.profile_promotion_consents(
  id,
  profile_id,
  photo_id,
  policy_version,
  consent_text,
  channels,
  duration_days,
  consented_at,
  expires_at
) values
  (
    '20000000-0000-0000-aa00-000000000002',
    '00000000-0000-0000-aa00-000000000002',
    '10000000-0000-0000-aa00-000000000002',
    '2026-07-social-v1',
    'Autorisation promotionnelle fictive pour Facebook et WhatsApp.',
    array['facebook', 'whatsapp'],
    30,
    now(),
    now() + interval '10 days'
  ),
  (
    '20000000-0000-0000-aa00-000000000004',
    '00000000-0000-0000-aa00-000000000004',
    '10000000-0000-0000-aa00-000000000004',
    '2026-07-social-v1',
    'Autorisation promotionnelle fictive pour un compte suspendu.',
    array['facebook'],
    30,
    now(),
    now() + interval '10 days'
  ),
  (
    '20000000-0000-0000-aa00-000000000005',
    '00000000-0000-0000-aa00-000000000005',
    '10000000-0000-0000-aa00-000000000005',
    '2026-07-social-v1',
    'Autorisation promotionnelle fictive avec photos protégées.',
    array['whatsapp'],
    30,
    now(),
    now() + interval '10 days'
  );

select plan(61);

-- -----------------------------------------------------------------------------
-- Structure, RLS, privilèges.
-- -----------------------------------------------------------------------------
select has_table(
  'public',
  'profile_promotion_share_links',
  'T1 table présente'
);

select columns_are(
  'public',
  'profile_promotion_share_links',
  array[
    'id',
    'profile_id',
    'consent_id',
    'photo_id',
    'channel',
    'token_hash',
    'token_prefix',
    'created_by',
    'created_at',
    'expires_at',
    'revoked_at',
    'revoked_by',
    'revocation_reason'
  ],
  'T2 colonnes exactes'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.profile_promotion_share_links'::regclass
  ),
  'T3 RLS active'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profile_promotion_share_links'
  ),
  0,
  'T4 aucune policy client'
);

select has_pk(
  'public',
  'profile_promotion_share_links',
  'T5 clé primaire présente'
);

select ok(
  exists(
    select 1
    from pg_constraint
    where conrelid = 'public.profile_promotion_share_links'::regclass
      and conname = 'profile_promotion_share_links_token_hash_unique'
  ),
  'T6 hash unique'
);

select ok(
  exists(
    select 1
    from pg_constraint
    where conrelid = 'public.profile_promotion_share_links'::regclass
      and conname = 'profile_promotion_share_links_channel_valid'
  ),
  'T7 canaux contraints'
);

select ok(
  exists(
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'profile_promotion_share_links'
      and indexname = 'profile_promotion_share_links_photo_idx'
      and indexdef like '%(photo_id)%'
  ),
  'T7b index photo_id présent'
);

select is(
  has_table_privilege(
    'anon',
    'public.profile_promotion_share_links',
    'SELECT'
  ),
  false,
  'T8 anon ne lit pas la table'
);

select is(
  has_table_privilege(
    'authenticated',
    'public.profile_promotion_share_links',
    'SELECT'
  ),
  false,
  'T9 authenticated ne lit pas la table'
);

select is(
  has_table_privilege(
    'service_role',
    'public.profile_promotion_share_links',
    'SELECT'
  ),
  true,
  'T10 service_role peut diagnostiquer'
);

select is(
  has_table_privilege(
    'service_role',
    'public.profile_promotion_share_links',
    'INSERT'
  ),
  false,
  'T11 service_role n’écrit pas directement'
);

select is(
  (
    select count(*)::integer
    from pg_proc
    where oid in (
      'public.create_profile_promotion_share_link(uuid,uuid,text,timestamptz)'::regprocedure,
      'public.revoke_profile_promotion_share_link(uuid,uuid,text)'::regprocedure,
      'public.resolve_profile_promotion_share_link(text)'::regprocedure,
      'public.admin_list_profile_promotion_share_links(uuid)'::regprocedure,
      'public.admin_get_profile_promotion_share_status(uuid[])'::regprocedure,
      'public.profile_promotion_share_eligibility_reason(uuid,text)'::regprocedure
    )
      and prosecdef
  ),
  6,
  'T12 les six fonctions sont SECURITY DEFINER'
);

select is(
  has_function_privilege(
    'service_role',
    'public.create_profile_promotion_share_link(uuid,uuid,text,timestamptz)',
    'EXECUTE'
  ),
  true,
  'T13 service_role peut créer'
);

select is(
  has_function_privilege(
    'anon',
    'public.create_profile_promotion_share_link(uuid,uuid,text,timestamptz)',
    'EXECUTE'
  ),
  false,
  'T14 anon ne peut pas créer'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.create_profile_promotion_share_link(uuid,uuid,text,timestamptz)',
    'EXECUTE'
  ),
  false,
  'T15 authenticated ne peut pas créer'
);

select is(
  has_function_privilege(
    'service_role',
    'public.resolve_profile_promotion_share_link(text)',
    'EXECUTE'
  ),
  true,
  'T16 service_role peut résoudre'
);

select is(
  has_function_privilege(
    'anon',
    'public.resolve_profile_promotion_share_link(text)',
    'EXECUTE'
  ),
  false,
  'T17 anon ne peut pas résoudre'
);

select is(
  has_function_privilege(
    'service_role',
    'public.admin_get_profile_promotion_share_status(uuid[])',
    'EXECUTE'
  ),
  true,
  'T18 statut groupé réservé au serveur'
);

select is(
  has_function_privilege(
    'service_role',
    'public.profile_promotion_share_eligibility_reason(uuid,text)',
    'EXECUTE'
  ),
  false,
  'T19 helper interne non exposé'
);

-- -----------------------------------------------------------------------------
-- Diagnostic d’éligibilité.
-- -----------------------------------------------------------------------------
select is(
  public.profile_promotion_share_eligibility_reason(
    '00000000-0000-0000-aa00-000000000002',
    'facebook'
  ),
  'eligible',
  'T20 profil Facebook éligible'
);

select is(
  public.profile_promotion_share_eligibility_reason(
    '00000000-0000-0000-aa00-000000000002',
    'whatsapp'
  ),
  'eligible',
  'T21 profil WhatsApp éligible'
);

select is(
  public.profile_promotion_share_eligibility_reason(
    '00000000-0000-0000-aa00-000000000002',
    'instagram'
  ),
  'channel_not_authorized',
  'T22 Instagram non autorisé'
);

select is(
  public.profile_promotion_share_eligibility_reason(
    '00000000-0000-0000-aa00-000000000003',
    'facebook'
  ),
  'consent_required',
  'T23 consentement obligatoire'
);

select is(
  public.profile_promotion_share_eligibility_reason(
    '00000000-0000-0000-aa00-000000000004',
    'facebook'
  ),
  'account_suspended',
  'T24 suspension bloque'
);

select is(
  public.profile_promotion_share_eligibility_reason(
    '00000000-0000-0000-aa00-000000000005',
    'whatsapp'
  ),
  'photo_privacy_enabled',
  'T25 floutage bloque'
);

select is(
  public.profile_promotion_share_eligibility_reason(
    '00000000-0000-0000-aa00-000000000099',
    'facebook'
  ),
  'profile_not_found',
  'T26 profil inconnu'
);

-- -----------------------------------------------------------------------------
-- Création et résolution.
-- -----------------------------------------------------------------------------
select public._ppsl_cap_create(
  '00000000-0000-0000-aa00-000000000002',
  '00000000-0000-0000-aa00-000000000001',
  'facebook',
  null
);

select is(
  current_setting('test.state', true),
  '',
  'T27 création Facebook réussie'
);

select is(
  char_length(current_setting('test.token', true)),
  43,
  'T28 jeton de 43 caractères'
);

select is(
  char_length(current_setting('test.prefix', true)),
  8,
  'T29 préfixe de 8 caractères'
);

select is(
  current_setting('test.channel', true),
  'facebook',
  'T30 canal normalisé'
);

select ok(
  current_setting('test.token', true) ~ '^[A-Za-z0-9_-]{43}$',
  'T31 alphabet URL-safe'
);

select is(
  (
    select octet_length(token_hash)
    from public.profile_promotion_share_links
    where id = current_setting('test.link_id', true)::uuid
  ),
  32,
  'T32 seul le hash SHA-256 est stocké'
);

select is(
  public._ppsl_resolve_count(current_setting('test.token', true)),
  1,
  'T33 jeton valide résolu'
);

select is(
  public._ppsl_resolve_count('court'),
  0,
  'T34 forme invalide neutre'
);

select is(
  public._ppsl_resolve_count(
    (
      case
        when left(current_setting('test.token', true), 1) = 'A' then 'B'
        else 'A'
      end
    ) || substr(current_setting('test.token', true), 2)
  ),
  0,
  'T35 jeton altéré neutre'
);

select set_config(
  'test.facebook_link_id',
  current_setting('test.link_id', true),
  true
);

select set_config(
  'test.facebook_token',
  current_setting('test.token', true),
  true
);

select public._ppsl_cap_create(
  '00000000-0000-0000-aa00-000000000002',
  '00000000-0000-0000-aa00-000000000001',
  'whatsapp',
  now() + interval '2 days'
);

select is(
  current_setting('test.state', true),
  '',
  'T36 création WhatsApp réussie'
);

select isnt(
  current_setting('test.token', true),
  current_setting('test.facebook_token', true),
  'T37 jetons distincts'
);

select is(
  public._ppsl_resolve_count(current_setting('test.facebook_token', true)),
  1,
  'T38 le nouveau lien ne casse pas Facebook'
);

select is(
  public._ppsl_resolve_count(current_setting('test.token', true)),
  1,
  'T39 WhatsApp résolu'
);

select is(
  (
    select count(*)::integer
    from public.profile_promotion_share_links
    where profile_id = '00000000-0000-0000-aa00-000000000002'
      and revoked_at is null
  ),
  2,
  'T40 plusieurs liens simultanés'
);

select set_config(
  'test.whatsapp_token',
  current_setting('test.token', true),
  true
);

select public._ppsl_cap_create(
  '00000000-0000-0000-aa00-000000000002',
  '00000000-0000-0000-aa00-000000000001',
  'instagram',
  null
);

select is(
  current_setting('test.error', true),
  'PROMOTION_CHANNEL_NOT_AUTHORIZED',
  'T41 canal non autorisé refusé'
);

select public._ppsl_cap_create(
  '00000000-0000-0000-aa00-000000000003',
  '00000000-0000-0000-aa00-000000000001',
  'facebook',
  null
);

select is(
  current_setting('test.error', true),
  'PROMOTION_CONSENT_REQUIRED',
  'T42 absence de consentement refusée'
);

select public._ppsl_cap_create(
  '00000000-0000-0000-aa00-000000000004',
  '00000000-0000-0000-aa00-000000000001',
  'facebook',
  null
);

select is(
  current_setting('test.error', true),
  'PROMOTION_PROFILE_NOT_SHAREABLE:account_suspended',
  'T43 compte suspendu refusé'
);

select public._ppsl_cap_create(
  '00000000-0000-0000-aa00-000000000002',
  '00000000-0000-0000-aa00-000000000001',
  'facebook',
  now() + interval '31 days'
);

select is(
  current_setting('test.error', true),
  'EXPIRY_TOO_LONG',
  'T44 durée supérieure à 30 jours refusée'
);

select public._ppsl_cap_create(
  '00000000-0000-0000-aa00-000000000002',
  '00000000-0000-0000-aa00-000000000001',
  'facebook',
  now() + interval '11 days'
);

select is(
  current_setting('test.error', true),
  'EXPIRY_EXCEEDS_PROMOTION_CONSENT',
  'T45 dépassement du consentement refusé'
);

select public._ppsl_cap_create(
  '00000000-0000-0000-aa00-000000000002',
  '00000000-0000-0000-aa00-000000000099',
  'facebook',
  null
);

select is(
  current_setting('test.error', true),
  'ACTOR_NOT_FOUND',
  'T46 acteur inconnu refusé'
);

-- -----------------------------------------------------------------------------
-- Révocation, invalidation et métadonnées.
-- -----------------------------------------------------------------------------
select public._ppsl_cap_revoke(
  current_setting('test.facebook_link_id', true)::uuid,
  '00000000-0000-0000-aa00-000000000001',
  'Révocation pgTAP.'
);

select is(
  current_setting('test.bool', true),
  'true',
  'T47 première révocation réussie'
);

select public._ppsl_cap_revoke(
  current_setting('test.facebook_link_id', true)::uuid,
  '00000000-0000-0000-aa00-000000000001',
  'Deuxième appel.'
);

select is(
  current_setting('test.bool', true),
  'false',
  'T48 révocation idempotente'
);

select is(
  public._ppsl_resolve_count(current_setting('test.facebook_token', true)),
  0,
  'T49 lien révoqué inutilisable'
);

select is(
  (
    select status
    from public.admin_list_profile_promotion_share_links(
      '00000000-0000-0000-aa00-000000000002'
    )
    where link_id = current_setting('test.facebook_link_id', true)::uuid
  ),
  'revoked',
  'T50 statut révoqué'
);

select is(
  (
    select status
    from public.admin_list_profile_promotion_share_links(
      '00000000-0000-0000-aa00-000000000002'
    )
    where channel = 'whatsapp'
    order by created_at desc
    limit 1
  ),
  'active',
  'T51 statut actif'
);

select is(
  (
    select effectively_shareable
    from public.admin_get_profile_promotion_share_status(
      array['00000000-0000-0000-aa00-000000000002'::uuid]
    )
  ),
  true,
  'T52 carte partageable'
);

select is(
  (
    select channels
    from public.admin_get_profile_promotion_share_status(
      array['00000000-0000-0000-aa00-000000000002'::uuid]
    )
  ),
  array['facebook', 'whatsapp']::text[],
  'T53 canaux remontés à la carte'
);

select is(
  (
    select active_link_count::integer
    from public.admin_get_profile_promotion_share_status(
      array['00000000-0000-0000-aa00-000000000002'::uuid]
    )
  ),
  1,
  'T54 compteur actif exclut le lien révoqué'
);

update public.profile_promotion_consents
set withdrawn_at = now(),
    withdrawn_by = '00000000-0000-0000-aa00-000000000002',
    withdrawal_reason = 'member_withdrawn'
where id = '20000000-0000-0000-aa00-000000000002';

select is(
  public._ppsl_resolve_count(current_setting('test.whatsapp_token', true)),
  0,
  'T55 retrait du consentement invalide le lien'
);

select is(
  (
    select status
    from public.admin_list_profile_promotion_share_links(
      '00000000-0000-0000-aa00-000000000002'
    )
    where channel = 'whatsapp'
    order by created_at desc
    limit 1
  ),
  'invalidated',
  'T56 statut invalidé après retrait'
);

select is(
  (
    select effectively_shareable
    from public.admin_get_profile_promotion_share_status(
      array['00000000-0000-0000-aa00-000000000002'::uuid]
    )
  ),
  false,
  'T57 carte bloquée après retrait'
);

select is(
  (
    select eligibility_reason
    from public.admin_get_profile_promotion_share_status(
      array['00000000-0000-0000-aa00-000000000002'::uuid]
    )
  ),
  'consent_required',
  'T58 motif de carte actionnable'
);

select is(
  (
    select count(*)::integer
    from public.admin_get_profile_promotion_share_status(
      array[
        '00000000-0000-0000-aa00-000000000002'::uuid,
        '00000000-0000-0000-aa00-000000000003'::uuid
      ]
    )
  ),
  2,
  'T59 statut groupé renvoie chaque profil demandé'
);

select is(
  (
    select count(*)::integer
    from public.profile_share_links
  ),
  0,
  'T60 backend historique /p inchangé'
);

select * from finish();
rollback;
