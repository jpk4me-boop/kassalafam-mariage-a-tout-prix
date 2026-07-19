-- =============================================================================
-- KASSALAFAM — C1b — Expiration contrôlée et statut du membre connecté
-- =============================================================================

create or replace function public.expire_profile_premium_subscription(
  p_profile_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with expired as (
    update public.premium_subscriptions s
       set status = 'expired'::public.premium_subscription_status,
           updated_at = pg_catalog.now()
     where s.profile_id_snapshot = p_profile_id
       and s.status = 'active'::public.premium_subscription_status
       and s.ends_at <= pg_catalog.now()
    returning s.*
  ),
  logged as (
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
    select
      e.id,
      e.id,
      e.profile_id,
      e.profile_id_snapshot,
      e.plan_id,
      null,
      null,
      'expired'::public.premium_action_type,
      'active'::public.premium_subscription_status,
      'expired'::public.premium_subscription_status,
      'Expiration automatique de la période Premium.'
    from expired e
    returning 1
  )
  select count(*)::integer
    into v_count
    from logged;

  return coalesce(v_count, 0);
end;
$$;

revoke all on function public.expire_profile_premium_subscription(uuid)
  from public, anon, authenticated;
grant execute on function public.expire_profile_premium_subscription(uuid)
  to service_role;

create or replace function public.expire_due_premium_subscriptions(
  p_limit integer default 500
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_limit < 1 or p_limit > 5000 then
    raise exception 'LIMIT_OUT_OF_RANGE'
      using errcode = '22023';
  end if;

  with due as (
    select s.id
    from public.premium_subscriptions s
    where s.status = 'active'::public.premium_subscription_status
      and s.ends_at <= pg_catalog.now()
    order by s.ends_at, s.id
    for update skip locked
    limit p_limit
  ),
  expired as (
    update public.premium_subscriptions s
       set status = 'expired'::public.premium_subscription_status,
           updated_at = pg_catalog.now()
      from due
     where s.id = due.id
    returning s.*
  ),
  logged as (
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
    select
      e.id,
      e.id,
      e.profile_id,
      e.profile_id_snapshot,
      e.plan_id,
      null,
      null,
      'expired'::public.premium_action_type,
      'active'::public.premium_subscription_status,
      'expired'::public.premium_subscription_status,
      'Expiration automatique de la période Premium.'
    from expired e
    returning 1
  )
  select count(*)::integer
    into v_count
    from logged;

  return coalesce(v_count, 0);
end;
$$;

revoke all on function public.expire_due_premium_subscriptions(integer)
  from public, anon, authenticated;
grant execute on function public.expire_due_premium_subscriptions(integer)
  to service_role;

create or replace function public.get_my_premium_status()
returns table (
  is_premium boolean,
  subscription_id uuid,
  subscription_status public.premium_subscription_status,
  plan_code text,
  plan_name text,
  starts_at timestamptz,
  ends_at timestamptz,
  source public.premium_subscription_source
)
language plpgsql
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

  if not exists (
    select 1
    from public.profiles p
    where p.id = v_uid
  ) then
    raise exception 'PROFILE_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  perform public.expire_profile_premium_subscription(v_uid);

  return query
  select
    public.profile_has_active_premium(v_uid),
    s.id,
    s.status,
    p.code,
    p.display_name,
    s.starts_at,
    s.ends_at,
    s.source
  from (select 1) one
  left join lateral (
    select ps.*
    from public.premium_subscriptions ps
    where ps.profile_id_snapshot = v_uid
    order by
      (ps.status = 'active'::public.premium_subscription_status) desc,
      ps.created_at desc,
      ps.id desc
    limit 1
  ) s on true
  left join public.premium_plans p
    on p.id = s.plan_id;
end;
$$;

revoke all on function public.get_my_premium_status()
  from public, anon, authenticated, service_role;
grant execute on function public.get_my_premium_status()
  to authenticated, service_role;
