-- =============================================================================
-- KASSALAFAM — C1b — Transitions administratives Premium journalisées
-- =============================================================================

create or replace function public.admin_grant_premium_subscription(
  p_profile_id uuid,
  p_plan_id uuid,
  p_reason text,
  p_actor_id uuid
)
returns public.premium_subscriptions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_plan public.premium_plans%rowtype;
  v_subscription public.premium_subscriptions%rowtype;
  v_actor_email text;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if char_length(v_reason) < 10 or char_length(v_reason) > 1000 then
    raise exception 'REASON_LENGTH_INVALID'
      using errcode = '22023';
  end if;

  select *
    into v_profile
    from public.profiles p
   where p.id = p_profile_id
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
      and s.ends_at > pg_catalog.now()
  ) then
    raise exception 'PREMIUM_ALREADY_ACTIVE'
      using errcode = '22023';
  end if;

  select *
    into v_plan
    from public.premium_plans p
   where p.id = p_plan_id
     and p.available_from <= pg_catalog.now()
     and (
       p.available_until is null
       or p.available_until > pg_catalog.now()
     );

  if not found then
    raise exception 'PREMIUM_PLAN_NOT_AVAILABLE'
      using errcode = '22023';
  end if;

  select u.email
    into v_actor_email
    from auth.users u
   where u.id = p_actor_id;

  if not found then
    raise exception 'ACTOR_NOT_FOUND'
      using errcode = '22023';
  end if;

  insert into public.premium_subscriptions (
    profile_id,
    profile_id_snapshot,
    plan_id,
    status,
    source,
    starts_at,
    ends_at,
    granted_by
  )
  values (
    p_profile_id,
    p_profile_id,
    p_plan_id,
    'active'::public.premium_subscription_status,
    'admin'::public.premium_subscription_source,
    pg_catalog.now(),
    pg_catalog.now() + pg_catalog.make_interval(days => v_plan.duration_days),
    p_actor_id
  )
  returning *
    into v_subscription;

  insert into public.premium_subscription_actions (
    subscription_id,
    subscription_id_snapshot,
    profile_id,
    profile_id_snapshot,
    plan_id,
    actor_id,
    actor_email_snapshot,
    action_type,
    previous_status,
    new_status,
    reason
  )
  values (
    v_subscription.id,
    v_subscription.id,
    p_profile_id,
    p_profile_id,
    p_plan_id,
    p_actor_id,
    v_actor_email,
    'granted'::public.premium_action_type,
    null,
    'active'::public.premium_subscription_status,
    v_reason
  );

  return v_subscription;
end;
$$;

revoke all on function public.admin_grant_premium_subscription(
  uuid, uuid, text, uuid
) from public, anon, authenticated;

grant execute on function public.admin_grant_premium_subscription(
  uuid, uuid, text, uuid
) to service_role;

create or replace function public.admin_revoke_premium_subscription(
  p_subscription_id uuid,
  p_expected_status text,
  p_reason text,
  p_actor_id uuid
)
returns public.premium_subscriptions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subscription public.premium_subscriptions%rowtype;
  v_actor_email text;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if p_expected_status not in ('active', 'expired', 'revoked') then
    raise exception 'INVALID_PREMIUM_STATUS'
      using errcode = '22023';
  end if;

  if char_length(v_reason) < 10 or char_length(v_reason) > 1000 then
    raise exception 'REASON_LENGTH_INVALID'
      using errcode = '22023';
  end if;

  -- L'acteur est validé avant toute transition, y compris une expiration tardive.
  select u.email
    into v_actor_email
    from auth.users u
   where u.id = p_actor_id;

  if not found then
    raise exception 'ACTOR_NOT_FOUND'
      using errcode = '22023';
  end if;

  select *
    into v_subscription
    from public.premium_subscriptions s
   where s.id = p_subscription_id
   for update;

  if not found then
    raise exception 'PREMIUM_SUBSCRIPTION_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if v_subscription.status::text is distinct from p_expected_status then
    raise exception 'PREMIUM_STATUS_CONFLICT'
      using errcode = '40001';
  end if;

  if v_subscription.status <> 'active'::public.premium_subscription_status then
    raise exception 'INVALID_PREMIUM_TRANSITION'
      using errcode = '22023';
  end if;

  if v_subscription.ends_at <= pg_catalog.now() then
    perform public.expire_profile_premium_subscription(
      v_subscription.profile_id_snapshot
    );

    select *
      into v_subscription
      from public.premium_subscriptions s
     where s.id = p_subscription_id;

    return v_subscription;
  end if;

  update public.premium_subscriptions s
     set status = 'revoked'::public.premium_subscription_status,
         revoked_at = pg_catalog.now(),
         revoked_by = p_actor_id,
         revocation_reason = v_reason,
         updated_at = pg_catalog.now()
   where s.id = p_subscription_id
  returning *
    into v_subscription;

  insert into public.premium_subscription_actions (
    subscription_id,
    subscription_id_snapshot,
    profile_id,
    profile_id_snapshot,
    plan_id,
    actor_id,
    actor_email_snapshot,
    action_type,
    previous_status,
    new_status,
    reason
  )
  values (
    v_subscription.id,
    v_subscription.id,
    v_subscription.profile_id,
    v_subscription.profile_id_snapshot,
    v_subscription.plan_id,
    p_actor_id,
    v_actor_email,
    'revoked'::public.premium_action_type,
    'active'::public.premium_subscription_status,
    'revoked'::public.premium_subscription_status,
    v_reason
  );

  return v_subscription;
end;
$$;

revoke all on function public.admin_revoke_premium_subscription(
  uuid, text, text, uuid
) from public, anon, authenticated;

grant execute on function public.admin_revoke_premium_subscription(
  uuid, text, text, uuid
) to service_role;
