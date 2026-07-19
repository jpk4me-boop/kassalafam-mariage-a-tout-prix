-- =============================================================================
-- KASSALAFAM — C1b — Journal Premium et fermeture des accès directs
-- =============================================================================

create table public.premium_subscription_actions (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid references public.premium_subscriptions(id) on delete set null,
  subscription_id_snapshot uuid not null,
  profile_id uuid references public.profiles(id) on delete set null,
  profile_id_snapshot uuid not null,
  plan_id uuid not null references public.premium_plans(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete set null,
  actor_email_snapshot text,
  action_type public.premium_action_type not null,
  previous_status public.premium_subscription_status,
  new_status public.premium_subscription_status not null,
  reason text not null,
  created_at timestamptz not null default now(),

  constraint premium_actions_subscription_snapshot_match
    check (subscription_id is null or subscription_id = subscription_id_snapshot),
  constraint premium_actions_profile_snapshot_match
    check (profile_id is null or profile_id = profile_id_snapshot),
  constraint premium_actions_reason_len
    check (char_length(btrim(reason)) between 10 and 1000),
  constraint premium_actions_status_transition
    check (
      (
        action_type in (
          'granted'::public.premium_action_type,
          'payment_activated'::public.premium_action_type
        )
        and previous_status is null
        and new_status = 'active'::public.premium_subscription_status
      )
      or
      (
        action_type = 'revoked'::public.premium_action_type
        and previous_status = 'active'::public.premium_subscription_status
        and new_status = 'revoked'::public.premium_subscription_status
      )
      or
      (
        action_type = 'expired'::public.premium_action_type
        and previous_status = 'active'::public.premium_subscription_status
        and new_status = 'expired'::public.premium_subscription_status
      )
      or
      (
        action_type = 'payment_refunded'::public.premium_action_type
        and previous_status = 'active'::public.premium_subscription_status
        and new_status = 'revoked'::public.premium_subscription_status
      )
    )
);

create index premium_subscription_actions_profile_idx
  on public.premium_subscription_actions (profile_id_snapshot, created_at desc);

create index premium_subscription_actions_subscription_idx
  on public.premium_subscription_actions (subscription_id_snapshot, created_at desc);

create index premium_subscription_actions_subscription_id_idx
  on public.premium_subscription_actions (subscription_id)
  where subscription_id is not null;

create index premium_subscription_actions_profile_id_idx
  on public.premium_subscription_actions (profile_id)
  where profile_id is not null;

create index premium_subscription_actions_plan_id_idx
  on public.premium_subscription_actions (plan_id);

create index premium_subscription_actions_actor_id_idx
  on public.premium_subscription_actions (actor_id)
  where actor_id is not null;

alter table public.premium_plans enable row level security;
alter table public.premium_subscriptions enable row level security;
alter table public.payment_transactions enable row level security;
alter table public.premium_subscription_actions enable row level security;

-- Aucune policy : les tables ne sont jamais une API client.
revoke all on table public.premium_plans
  from public, anon, authenticated, service_role;
revoke all on table public.premium_subscriptions
  from public, anon, authenticated, service_role;
revoke all on table public.payment_transactions
  from public, anon, authenticated, service_role;
revoke all on table public.premium_subscription_actions
  from public, anon, authenticated, service_role;

-- Le back-office peut seulement lire. Toute écriture passe par des RPC.
grant select on table public.premium_plans to service_role;
grant select on table public.premium_subscriptions to service_role;
grant select on table public.payment_transactions to service_role;
grant select on table public.premium_subscription_actions to service_role;
