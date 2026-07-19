-- =============================================================================
-- KASSALAFAM — MARIAGE À TOUT PRIX
-- C1b — Catalogue Premium fournisseur-neutre
-- Date : 2026-07-19
-- =============================================================================

-- La transition vers la nouvelle source de vérité est volontairement bloquée si
-- un ancien état Premium existe. Production a été auditée à 0 profil Premium.
do $$
begin
  if exists (select 1 from public.profiles where is_premium) then
    raise exception 'PREMIUM_LEGACY_STATE_REQUIRES_MIGRATION'
      using errcode = '55000';
  end if;
end;
$$;

create type public.premium_subscription_status
  as enum ('active', 'expired', 'revoked');

create type public.premium_subscription_source
  as enum ('admin', 'payment');

create type public.premium_action_type
  as enum (
    'granted',
    'revoked',
    'expired',
    'payment_activated',
    'payment_refunded'
  );

create type public.payment_transaction_status
  as enum (
    'initiated',
    'pending',
    'succeeded',
    'failed',
    'cancelled',
    'refunded'
  );

create table public.premium_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  version integer not null,
  display_name text not null,
  duration_days integer not null,
  price_xaf integer not null,
  currency text not null default 'XAF',
  available_from timestamptz not null,
  available_until timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),

  constraint premium_plans_code_format
    check (code = lower(code) and code ~ '^[a-z0-9][a-z0-9_]{1,49}$'),
  constraint premium_plans_version_positive
    check (version > 0),
  constraint premium_plans_display_name_len
    check (char_length(btrim(display_name)) between 2 and 120),
  constraint premium_plans_duration_days_range
    check (duration_days between 1 and 3660),
  constraint premium_plans_price_xaf_positive
    check (price_xaf > 0),
  constraint premium_plans_currency_xaf
    check (currency = 'XAF'),
  constraint premium_plans_availability_valid
    check (available_until is null or available_until > available_from),
  constraint premium_plans_code_version_unique
    unique (code, version)
);

create index premium_plans_availability_idx
  on public.premium_plans (available_from, available_until);

create index premium_plans_created_by_idx
  on public.premium_plans (created_by)
  where created_by is not null;
