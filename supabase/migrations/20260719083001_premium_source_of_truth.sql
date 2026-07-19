-- =============================================================================
-- KASSALAFAM — C1b — Abonnement comme source de vérité de profiles.is_premium
-- =============================================================================

create or replace function public.premium_subscription_actions_no_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'PREMIUM_SUBSCRIPTION_ACTIONS_APPEND_ONLY'
      using errcode = '42501';
  end if;

  -- Les SET NULL provenant d'une suppression de FK sont les seules mutations
  -- techniques autorisées ; toutes les données snapshot restent immuables.
  if pg_trigger_depth() > 1
     and new.id is not distinct from old.id
     and new.subscription_id_snapshot is not distinct from old.subscription_id_snapshot
     and new.profile_id_snapshot is not distinct from old.profile_id_snapshot
     and new.plan_id is not distinct from old.plan_id
     and new.actor_email_snapshot is not distinct from old.actor_email_snapshot
     and new.action_type is not distinct from old.action_type
     and new.previous_status is not distinct from old.previous_status
     and new.new_status is not distinct from old.new_status
     and new.reason is not distinct from old.reason
     and new.created_at is not distinct from old.created_at
     and (
       new.subscription_id is not distinct from old.subscription_id
       or (old.subscription_id is not null and new.subscription_id is null)
     )
     and (
       new.profile_id is not distinct from old.profile_id
       or (old.profile_id is not null and new.profile_id is null)
     )
     and (
       new.actor_id is not distinct from old.actor_id
       or (old.actor_id is not null and new.actor_id is null)
     )
     and (
       (old.subscription_id is not null and new.subscription_id is null)
       or (old.profile_id is not null and new.profile_id is null)
       or (old.actor_id is not null and new.actor_id is null)
     )
  then
    return new;
  end if;

  raise exception 'PREMIUM_SUBSCRIPTION_ACTIONS_APPEND_ONLY'
    using errcode = '42501';
end;
$$;

revoke all on function public.premium_subscription_actions_no_mutation()
  from public, anon, authenticated, service_role;

create trigger trg_premium_subscription_actions_append_only
before update or delete on public.premium_subscription_actions
for each row execute function public.premium_subscription_actions_no_mutation();

create or replace function public.profile_has_active_premium(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.premium_subscriptions s
    where s.profile_id_snapshot = p_profile_id
      and s.status = 'active'::public.premium_subscription_status
      and s.starts_at <= pg_catalog.now()
      and s.ends_at > pg_catalog.now()
  );
$$;

-- Helper strictement interne, appelé uniquement par les fonctions propriétaires.
revoke all on function public.profile_has_active_premium(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.sync_profile_premium_flag(p_profile_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_premium boolean;
begin
  select public.profile_has_active_premium(p_profile_id)
    into v_is_premium;

  update public.profiles p
     set is_premium = v_is_premium
   where p.id = p_profile_id
     and p.is_premium is distinct from v_is_premium;

  return v_is_premium;
end;
$$;

revoke all on function public.sync_profile_premium_flag(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.premium_subscriptions_sync_profile_flag()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.sync_profile_premium_flag(old.profile_id_snapshot);
  end if;

  if tg_op in ('INSERT', 'UPDATE')
     and (
       tg_op = 'INSERT'
       or new.profile_id_snapshot is distinct from old.profile_id_snapshot
       or new.status is distinct from old.status
       or new.starts_at is distinct from old.starts_at
       or new.ends_at is distinct from old.ends_at
     )
  then
    perform public.sync_profile_premium_flag(new.profile_id_snapshot);
  end if;

  return coalesce(new, old);
end;
$$;

revoke all on function public.premium_subscriptions_sync_profile_flag()
  from public, anon, authenticated, service_role;

create trigger trg_premium_subscriptions_sync_profile_flag
after insert or update or delete on public.premium_subscriptions
for each row execute function public.premium_subscriptions_sync_profile_flag();

-- is_premium devient un cache strictement dérivé. Même service_role/postgres ne
-- peut plus le modifier directement ; seul l'UPDATE imbriqué du trigger ci-dessus
-- est accepté.
create or replace function public.guard_profiles_admin_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.is_premium is distinct from false then
      raise exception 'PROFILE_ADMIN_FIELDS_READ_ONLY'
        using errcode = '42501';
    end if;

    if auth.uid() is null then
      return new;
    end if;

    if new.verification_status
         is distinct from 'pending'::public.profile_verification_status
       or new.verification_reviewed_at is not null
       or new.verification_reviewed_by is not null
       or new.verification_rejection_reason is not null
       or new.account_status is distinct from 'active'::public.account_status
       or new.suspended_at is not null
       or new.suspended_by is not null
       or new.suspension_reason is not null
    then
      raise exception 'PROFILE_ADMIN_FIELDS_READ_ONLY'
        using errcode = '42501';
    end if;

    return new;
  end if;

  if new.is_premium is distinct from old.is_premium
     and pg_trigger_depth() <= 1
  then
    raise exception 'PROFILE_ADMIN_FIELDS_READ_ONLY'
      using errcode = '42501';
  end if;

  if auth.uid() is null then
    return new;
  end if;

  if new.verification_status
       is distinct from old.verification_status
     or new.verification_reviewed_at
       is distinct from old.verification_reviewed_at
     or new.verification_reviewed_by
       is distinct from old.verification_reviewed_by
     or new.verification_rejection_reason
       is distinct from old.verification_rejection_reason
     or new.account_status
       is distinct from old.account_status
     or new.suspended_at
       is distinct from old.suspended_at
     or new.suspended_by
       is distinct from old.suspended_by
     or new.suspension_reason
       is distinct from old.suspension_reason
     or new.is_premium
       is distinct from old.is_premium
  then
    raise exception 'PROFILE_ADMIN_FIELDS_READ_ONLY'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_profiles_admin_fields()
  from public, anon, authenticated, service_role;
