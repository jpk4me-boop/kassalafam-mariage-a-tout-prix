-- =============================================================================
-- KASSALAFAM — C1b — Historique autoritatif des abonnements Premium
-- =============================================================================

create table public.premium_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  profile_id_snapshot uuid not null,
  plan_id uuid not null references public.premium_plans(id) on delete restrict,
  status public.premium_subscription_status not null,
  source public.premium_subscription_source not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  granted_by uuid references auth.users(id) on delete set null,
  provider text,
  provider_subscription_ref text,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  revocation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint premium_subscriptions_profile_snapshot_match
    check (profile_id is null or profile_id = profile_id_snapshot),
  constraint premium_subscriptions_period_valid
    check (ends_at > starts_at),
  constraint premium_subscriptions_provider_pair
    check (
      (
        source = 'admin'::public.premium_subscription_source
        and provider is null
        and provider_subscription_ref is null
      )
      or
      (
        source = 'payment'::public.premium_subscription_source
        and provider is not null
        and char_length(btrim(provider)) between 2 and 50
        and provider_subscription_ref is not null
        and char_length(btrim(provider_subscription_ref)) between 2 and 200
      )
    ),
  constraint premium_subscriptions_revocation_state
    check (
      (
        status <> 'revoked'::public.premium_subscription_status
        and revoked_at is null
        and revoked_by is null
        and revocation_reason is null
      )
      or
      (
        status = 'revoked'::public.premium_subscription_status
        and revoked_at is not null
        and revocation_reason is not null
        and char_length(btrim(revocation_reason)) between 10 and 1000
      )
    )
);

create unique index premium_subscriptions_one_active_per_profile
  on public.premium_subscriptions (profile_id_snapshot)
  where status = 'active'::public.premium_subscription_status;

create index premium_subscriptions_profile_history_idx
  on public.premium_subscriptions (profile_id_snapshot, created_at desc);

create index premium_subscriptions_due_idx
  on public.premium_subscriptions (ends_at, id)
  where status = 'active'::public.premium_subscription_status;

create unique index premium_subscriptions_provider_ref_unique
  on public.premium_subscriptions (provider, provider_subscription_ref)
  where provider_subscription_ref is not null;

create index premium_subscriptions_profile_id_idx
  on public.premium_subscriptions (profile_id)
  where profile_id is not null;

create index premium_subscriptions_plan_id_idx
  on public.premium_subscriptions (plan_id);

create index premium_subscriptions_granted_by_idx
  on public.premium_subscriptions (granted_by)
  where granted_by is not null;

create index premium_subscriptions_revoked_by_idx
  on public.premium_subscriptions (revoked_by)
  where revoked_by is not null;
