-- =============================================================================
-- pgTAP — PR4 : gestion membre des liens de partage publics limités.
-- Base jetable uniquement. Transaction unique + ROLLBACK.
-- =============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set search_path = extensions, public, pg_catalog;

-- Exécute create/rotate sous le rôle authenticated et capture le résultat.
create function public._mps_create(
  p_uid uuid,
  p_rotate boolean default false,
  p_expires timestamptz default null
)
returns void
language plpgsql
as $$
declare
  v_id uuid;
  v_token text;
  v_prefix text;
  v_expires timestamptz;
begin
  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text,
    true
  );

  if p_rotate then
    select link_id, token, token_prefix, expires_at
    into v_id, v_token, v_prefix, v_expires
    from public.rotate_my_profile_share_link(p_expires);
  else
    select link_id, token, token_prefix, expires_at
    into v_id, v_token, v_prefix, v_expires
    from public.create_my_profile_share_link(p_expires);
  end if;

  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('test.link_id', coalesce(v_id::text, ''), true);
  perform set_config('test.token', coalesce(v_token, ''), true);
  perform set_config('test.prefix', coalesce(v_prefix, ''), true);
  perform set_config('test.expires', coalesce(v_expires::text, ''), true);
  perform set_config('test.state', '', true);
  perform set_config('test.err', '', true);
exception when others then
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('test.link_id', '', true);
  perform set_config('test.token', '', true);
  perform set_config('test.prefix', '', true);
  perform set_config('test.expires', '', true);
  perform set_config('test.state', sqlstate, true);
  perform set_config('test.err', sqlerrm, true);
end;
$$;

create function public._mps_revoke(p_uid uuid, p_link uuid)
returns void
language plpgsql
as $$
declare
  v_result boolean;
begin
  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text,
    true
  );

  v_result := public.revoke_my_profile_share_link(p_link);

  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('test.bool', coalesce(v_result::text, ''), true);
  perform set_config('test.state', '', true);
  perform set_config('test.err', '', true);
exception when others then
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('test.bool', '', true);
  perform set_config('test.state', sqlstate, true);
  perform set_config('test.err', sqlerrm, true);
end;
$$;

create function public._mps_withdraw(p_uid uuid)
returns void
language plpgsql
as $$
declare
  v_result boolean;
begin
  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text,
    true
  );

  v_result := public.withdraw_my_profile_share_consent();

  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('test.bool', coalesce(v_result::text, ''), true);
  perform set_config('test.state', '', true);
  perform set_config('test.err', '', true);
exception when others then
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('test.bool', '', true);
  perform set_config('test.state', sqlstate, true);
  perform set_config('test.err', sqlerrm, true);
end;
$$;

create function public._mps_grant(p_uid uuid)
returns void
language plpgsql
as $$
declare
  v_id uuid;
begin
  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text,
    true
  );

  select consent_id into v_id
  from public.grant_my_profile_share_consent();

  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('test.consent_id', coalesce(v_id::text, ''), true);
  perform set_config('test.state', '', true);
  perform set_config('test.err', '', true);
exception when others then
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('test.consent_id', '', true);
  perform set_config('test.state', sqlstate, true);
  perform set_config('test.err', sqlerrm, true);
end;
$$;

create function public._mps_status(p_uid uuid)
returns void
language plpgsql
as $$
declare
  v_id uuid;
  v_prefix text;
  v_status text;
begin
  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text,
    true
  );

  select link_id, token_prefix, status
  into v_id, v_prefix, v_status
  from public.get_my_profile_share_link_status();

  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('test.status_id', coalesce(v_id::text, ''), true);
  perform set_config('test.status_prefix', coalesce(v_prefix, ''), true);
  perform set_config('test.status_value', coalesce(v_status, ''), true);
  perform set_config('test.state', '', true);
  perform set_config('test.err', '', true);
exception when others then
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('test.status_id', '', true);
  perform set_config('test.status_prefix', '', true);
  perform set_config('test.status_value', '', true);
  perform set_config('test.state', sqlstate, true);
  perform set_config('test.err', sqlerrm, true);
end;
$$;

-- Fixtures fictives.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0a10-000000000001', 'member-a@ex.test'),
  ('00000000-0000-0000-0b10-000000000002', 'member-b@ex.test'),
  ('00000000-0000-0000-0c10-000000000003', 'member-c@ex.test'),
  ('00000000-0000-0000-0d10-000000000004', 'member-d@ex.test');

insert into public.profiles (
  id, first_name, verification_status, account_status, onboarding_completed_at,
  suspended_at, suspended_by, suspension_reason
) values
  ('00000000-0000-0000-0a10-000000000001', 'Membre A', 'approved', 'active', now(), null, null, null),
  ('00000000-0000-0000-0b10-000000000002', 'Membre B', 'approved', 'active', now(), null, null, null),
  ('00000000-0000-0000-0c10-000000000003', 'Membre C', 'approved', 'active', now(), null, null, null),
  ('00000000-0000-0000-0d10-000000000004', 'Membre D', 'approved', 'suspended', now(), now(),
   '00000000-0000-0000-0a10-000000000001', 'Suspension fictive valide.');

insert into public.profile_share_consents (profile_id, policy_version, consent_text)
values
  ('00000000-0000-0000-0a10-000000000001', '2026-07-v1', 'Consentement fictif A'),
  ('00000000-0000-0000-0b10-000000000002', '2026-07-v1', 'Consentement fictif B'),
  ('00000000-0000-0000-0d10-000000000004', '2026-07-v1', 'Consentement fictif D');

select plan(44);

-- Structure et privilèges.
select has_function('public', 'get_my_profile_share_link_status', array[]::text[],
  'T1 — RPC statut membre présente');
select has_function('public', 'create_my_profile_share_link', array['timestamp with time zone'],
  'T2 — RPC création membre présente');
select has_function('public', 'revoke_my_profile_share_link', array['uuid'],
  'T3 — RPC révocation membre présente');
select has_function('public', 'rotate_my_profile_share_link', array['timestamp with time zone'],
  'T4 — RPC rotation membre présente');

select is((select prosecdef from pg_proc where oid =
  'public.get_my_profile_share_link_status()'::regprocedure), true,
  'T5 — statut est SECURITY DEFINER');
select is((select prosecdef from pg_proc where oid =
  'public.create_my_profile_share_link(timestamptz)'::regprocedure), true,
  'T6 — création est SECURITY DEFINER');
select is((select prosecdef from pg_proc where oid =
  'public.revoke_my_profile_share_link(uuid)'::regprocedure), true,
  'T7 — révocation est SECURITY DEFINER');
select is((select prosecdef from pg_proc where oid =
  'public.rotate_my_profile_share_link(timestamptz)'::regprocedure), true,
  'T8 — rotation est SECURITY DEFINER');

select ok((select proconfig::text like '%search_path=%' from pg_proc where oid =
  'public.get_my_profile_share_link_status()'::regprocedure),
  'T9 — statut verrouille search_path');
select ok((select proconfig::text like '%search_path=%' from pg_proc where oid =
  'public.create_my_profile_share_link(timestamptz)'::regprocedure),
  'T10 — création verrouille search_path');
select ok((select proconfig::text like '%search_path=%' from pg_proc where oid =
  'public.revoke_my_profile_share_link(uuid)'::regprocedure),
  'T11 — révocation verrouille search_path');
select ok((select proconfig::text like '%search_path=%' from pg_proc where oid =
  'public.rotate_my_profile_share_link(timestamptz)'::regprocedure),
  'T12 — rotation verrouille search_path');

select is(has_function_privilege('authenticated',
  'public.get_my_profile_share_link_status()', 'EXECUTE'), true,
  'T13 — authenticated peut lire son statut');
select is(has_function_privilege('anon',
  'public.get_my_profile_share_link_status()', 'EXECUTE'), false,
  'T14 — anon ne peut pas lire le statut');
select is(has_function_privilege('authenticated',
  'public.create_my_profile_share_link(timestamptz)', 'EXECUTE'), true,
  'T15 — authenticated peut créer son lien');
select is(has_function_privilege('anon',
  'public.create_my_profile_share_link(timestamptz)', 'EXECUTE'), false,
  'T16 — anon ne peut pas créer');
select is(has_function_privilege('authenticated',
  'public.revoke_my_profile_share_link(uuid)', 'EXECUTE'), true,
  'T17 — authenticated peut révoquer son lien');
select is(has_function_privilege('anon',
  'public.revoke_my_profile_share_link(uuid)', 'EXECUTE'), false,
  'T18 — anon ne peut pas révoquer');
select is(has_function_privilege('authenticated',
  'public.rotate_my_profile_share_link(timestamptz)', 'EXECUTE'), true,
  'T19 — authenticated peut renouveler son lien');
select is(has_function_privilege('anon',
  'public.rotate_my_profile_share_link(timestamptz)', 'EXECUTE'), false,
  'T20 — anon ne peut pas renouveler');

-- Création par le membre A.
select public._mps_create('00000000-0000-0000-0a10-000000000001');
select is(current_setting('test.state', true), '',
  'T21 — création du propre lien réussie');
select is(char_length(current_setting('test.token', true)), 43,
  'T22 — jeton URL-safe de 43 caractères');
select is(current_setting('test.prefix', true),
  left(current_setting('test.token', true), 8),
  'T23 — préfixe cohérent');
select is((select profile_id::text from public.profile_share_links
  where id = current_setting('test.link_id', true)::uuid),
  '00000000-0000-0000-0a10-000000000001',
  'T24 — profil déduit de auth.uid');
select is((select created_by::text from public.profile_share_links
  where id = current_setting('test.link_id', true)::uuid),
  '00000000-0000-0000-0a10-000000000001',
  'T25 — acteur déduit de auth.uid');

select public._mps_status('00000000-0000-0000-0a10-000000000001');
select is(current_setting('test.status_value', true), 'active',
  'T26 — statut membre actif');
select is(current_setting('test.status_prefix', true),
  current_setting('test.prefix', true),
  'T27 — statut renvoie uniquement le préfixe attendu');

-- Deuxième création interdite tant que le lien est actif.
select public._mps_create('00000000-0000-0000-0a10-000000000001');
select is(current_setting('test.state', true), '22023',
  'T28 — second lien actif refusé');
select is(current_setting('test.err', true), 'LINK_ALREADY_ACTIVE',
  'T29 — erreur stable LINK_ALREADY_ACTIVE');

-- Isolation entre membres.
select public._mps_create('00000000-0000-0000-0b10-000000000002');
select is(current_setting('test.state', true), '',
  'T30 — membre B crée son propre lien');
select set_config('test.b_link', current_setting('test.link_id', true), true);
select set_config('test.b_token', current_setting('test.token', true), true);
select public._mps_revoke(
  '00000000-0000-0000-0a10-000000000001',
  current_setting('test.b_link', true)::uuid
);
select is(current_setting('test.state', true), 'P0002',
  'T31 — A ne peut pas révoquer le lien de B');
select is(current_setting('test.err', true), 'LINK_NOT_FOUND',
  'T32 — non-appartenance uniformisée en LINK_NOT_FOUND');

-- Révocation propriétaire et idempotence.
select public._mps_revoke(
  '00000000-0000-0000-0a10-000000000001',
  (select id from public.profile_share_links
   where profile_id='00000000-0000-0000-0a10-000000000001' and revoked_at is null)
);
select is(current_setting('test.bool', true), 'true',
  'T33 — A révoque son propre lien');
select public._mps_revoke(
  '00000000-0000-0000-0a10-000000000001',
  (select id from public.profile_share_links
   where profile_id='00000000-0000-0000-0a10-000000000001'
   order by created_at desc limit 1)
);
select is(current_setting('test.bool', true), 'false',
  'T34 — révocation idempotente');
select is((select revoked_by::text from public.profile_share_links
  where profile_id='00000000-0000-0000-0a10-000000000001'
  order by created_at desc limit 1),
  '00000000-0000-0000-0a10-000000000001',
  'T35 — auteur de révocation propriétaire conservé');

-- Rotation atomique du lien B.
select public._mps_create('00000000-0000-0000-0b10-000000000002', true);
select is(current_setting('test.state', true), '',
  'T36 — rotation du lien B réussie');
select isnt(current_setting('test.token', true), current_setting('test.b_token', true),
  'T37 — rotation produit un nouveau jeton');
select is((select count(*)::int from public.resolve_profile_share_link(
  current_setting('test.b_token', true))), 0,
  'T38 — ancien jeton B immédiatement invalide');
select is((select count(*)::int from public.resolve_profile_share_link(
  current_setting('test.token', true))), 1,
  'T39 — nouveau jeton B valide');
select is((select count(*)::int from public.profile_share_links
  where profile_id='00000000-0000-0000-0b10-000000000002'), 2,
  'T40 — rotation conserve l’historique des deux liens');

-- Consentement obligatoire et compte suspendu.
select public._mps_create('00000000-0000-0000-0c10-000000000003');
select is(current_setting('test.err', true), 'CONSENT_REQUIRED',
  'T41 — création sans consentement refusée');
select public._mps_create('00000000-0000-0000-0d10-000000000004');
select is(current_setting('test.err', true), 'ACCOUNT_SUSPENDED',
  'T42 — création suspendue refusée');

-- Retrait : révocation définitive, sans résurrection après nouveau consentement.
select public._mps_create('00000000-0000-0000-0a10-000000000001');
select set_config('test.a_token_after', current_setting('test.token', true), true);
select public._mps_withdraw('00000000-0000-0000-0a10-000000000001');
select is(current_setting('test.bool', true), 'true',
  'T43 — retrait du consentement réussi');
select public._mps_grant('00000000-0000-0000-0a10-000000000001');
select is((select count(*)::int from public.resolve_profile_share_link(
  current_setting('test.a_token_after', true))), 0,
  'T44 — ancien lien reste révoqué après nouveau consentement');

select * from finish();
rollback;
