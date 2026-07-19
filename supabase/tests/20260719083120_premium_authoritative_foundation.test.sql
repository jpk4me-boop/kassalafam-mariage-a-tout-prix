-- =============================================================================
-- pgTAP — C1b : socle Premium autoritatif.
-- Base jetable uniquement. Transaction unique + ROLLBACK.
-- =============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set search_path = extensions, public, pg_catalog;

create function public._c1b_exec_as(p_uid uuid, p_sql text)
returns void
language plpgsql
as $$
declare
  v_result text;
begin
  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text,
    true
  );

  begin
    execute p_sql into v_result;
    perform set_config('test.result', coalesce(v_result, ''), true);
    perform set_config('test.state', '', true);
    perform set_config('test.err', '', true);
  exception when others then
    perform set_config('test.result', '', true);
    perform set_config('test.state', sqlstate, true);
    perform set_config('test.err', sqlerrm, true);
  end;

  reset role;
  perform set_config('request.jwt.claims', '', true);
end;
$$;

insert into auth.users (id, email) values
  ('92000000-0000-0000-0000-000000000001', 'c1b-admin@example.test'),
  ('92000000-0000-0000-0000-000000000002', 'c1b-viewer@example.test'),
  ('92000000-0000-0000-0000-000000000003', 'c1b-premium@example.test'),
  ('92000000-0000-0000-0000-000000000004', 'c1b-normal@example.test'),
  ('92000000-0000-0000-0000-000000000005', 'c1b-suspended@example.test'),
  ('92000000-0000-0000-0000-000000000006', 'c1b-payment@example.test');

insert into public.profiles (
  id, first_name, gender, birth_date, country, city, marital_status,
  discovery_universe, verification_status, account_status,
  suspended_at, suspended_by, suspension_reason, created_at
) values
  ('92000000-0000-0000-0000-000000000002', 'Viewer', 'homme', '1990-01-01',
   'Cameroun', 'Douala', 'celibataire', 'christian_marriage', 'approved', 'active',
   null, null, null, now()),
  ('92000000-0000-0000-0000-000000000003', 'Premium', 'femme', '1992-01-01',
   'Cameroun', 'Douala', 'celibataire', 'christian_marriage', 'approved', 'active',
   null, null, null, now() - interval '2 days'),
  ('92000000-0000-0000-0000-000000000004', 'Normale', 'femme', '1993-01-01',
   'Cameroun', 'Douala', 'celibataire', 'christian_marriage', 'approved', 'active',
   null, null, null, now()),
  ('92000000-0000-0000-0000-000000000005', 'Suspendue', 'femme', '1991-01-01',
   'Cameroun', 'Yaoundé', 'celibataire', 'christian_marriage', 'approved', 'suspended',
   now(), '92000000-0000-0000-0000-000000000001',
   'Suspension de validation C1b.', now()),
  ('92000000-0000-0000-0000-000000000006', 'Paiement', 'femme', '1994-01-01',
   'Cameroun', 'Douala', 'celibataire', 'christian_marriage', 'approved', 'active',
   null, null, null, now());

insert into public.photos (profile_id, storage_path, is_primary) values
  ('92000000-0000-0000-0000-000000000003', 'c1b-premium/primary.webp', true),
  ('92000000-0000-0000-0000-000000000004', 'c1b-normal/primary.webp', true);

insert into public.premium_plans (
  id, code, version, display_name, duration_days, price_xaf, currency,
  available_from, available_until, created_by
) values (
  '93000000-0000-0000-0000-000000000001',
  'premium_monthly', 1, 'Premium mensuel', 30, 5900, 'XAF',
  now() - interval '1 hour', now() + interval '1 day',
  '92000000-0000-0000-0000-000000000001'
);

select plan(52);

-- Tables et RLS.
select has_table('public', 'premium_plans', 'T1 — table des offres présente');
select has_table('public', 'premium_subscriptions', 'T2 — table des abonnements présente');
select has_table('public', 'payment_transactions', 'T3 — table des transactions présente');
select has_table('public', 'premium_subscription_actions', 'T4 — journal Premium présent');

select is(
  (select relrowsecurity from pg_class where oid='public.premium_plans'::regclass),
  true, 'T5 — RLS offres actif'
);
select is(
  (select relrowsecurity from pg_class where oid='public.premium_subscriptions'::regclass),
  true, 'T6 — RLS abonnements actif'
);
select is(
  (select relrowsecurity from pg_class where oid='public.payment_transactions'::regclass),
  true, 'T7 — RLS transactions actif'
);
select is(
  (select relrowsecurity from pg_class where oid='public.premium_subscription_actions'::regclass),
  true, 'T8 — RLS journal actif'
);
select is(
  (select count(*)::int from pg_policies
   where schemaname='public'
     and tablename in (
       'premium_plans', 'premium_subscriptions',
       'payment_transactions', 'premium_subscription_actions'
     )),
  0, 'T9 — aucune policy client'
);

-- Privilèges des tables.
select is(has_table_privilege('authenticated','public.premium_plans','SELECT'),false,
  'T10 — authenticated ne lit pas les offres');
select is(has_table_privilege('authenticated','public.premium_subscriptions','SELECT'),false,
  'T11 — authenticated ne lit pas les abonnements');
select is(has_table_privilege('authenticated','public.payment_transactions','SELECT'),false,
  'T12 — authenticated ne lit pas les transactions');
select is(has_table_privilege('authenticated','public.premium_subscription_actions','SELECT'),false,
  'T13 — authenticated ne lit pas le journal');
select is(has_table_privilege('service_role','public.premium_plans','SELECT'),true,
  'T14 — service_role peut lire les offres');
select is(has_table_privilege('service_role','public.premium_plans','INSERT'),false,
  'T15 — service_role ne peut pas écrire directement');

-- RPC et helpers.
select has_function('public','get_my_premium_status',array[]::text[],
  'T16 — RPC membre présente');
select has_function('public','admin_grant_premium_subscription',
  array['uuid','uuid','text','uuid'],
  'T17 — RPC attribution présente');
select has_function('public','admin_revoke_premium_subscription',
  array['uuid','text','text','uuid'],
  'T18 — RPC révocation présente');
select has_function('public','expire_due_premium_subscriptions',
  array['integer'],
  'T19 — RPC expiration globale présente');
select is(has_function_privilege('authenticated',
  'public.get_my_premium_status()','EXECUTE'),true,
  'T20 — membre authentifié lit son statut');
select is(has_function_privilege('anon',
  'public.get_my_premium_status()','EXECUTE'),false,
  'T21 — anon ne lit pas le statut');
select is(has_function_privilege('service_role',
  'public.admin_grant_premium_subscription(uuid,uuid,text,uuid)','EXECUTE'),true,
  'T22 — service_role peut attribuer');
select is(has_function_privilege('authenticated',
  'public.admin_grant_premium_subscription(uuid,uuid,text,uuid)','EXECUTE'),false,
  'T23 — membre ne peut pas attribuer');
select is(has_function_privilege('service_role',
  'public.admin_revoke_premium_subscription(uuid,text,text,uuid)','EXECUTE'),true,
  'T24 — service_role peut révoquer');
select is(has_function_privilege('authenticated',
  'public.admin_revoke_premium_subscription(uuid,text,text,uuid)','EXECUTE'),false,
  'T25 — membre ne peut pas révoquer');
select is(has_function_privilege('service_role',
  'public.profile_has_active_premium(uuid)','EXECUTE'),false,
  'T26 — helper de vérité non exposé');
select is(has_function_privilege('service_role',
  'public.sync_profile_premium_flag(uuid)','EXECUTE'),false,
  'T27 — helper de synchronisation non exposé');

-- is_premium est strictement dérivé.
select throws_ok(
  $$update public.profiles
       set is_premium=true
     where id='92000000-0000-0000-0000-000000000004'$$,
  '42501', 'PROFILE_ADMIN_FIELDS_READ_ONLY',
  'T28 — écriture directe privilégiée du flag refusée'
);

select public._c1b_exec_as(
  '92000000-0000-0000-0000-000000000004',
  $$update public.profiles
       set is_premium=true
     where id='92000000-0000-0000-0000-000000000004'$$
);
select is(current_setting('test.state',true),'42501',
  'T29 — écriture directe membre refusée');

-- Attribution.
select lives_ok(
  $$select *
    from public.admin_grant_premium_subscription(
      '92000000-0000-0000-0000-000000000003',
      '93000000-0000-0000-0000-000000000001',
      'Attribution administrative de validation C1b.',
      '92000000-0000-0000-0000-000000000001'
    )$$,
  'T30 — attribution administrative réussie'
);
select is(
  (select is_premium from public.profiles
   where id='92000000-0000-0000-0000-000000000003'),
  true, 'T31 — flag synchronisé à true'
);
select is(
  (select count(*)::int from public.premium_subscription_actions
   where profile_id_snapshot='92000000-0000-0000-0000-000000000003'
     and action_type='granted'),
  1, 'T32 — attribution journalisée'
);
select throws_ok(
  $$select *
    from public.admin_grant_premium_subscription(
      '92000000-0000-0000-0000-000000000003',
      '93000000-0000-0000-0000-000000000001',
      'Deuxième attribution administrative refusée.',
      '92000000-0000-0000-0000-000000000001'
    )$$,
  '22023', 'PREMIUM_ALREADY_ACTIVE',
  'T33 — second abonnement actif refusé'
);
select throws_ok(
  $$select *
    from public.admin_grant_premium_subscription(
      '92000000-0000-0000-0000-000000000005',
      '93000000-0000-0000-0000-000000000001',
      'Attribution suspendue obligatoirement refusée.',
      '92000000-0000-0000-0000-000000000001'
    )$$,
  '42501', 'ACCOUNT_SUSPENDED',
  'T34 — compte suspendu refusé'
);

select public._c1b_exec_as(
  '92000000-0000-0000-0000-000000000003',
  $$select is_premium::text from public.get_my_premium_status()$$
);
select is(current_setting('test.result',true),'true',
  'T35 — membre Premium lit true');

select public._c1b_exec_as(
  '92000000-0000-0000-0000-000000000002',
  $$select id::text
    from public.discover_candidates('christian_marriage',20,0)
    limit 1$$
);
select is(current_setting('test.result',true),
  '92000000-0000-0000-0000-000000000003',
  'T36 — Premium classé en premier');

-- Concurrence optimiste et révocation.
select throws_ok(
  format(
    $$select *
      from public.admin_revoke_premium_subscription(
        %L,'expired','Révocation avec état attendu incorrect.',
        '92000000-0000-0000-0000-000000000001'
      )$$,
    (select id from public.premium_subscriptions
     where profile_id_snapshot='92000000-0000-0000-0000-000000000003'
       and status='active')
  ),
  '40001', 'PREMIUM_STATUS_CONFLICT',
  'T37 — conflit optimiste détecté'
);
select lives_ok(
  format(
    $$select *
      from public.admin_revoke_premium_subscription(
        %L,'active','Révocation administrative de validation.',
        '92000000-0000-0000-0000-000000000001'
      )$$,
    (select id from public.premium_subscriptions
     where profile_id_snapshot='92000000-0000-0000-0000-000000000003'
       and status='active')
  ),
  'T38 — révocation réussie'
);
select is(
  (select is_premium from public.profiles
   where id='92000000-0000-0000-0000-000000000003'),
  false, 'T39 — flag synchronisé à false'
);
select is(
  (select count(*)::int from public.premium_subscription_actions
   where profile_id_snapshot='92000000-0000-0000-0000-000000000003'),
  2, 'T40 — attribution et révocation journalisées'
);

select throws_ok(
  format(
    $$update public.premium_subscription_actions
         set reason='Modification interdite du journal Premium.'
       where id=%L$$,
    (select id from public.premium_subscription_actions
     order by created_at,id limit 1)
  ),
  '42501', 'PREMIUM_SUBSCRIPTION_ACTIONS_APPEND_ONLY',
  'T41 — journal non modifiable'
);
select throws_ok(
  format(
    $$delete from public.premium_subscription_actions
       where id=%L$$,
    (select id from public.premium_subscription_actions
     order by created_at,id limit 1)
  ),
  '42501', 'PREMIUM_SUBSCRIPTION_ACTIONS_APPEND_ONLY',
  'T42 — journal non supprimable'
);

-- Réattribution puis expiration.
select lives_ok(
  $$select *
    from public.admin_grant_premium_subscription(
      '92000000-0000-0000-0000-000000000003',
      '93000000-0000-0000-0000-000000000001',
      'Nouvelle attribution après révocation valide.',
      '92000000-0000-0000-0000-000000000001'
    )$$,
  'T43 — réattribution après révocation'
);

update public.premium_subscriptions
set starts_at=now()-interval '2 days',
    ends_at=now()-interval '1 minute'
where profile_id_snapshot='92000000-0000-0000-0000-000000000003'
  and status='active';

select public._c1b_exec_as(
  '92000000-0000-0000-0000-000000000003',
  $$select is_premium::text from public.get_my_premium_status()$$
);
select is(current_setting('test.result',true),'false',
  'T44 — lecture membre expire la période');
select is(
  (select status::text from public.premium_subscriptions
   where profile_id_snapshot='92000000-0000-0000-0000-000000000003'
   order by created_at desc,id desc limit 1),
  'expired', 'T45 — abonnement passé à expired'
);
select is(
  (select count(*)::int from public.premium_subscription_actions
   where profile_id_snapshot='92000000-0000-0000-0000-000000000003'
     and action_type='expired'),
  1, 'T46 — expiration journalisée'
);
select is(
  (select count(*)::int from public.profiles p
   where p.is_premium is distinct from public.profile_has_active_premium(p.id)),
  0, 'T47 — aucune dérive entre flag et source de vérité'
);

-- Contraintes de transaction fournisseur-neutre.
select lives_ok(
  $$insert into public.payment_transactions(
      profile_id,profile_id_snapshot,plan_id,provider,provider_reference,
      idempotency_key,status,amount_xaf,currency
    ) values(
      '92000000-0000-0000-0000-000000000006',
      '92000000-0000-0000-0000-000000000006',
      '93000000-0000-0000-0000-000000000001',
      'sandbox','ref-valid-001','c1b-idempotency-key-0001',
      'initiated',5900,'XAF'
    )$$,
  'T48 — transaction initiée valide'
);
select throws_ok(
  $$insert into public.payment_transactions(
      profile_id,profile_id_snapshot,plan_id,provider,provider_reference,
      idempotency_key,status,amount_xaf,currency
    ) values(
      '92000000-0000-0000-0000-000000000006',
      '92000000-0000-0000-0000-000000000006',
      '93000000-0000-0000-0000-000000000001',
      'sandbox','ref-valid-002','c1b-idempotency-key-0001',
      'initiated',5900,'XAF'
    )$$,
  '23505', null,
  'T49 — clé d’idempotence unique'
);
select throws_ok(
  $$insert into public.payment_transactions(
      profile_id,profile_id_snapshot,plan_id,provider,provider_reference,
      idempotency_key,status,amount_xaf,currency
    ) values(
      '92000000-0000-0000-0000-000000000006',
      '92000000-0000-0000-0000-000000000006',
      '93000000-0000-0000-0000-000000000001',
      'sandbox','ref-invalid-amount','c1b-idempotency-key-0002',
      'initiated',0,'XAF'
    )$$,
  '23514', null,
  'T50 — montant non positif refusé'
);
select throws_ok(
  $$insert into public.payment_transactions(
      profile_id,profile_id_snapshot,plan_id,provider,provider_reference,
      idempotency_key,status,amount_xaf,currency,completed_at
    ) values(
      '92000000-0000-0000-0000-000000000006',
      '92000000-0000-0000-0000-000000000006',
      '93000000-0000-0000-0000-000000000001',
      'sandbox','ref-invalid-state','c1b-idempotency-key-0003',
      'succeeded',5900,'XAF',null
    )$$,
  '23514', null,
  'T51 — état terminé exige completed_at'
);
select is(
  (select count(*)::int
   from pg_proc p
   join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public'
     and p.proname in(
       'activate_payment_subscription',
       'record_payment_webhook',
       'complete_payment_transaction'
     )),
  0, 'T52 — aucune RPC fournisseur prématurée'
);

select * from finish();
rollback;
