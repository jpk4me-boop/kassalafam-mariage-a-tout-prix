-- =============================================================================
-- KASSALAFAM — SebPay Phase 4 — RPC du parcours de souscription membre
--
--   1. initiate_sebpay_payment_transaction : création autoritative d'une
--      transaction `initiated` AVANT tout appel SebPay (service_role
--      uniquement, appelée par la route serveur après authentification).
--      `external_reference` = `idempotency_key` (unicité en base) ; la
--      `provider_reference` initiale reprend l'idempotency_key et sera
--      remplacée par le transaction_id SebPay via apply_sebpay_payment_update.
--   2. get_my_sebpay_transaction : lecture par le membre de SA transaction
--      (polling du statut). Aucune donnée d'autrui, aucun secret.
-- =============================================================================

create or replace function public.initiate_sebpay_payment_transaction(
  p_profile_id uuid,
  p_plan_code text
)
returns table (
  transaction_id uuid,
  idempotency_key text,
  amount_xaf integer,
  plan_code text,
  plan_display_name text,
  duration_days integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := lower(btrim(coalesce(p_plan_code, '')));
  v_profile public.profiles%rowtype;
  v_plan public.premium_plans%rowtype;
  v_tx public.payment_transactions%rowtype;
  v_key text;
  v_now timestamptz := pg_catalog.now();
begin
  if v_code !~ '^[a-z0-9][a-z0-9_]{1,49}$' then
    raise exception 'PREMIUM_PLAN_NOT_AVAILABLE'
      using errcode = '22023';
  end if;

  select *
    into v_profile
    from public.profiles pr
   where pr.id = p_profile_id
   for update;

  if not found then
    raise exception 'PROFILE_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if v_profile.account_status <> 'active'::public.account_status then
    raise exception 'ACCOUNT_SUSPENDED'
      using errcode = '42501';
  end if;

  perform public.expire_profile_premium_subscription(p_profile_id);

  if exists (
    select 1
    from public.premium_subscriptions s
    where s.profile_id_snapshot = p_profile_id
      and s.status = 'active'::public.premium_subscription_status
      and s.ends_at > v_now
  ) then
    raise exception 'PREMIUM_ALREADY_ACTIVE'
      using errcode = '22023';
  end if;

  -- Les tentatives `initiated` périmées n'ont jamais atteint SebPay (sinon
  -- elles seraient passées `pending` au retour du POST) : annulation
  -- technique pour ne pas bloquer le membre indéfiniment.
  update public.payment_transactions t
     set status = 'cancelled'::public.payment_transaction_status,
         completed_at = v_now,
         updated_at = v_now
   where t.profile_id_snapshot = p_profile_id
     and t.provider = 'sebpay'
     and t.status = 'initiated'::public.payment_transaction_status
     and t.requested_at < v_now - interval '15 minutes';

  -- Une seule collecte SebPay en vol par membre. Les `pending` sont réputées
  -- connues du fournisseur : elles se dénouent par webhook ou réconciliation.
  if exists (
    select 1
    from public.payment_transactions t
    where t.profile_id_snapshot = p_profile_id
      and t.provider = 'sebpay'
      and t.status in (
        'initiated'::public.payment_transaction_status,
        'pending'::public.payment_transaction_status
      )
  ) then
    raise exception 'PAYMENT_ALREADY_IN_PROGRESS'
      using errcode = '22023';
  end if;

  select *
    into v_plan
    from public.premium_plans pl
   where pl.code = v_code
     and pl.available_from <= v_now
     and (pl.available_until is null or pl.available_until > v_now)
   order by pl.version desc
   limit 1;

  if not found then
    raise exception 'PREMIUM_PLAN_NOT_AVAILABLE'
      using errcode = '22023';
  end if;

  v_key := 'kslf_' || replace(pg_catalog.gen_random_uuid()::text, '-', '');

  insert into public.payment_transactions (
    profile_id,
    profile_id_snapshot,
    plan_id,
    provider,
    provider_reference,
    idempotency_key,
    status,
    amount_xaf,
    currency
  )
  values (
    p_profile_id,
    p_profile_id,
    v_plan.id,
    'sebpay',
    v_key,
    v_key,
    'initiated'::public.payment_transaction_status,
    v_plan.price_xaf,
    'XAF'
  )
  returning *
    into v_tx;

  return query
  select
    v_tx.id,
    v_tx.idempotency_key,
    v_tx.amount_xaf,
    v_plan.code,
    v_plan.display_name,
    v_plan.duration_days;
end;
$$;

revoke all on function public.initiate_sebpay_payment_transaction(uuid, text)
  from public, anon, authenticated;

grant execute on function public.initiate_sebpay_payment_transaction(uuid, text)
  to service_role;

create or replace function public.get_my_sebpay_transaction(
  p_transaction_id uuid
)
returns table (
  status public.payment_transaction_status,
  failure_code text,
  subscription_id uuid,
  amount_xaf integer,
  plan_code text,
  requested_at timestamptz,
  completed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not authenticated'
      using errcode = '42501';
  end if;

  return query
  select
    t.status,
    t.failure_code,
    t.subscription_id,
    t.amount_xaf,
    pl.code,
    t.requested_at,
    t.completed_at
  from public.payment_transactions t
  join public.premium_plans pl
    on pl.id = t.plan_id
  where t.id = p_transaction_id
    and t.provider = 'sebpay'
    and t.profile_id_snapshot = v_uid;

  if not found then
    raise exception 'PAYMENT_TRANSACTION_NOT_FOUND'
      using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.get_my_sebpay_transaction(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.get_my_sebpay_transaction(uuid)
  to authenticated, service_role;
