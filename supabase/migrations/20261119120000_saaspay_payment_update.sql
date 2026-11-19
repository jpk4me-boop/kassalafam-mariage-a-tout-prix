-- =============================================================================
-- KASSALAFAM — Saaspay — Transition autoritative d'un paiement + activation
--
-- Migration ADDITIVE : aucune table ni fonction existante n'est modifiée.
-- La signature (X-Webhook-Signature, HMAC-SHA256 de `{timestamp}.{corps}`)
-- est vérifiée côté application AVANT tout appel à cette RPC. Reprend la
-- machine à états de apply_sebpay_payment_update (journal idempotent dans
-- payment_webhook_events, états terminaux immuables, cohérence montant/devise,
-- activation Premium via premium_subscriptions — profiles.is_premium n'est
-- JAMAIS écrit ici) avec provider = 'saaspay' et le statut CANCELLED en plus.
-- =============================================================================

create or replace function public.apply_saaspay_payment_update(
  p_provider_reference text,
  p_raw_status text,
  p_mapped_status text,
  p_amount_xaf integer,
  p_currency text
)
returns table (
  processing_result text,
  transaction_id uuid,
  subscription_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider_reference text := btrim(coalesce(p_provider_reference, ''));
  v_raw_status text := btrim(coalesce(p_raw_status, ''));
  v_currency text := nullif(upper(btrim(coalesce(p_currency, ''))), '');
  v_mapped public.payment_transaction_status;
  v_tx public.payment_transactions%rowtype;
  v_profile public.profiles%rowtype;
  v_plan public.premium_plans%rowtype;
  v_subscription public.premium_subscriptions%rowtype;
  v_result text;
  v_subscription_id uuid := null;
  v_now timestamptz := pg_catalog.now();
begin
  if char_length(v_provider_reference) < 2
     or char_length(v_provider_reference) > 200
  then
    raise exception 'PROVIDER_REFERENCE_INVALID'
      using errcode = '22023';
  end if;

  if char_length(v_raw_status) < 2 or char_length(v_raw_status) > 100 then
    raise exception 'RAW_STATUS_INVALID'
      using errcode = '22023';
  end if;

  -- Seules les transitions du contrat Saaspay sont acceptées ; tout le reste
  -- échoue fermé AVANT toute écriture (le mapping fail-closed est déjà fait
  -- côté application par mapSaaspayStatus).
  if p_mapped_status is null
     or p_mapped_status not in ('pending', 'succeeded', 'failed', 'cancelled')
  then
    raise exception 'MAPPED_STATUS_INVALID'
      using errcode = '22023';
  end if;

  v_mapped := p_mapped_status::public.payment_transaction_status;

  -- Verrouillage par référence fournisseur : l'identifiant Saaspay du
  -- paiement (`data.id`) est enregistré dès l'initiation.
  select *
    into v_tx
    from public.payment_transactions t
   where t.provider = 'saaspay'
     and t.provider_reference = v_provider_reference
   for update;

  if v_tx.id is null then
    -- Aucune transaction connue : journalisé, aucune écriture métier.
    v_result := 'unmatched';
  elsif v_tx.status in (
    'succeeded'::public.payment_transaction_status,
    'failed'::public.payment_transaction_status,
    'cancelled'::public.payment_transaction_status,
    'refunded'::public.payment_transaction_status
  ) then
    -- Terminal = immuable : rejeux et rappels tardifs sans effet.
    v_result := 'noop_already_final';
  elsif v_mapped = 'pending'::public.payment_transaction_status then
    if v_tx.status = 'initiated'::public.payment_transaction_status then
      update public.payment_transactions t
         set status = 'pending'::public.payment_transaction_status,
             provider_reference = v_provider_reference,
             updated_at = v_now
       where t.id = v_tx.id;

      v_result := 'applied_pending';
    else
      v_result := 'noop_unchanged';
    end if;
  elsif v_mapped = 'failed'::public.payment_transaction_status then
    update public.payment_transactions t
       set status = 'failed'::public.payment_transaction_status,
           provider_reference = v_provider_reference,
           completed_at = v_now,
           failure_code = lower(v_raw_status),
           updated_at = v_now
     where t.id = v_tx.id;

    v_result := 'applied_failed';
  elsif v_mapped = 'cancelled'::public.payment_transaction_status then
    update public.payment_transactions t
       set status = 'cancelled'::public.payment_transaction_status,
           completed_at = v_now,
           updated_at = v_now
     where t.id = v_tx.id;

    v_result := 'applied_cancelled';
  else
    -- v_mapped = succeeded : cohérence montant/devise obligatoire.
    if p_amount_xaf is null
       or p_amount_xaf is distinct from v_tx.amount_xaf
       or v_currency is distinct from 'XAF'
    then
      -- Fail-closed : rien n'est écrit, l'écart est journalisé pour audit.
      v_result := 'amount_mismatch';
    else
      -- Paiement confirmé : la transaction devient succeeded dans tous les
      -- cas ci-dessous ; l'abonnement n'est créé que si le profil est actif
      -- et sans période Premium déjà active (cas bloqués journalisés,
      -- résolution via les outils admin).
      select *
        into v_profile
        from public.profiles pr
       where pr.id = v_tx.profile_id_snapshot
       for update;

      if v_profile.id is null then
        v_result := 'succeeded_activation_blocked_profile_missing';
      elsif v_profile.account_status <> 'active'::public.account_status then
        v_result := 'succeeded_activation_blocked_account_inactive';
      else
        perform public.expire_profile_premium_subscription(
          v_tx.profile_id_snapshot
        );

        if exists (
          select 1
          from public.premium_subscriptions s
          where s.profile_id_snapshot = v_tx.profile_id_snapshot
            and s.status = 'active'::public.premium_subscription_status
            and s.ends_at > v_now
        ) then
          v_result := 'succeeded_activation_blocked_active_premium';
        else
          select *
            into v_plan
            from public.premium_plans pl
           where pl.id = v_tx.plan_id;

          insert into public.premium_subscriptions (
            profile_id,
            profile_id_snapshot,
            plan_id,
            status,
            source,
            starts_at,
            ends_at,
            provider,
            provider_subscription_ref
          )
          values (
            v_profile.id,
            v_tx.profile_id_snapshot,
            v_tx.plan_id,
            'active'::public.premium_subscription_status,
            'payment'::public.premium_subscription_source,
            v_now,
            v_now + pg_catalog.make_interval(days => v_plan.duration_days),
            'saaspay',
            v_provider_reference
          )
          returning *
            into v_subscription;

          v_subscription_id := v_subscription.id;

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
            v_profile.id,
            v_tx.profile_id_snapshot,
            v_tx.plan_id,
            null,
            null,
            'payment_activated'::public.premium_action_type,
            null,
            'active'::public.premium_subscription_status,
            'Activation automatique après confirmation du paiement Saaspay.'
          );

          v_result := 'applied_succeeded';
        end if;
      end if;

      update public.payment_transactions t
         set status = 'succeeded'::public.payment_transaction_status,
             provider_reference = v_provider_reference,
             completed_at = v_now,
             subscription_id = v_subscription_id,
             updated_at = v_now
       where t.id = v_tx.id;
    end if;
  end if;

  -- Journal en dernier : best-effort de traçabilité. En cas de rejeu du même
  -- couple (référence, statut), la ligne existante est conservée telle quelle
  -- — les transitions ci-dessus sont déjà des no-ops dans ce cas.
  insert into public.payment_webhook_events (
    provider,
    provider_reference,
    external_reference,
    raw_status,
    mapped_status,
    amount_xaf,
    currency,
    processing_result,
    transaction_id,
    transaction_id_snapshot
  )
  values (
    'saaspay',
    v_provider_reference,
    null,
    v_raw_status,
    v_mapped,
    p_amount_xaf,
    v_currency,
    v_result,
    v_tx.id,
    v_tx.id
  )
  on conflict on constraint payment_webhook_events_dedupe_unique do nothing;

  return query select v_result, v_tx.id, v_subscription_id;
end;
$$;

revoke all on function public.apply_saaspay_payment_update(
  text, text, text, integer, text
) from public, anon, authenticated;

grant execute on function public.apply_saaspay_payment_update(
  text, text, text, integer, text
) to service_role;
