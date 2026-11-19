-- =============================================================================
-- pgTAP — Saaspay : apply_saaspay_payment_update.
-- Base jetable uniquement. Transaction unique + ROLLBACK.
-- =============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set search_path = extensions, public, pg_catalog;

insert into auth.users (id, email) values
  ('94000000-0000-0000-0000-000000000001', 'saaspay-admin@example.test'),
  ('94000000-0000-0000-0000-000000000002', 'saaspay-payer@example.test'),
  ('94000000-0000-0000-0000-000000000003', 'saaspay-other@example.test');

insert into public.profiles (
  id, first_name, gender, birth_date, country, city, marital_status,
  discovery_universe, verification_status, account_status, created_at
) values
  ('94000000-0000-0000-0000-000000000002', 'Payeuse', 'femme', '1994-01-01',
   'Cameroun', 'Douala', 'celibataire', 'christian_marriage', 'approved',
   'active', now()),
  ('94000000-0000-0000-0000-000000000003', 'Autre', 'homme', '1990-01-01',
   'Cameroun', 'Yaoundé', 'celibataire', 'christian_marriage', 'approved',
   'active', now());

insert into public.premium_plans (
  id, code, version, display_name, duration_days, price_xaf, currency,
  available_from, available_until, created_by
) values (
  '95000000-0000-0000-0000-000000000001',
  'saaspay_test_monthly', 1, 'Premium mensuel test', 30, 5900, 'XAF',
  now() - interval '1 hour', now() + interval '1 day',
  '94000000-0000-0000-0000-000000000001'
);

insert into public.payment_transactions (
  id, profile_id, profile_id_snapshot, plan_id, provider, provider_reference,
  idempotency_key, status, amount_xaf, currency
) values
  ('96000000-0000-0000-0000-000000000001',
   '94000000-0000-0000-0000-000000000002', '94000000-0000-0000-0000-000000000002',
   '95000000-0000-0000-0000-000000000001', 'saaspay', 'sp-pay-success',
   'saaspay-idem-key-000001', 'initiated', 5900, 'XAF'),
  ('96000000-0000-0000-0000-000000000002',
   '94000000-0000-0000-0000-000000000003', '94000000-0000-0000-0000-000000000003',
   '95000000-0000-0000-0000-000000000001', 'saaspay', 'sp-pay-cancel',
   'saaspay-idem-key-000002', 'pending', 5900, 'XAF'),
  ('96000000-0000-0000-0000-000000000003',
   '94000000-0000-0000-0000-000000000003', '94000000-0000-0000-0000-000000000003',
   '95000000-0000-0000-0000-000000000001', 'saaspay', 'sp-pay-failed',
   'saaspay-idem-key-000003', 'pending', 5900, 'XAF'),
  ('96000000-0000-0000-0000-000000000004',
   '94000000-0000-0000-0000-000000000003', '94000000-0000-0000-0000-000000000003',
   '95000000-0000-0000-0000-000000000001', 'sebpay', 'sp-shared-ref',
   'saaspay-idem-key-000004', 'pending', 5900, 'XAF');

select plan(24);

-- Sécurité de la fonction.
select is(
  (select prosecdef from pg_proc
    where oid = 'public.apply_saaspay_payment_update(text,text,text,integer,text)'::regprocedure),
  true, 'S1 — SECURITY DEFINER'
);
select ok(
  (select proconfig @> array['search_path=""']
     from pg_proc
    where oid = 'public.apply_saaspay_payment_update(text,text,text,integer,text)'::regprocedure),
  'S2 — search_path figé'
);
select is(
  has_function_privilege('anon',
    'public.apply_saaspay_payment_update(text,text,text,integer,text)', 'execute'),
  false, 'S3 — anon ne peut pas exécuter'
);
select is(
  has_function_privilege('authenticated',
    'public.apply_saaspay_payment_update(text,text,text,integer,text)', 'execute'),
  false, 'S4 — authenticated ne peut pas exécuter'
);
select is(
  has_function_privilege('service_role',
    'public.apply_saaspay_payment_update(text,text,text,integer,text)', 'execute'),
  true, 'S5 — service_role peut exécuter'
);

-- Entrées hors contrat : échec fermé avant toute écriture.
select throws_ok(
  $$select * from public.apply_saaspay_payment_update('sp-pay-success','SUCCESS',null,5900,'XAF')$$,
  '22023', 'MAPPED_STATUS_INVALID', 'E1 — statut interne nul refusé'
);
select throws_ok(
  $$select * from public.apply_saaspay_payment_update('sp-pay-success','REFUNDED','refunded',5900,'XAF')$$,
  '22023', 'MAPPED_STATUS_INVALID', 'E2 — statut hors contrat refusé'
);
select throws_ok(
  $$select * from public.apply_saaspay_payment_update('x','SUCCESS','succeeded',5900,'XAF')$$,
  '22023', 'PROVIDER_REFERENCE_INVALID', 'E3 — référence trop courte refusée'
);

-- Référence inconnue ou d'un autre fournisseur : journalisée, sans effet.
select is(
  (select processing_result from public.apply_saaspay_payment_update(
    'sp-unknown-ref','SUCCESS','succeeded',5900,'XAF')),
  'unmatched', 'U1 — référence inconnue = unmatched'
);
select is(
  (select processing_result from public.apply_saaspay_payment_update(
    'sp-shared-ref','SUCCESS','succeeded',5900,'XAF')),
  'unmatched', 'U2 — une transaction SebPay n''est jamais touchée'
);
select is(
  (select status::text from public.payment_transactions
    where id = '96000000-0000-0000-0000-000000000004'),
  'pending', 'U3 — transaction SebPay inchangée'
);

-- Transitions.
select is(
  (select processing_result from public.apply_saaspay_payment_update(
    'sp-pay-success','PENDING','pending',5900,'XAF')),
  'applied_pending', 'T1 — initiated → pending'
);
select is(
  (select processing_result from public.apply_saaspay_payment_update(
    'sp-pay-success','SUCCESS','succeeded',5000,'XAF')),
  'amount_mismatch', 'T2 — montant divergent refusé'
);
select is(
  (select status::text from public.payment_transactions
    where id = '96000000-0000-0000-0000-000000000001'),
  'pending', 'T3 — transaction intacte après écart de montant'
);
select is(
  (select processing_result from public.apply_saaspay_payment_update(
    'sp-pay-success','SUCCESS','succeeded',5900,'XAF')),
  'applied_succeeded', 'T4 — paiement confirmé appliqué'
);
select is(
  (select count(*)::int from public.premium_subscriptions
    where profile_id_snapshot = '94000000-0000-0000-0000-000000000002'
      and provider = 'saaspay'
      and provider_subscription_ref = 'sp-pay-success'
      and status = 'active'),
  1, 'T5 — abonnement Premium Saaspay actif créé'
);
select is(
  (select processing_result from public.apply_saaspay_payment_update(
    'sp-pay-success','SUCCESS','succeeded',5900,'XAF')),
  'noop_already_final', 'T6 — rejeu sans effet'
);
select is(
  (select count(*)::int from public.premium_subscriptions
    where profile_id_snapshot = '94000000-0000-0000-0000-000000000002'),
  1, 'T7 — aucun doublon d''abonnement'
);
select is(
  (select processing_result from public.apply_saaspay_payment_update(
    'sp-pay-cancel','CANCELLED','cancelled',null,null)),
  'applied_cancelled', 'T8 — annulation appliquée'
);
select ok(
  (select status = 'cancelled' and completed_at is not null and failure_code is null
     from public.payment_transactions
    where id = '96000000-0000-0000-0000-000000000002'),
  'T9 — transaction annulée et close'
);
select is(
  (select processing_result from public.apply_saaspay_payment_update(
    'sp-pay-failed','FAILED','failed',null,null)),
  'applied_failed', 'T10 — échec appliqué'
);
select is(
  (select failure_code from public.payment_transactions
    where id = '96000000-0000-0000-0000-000000000003'),
  'failed', 'T11 — code d''échec conservé'
);

-- Journal idempotent.
select is(
  (select count(*)::int from public.payment_webhook_events
    where provider = 'saaspay' and provider_reference = 'sp-pay-success'),
  2, 'J1 — une ligne par couple (référence, statut) : pending, succeeded ; rejeux absorbés'
);
select is(
  (select count(*)::int from public.payment_webhook_events
    where provider = 'saaspay' and external_reference is not null),
  0, 'J2 — aucune référence externe journalisée'
);

select * from finish();
rollback;
