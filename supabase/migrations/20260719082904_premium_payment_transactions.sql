-- =============================================================================
-- KASSALAFAM — C1b — Registre fournisseur-neutre des transactions de paiement
-- Aucun webhook ni fournisseur n'est activé dans ce lot.
-- =============================================================================

create table public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  profile_id_snapshot uuid not null,
  plan_id uuid not null references public.premium_plans(id) on delete restrict,
  subscription_id uuid references public.premium_subscriptions(id) on delete set null,
  provider text not null,
  provider_reference text not null,
  idempotency_key text not null,
  status public.payment_transaction_status not null,
  amount_xaf integer not null,
  currency text not null default 'XAF',
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint payment_transactions_profile_snapshot_match
    check (profile_id is null or profile_id = profile_id_snapshot),
  constraint payment_transactions_provider_len
    check (char_length(btrim(provider)) between 2 and 50),
  constraint payment_transactions_provider_ref_len
    check (char_length(btrim(provider_reference)) between 2 and 200),
  constraint payment_transactions_idempotency_len
    check (char_length(btrim(idempotency_key)) between 16 and 200),
  constraint payment_transactions_amount_positive
    check (amount_xaf > 0),
  constraint payment_transactions_currency_xaf
    check (currency = 'XAF'),
  constraint payment_transactions_completion_state
    check (
      (
        status in (
          'initiated'::public.payment_transaction_status,
          'pending'::public.payment_transaction_status
        )
        and completed_at is null
      )
      or
      (
        status in (
          'succeeded'::public.payment_transaction_status,
          'failed'::public.payment_transaction_status,
          'cancelled'::public.payment_transaction_status,
          'refunded'::public.payment_transaction_status
        )
        and completed_at is not null
      )
    ),
  constraint payment_transactions_failure_code_state
    check (
      failure_code is null
      or status = 'failed'::public.payment_transaction_status
    ),
  constraint payment_transactions_provider_ref_unique
    unique (provider, provider_reference),
  constraint payment_transactions_idempotency_unique
    unique (idempotency_key)
);

create index payment_transactions_profile_idx
  on public.payment_transactions (profile_id_snapshot, created_at desc);

create index payment_transactions_status_idx
  on public.payment_transactions (status, updated_at desc);

create index payment_transactions_profile_id_idx
  on public.payment_transactions (profile_id)
  where profile_id is not null;

create index payment_transactions_plan_id_idx
  on public.payment_transactions (plan_id);

create index payment_transactions_subscription_id_idx
  on public.payment_transactions (subscription_id)
  where subscription_id is not null;
