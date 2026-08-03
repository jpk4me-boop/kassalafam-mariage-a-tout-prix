-- =============================================================================
-- KASSALAFAM — MARIAGE À TOUT PRIX
-- Migration : fondation des notifications WhatsApp (PR A — fiche validée 03/08)
-- Date      : 2026-08-03 (soir — version > 20260803210000, règle du §3)
--
-- Objet     : trois étages, AUCUN envoi réseau (l'adapter et le cron arrivent
--             en PR B ; le flag WHATSAPP_NOTIFICATIONS_ENABLED restera false) :
--
--             1. ÉVÉNEMENTS SOURCE → member_notifications devient une vraie
--                source de vérité : jusqu'ici seules les décisions de
--                vérification créaient des notifications internes (constat
--                production du 03/08 : 15 lignes, toutes verification_*).
--                Triggers ajoutés :
--                  - nouveau message reçu        (AFTER INSERT messages)
--                  - nouvel intérêt reçu         (AFTER INSERT matches pending)
--                  - intérêt accepté             (AFTER UPDATE matches → accepted)
--                JAMAIS le contenu du message ni le nom d'un autre membre dans
--                title/body (règle CLAUDE.md). Anti-rafale : pas de doublon
--                tant qu'une notification du même type reste NON LUE.
--
--             2. CONSENTEMENTS PAR CANAL — notification_channel_consents :
--                opt-in EXPLICITE et dédié (donner son numéro ≠ accepter d'être
--                notifié), retrait immédiat, jamais activé par défaut. RPC
--                membre grant/withdraw/status ; écriture UNIQUEMENT par RPC.
--                `channel` accepte déjà 'push' pour la phase PWA future.
--
--             3. FILE DE LIVRAISON — notification_deliveries : trigger
--                d'enfilement sur member_notifications (types autorisés +
--                consentement actif + numéro présent + compte actif + dédup
--                sur les livraisons en attente). États terminaux IMMUABLES
--                (pattern SebPay). Table service_role uniquement.
--
-- Sécurité  : migration ADDITIVE, aucune reprise de données, aucun backfill
--             (les notifications passées ne génèrent AUCUNE livraison).
--             RPC SECURITY DEFINER : search_path fixé, auth.uid() vérifié,
--             GRANT minimaux. Idempotente (IF NOT EXISTS / OR REPLACE / DROP
--             TRIGGER IF EXISTS).
--
-- ⚠️ À NE PAS appliquer automatiquement : attendre le GO explicite.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Consentements par canal ---------------------------------------------------
-- ---------------------------------------------------------------------------
create table if not exists public.notification_channel_consents (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  channel text not null,
  granted_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  constraint notification_channel_consents_channel_chk
    check (channel in ('whatsapp', 'push')),
  constraint notification_channel_consents_unique unique (profile_id, channel)
);

comment on table public.notification_channel_consents is
  'Consentement EXPLICITE du membre à recevoir les notifications KASSALAFAM '
  'sur un canal externe (whatsapp aujourd''hui, push demain). Une ligne par '
  '(membre, canal) ; retrait = withdrawn_at posé. Écriture UNIQUEMENT par les '
  'RPC grant_my_/withdraw_my_ — jamais activé par défaut.';

alter table public.notification_channel_consents enable row level security;

drop policy if exists notification_channel_consents_select_own
  on public.notification_channel_consents;
create policy notification_channel_consents_select_own
  on public.notification_channel_consents
  for select to authenticated
  using (profile_id = (select auth.uid()));

revoke all on public.notification_channel_consents from public;
revoke all on public.notification_channel_consents from anon;
grant select on public.notification_channel_consents to authenticated;

-- ---------------------------------------------------------------------------
-- 2. RPC membre : statut / accord / retrait ------------------------------------
-- ---------------------------------------------------------------------------
create or replace function public.get_my_whatsapp_notifications_status()
returns table(has_phone boolean, consent_active boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(pg_catalog.btrim(p.whatsapp_phone), '') <> '' as has_phone,
    exists (
      select 1 from public.notification_channel_consents c
      where c.profile_id = (select auth.uid())
        and c.channel = 'whatsapp'
        and c.withdrawn_at is null
    ) as consent_active
  from public.profiles p
  where p.id = (select auth.uid());
$$;

create or replace function public.grant_my_whatsapp_notifications()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_phone text;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'NOTIFICATIONS_AUTH_REQUIRED' using errcode = '42501';
  end if;

  select whatsapp_phone into v_phone
  from public.profiles where id = v_uid;

  if coalesce(pg_catalog.btrim(v_phone), '') = '' then
    raise exception 'NOTIFICATIONS_PHONE_REQUIRED';
  end if;

  insert into public.notification_channel_consents (profile_id, channel)
  values (v_uid, 'whatsapp')
  on conflict (profile_id, channel)
  do update set granted_at = pg_catalog.now(), withdrawn_at = null;
end;
$$;

create or replace function public.withdraw_my_whatsapp_notifications()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'NOTIFICATIONS_AUTH_REQUIRED' using errcode = '42501';
  end if;

  update public.notification_channel_consents
     set withdrawn_at = pg_catalog.now()
   where profile_id = v_uid
     and channel = 'whatsapp'
     and withdrawn_at is null;
end;
$$;

revoke all on function public.get_my_whatsapp_notifications_status() from public;
revoke all on function public.get_my_whatsapp_notifications_status() from anon;
grant execute on function public.get_my_whatsapp_notifications_status() to authenticated;

revoke all on function public.grant_my_whatsapp_notifications() from public;
revoke all on function public.grant_my_whatsapp_notifications() from anon;
grant execute on function public.grant_my_whatsapp_notifications() to authenticated;

revoke all on function public.withdraw_my_whatsapp_notifications() from public;
revoke all on function public.withdraw_my_whatsapp_notifications() from anon;
grant execute on function public.withdraw_my_whatsapp_notifications() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. File de livraison ---------------------------------------------------------
-- ---------------------------------------------------------------------------
create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null
    references public.member_notifications(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  channel text not null,
  event_type text not null,
  status text not null default 'pending',
  attempts integer not null default 0,
  -- Diagnostic technique UNIQUEMENT : jamais de donnée personnelle ici.
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  constraint notification_deliveries_channel_chk
    check (channel in ('whatsapp', 'push')),
  constraint notification_deliveries_status_chk
    check (status in ('pending', 'sent', 'failed', 'skipped')),
  constraint notification_deliveries_attempts_chk
    check (attempts between 0 and 10)
);

comment on table public.notification_deliveries is
  'File de livraison des notifications vers les canaux externes. '
  'member_notifications reste la SOURCE DE VÉRITÉ : une ligne ici n''est '
  'qu''une tentative de livraison secondaire. États terminaux immuables. '
  'Aucun accès membre : service_role uniquement (dispatcher cron + admin).';

create index if not exists notification_deliveries_pending_idx
  on public.notification_deliveries (channel, created_at)
  where status = 'pending';

alter table public.notification_deliveries enable row level security;
revoke all on public.notification_deliveries from public;
revoke all on public.notification_deliveries from anon;
revoke all on public.notification_deliveries from authenticated;

-- États terminaux immuables (pattern SebPay).
create or replace function public.notification_deliveries_guard_terminal()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status in ('sent', 'failed', 'skipped')
     and new.status is distinct from old.status then
    raise exception 'DELIVERY_TERMINAL_STATUS_IMMUTABLE';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notification_deliveries_guard_terminal
  on public.notification_deliveries;
create trigger trg_notification_deliveries_guard_terminal
  before update on public.notification_deliveries
  for each row execute function public.notification_deliveries_guard_terminal();

-- ---------------------------------------------------------------------------
-- 4. Enfilement : member_notifications → notification_deliveries ---------------
-- ---------------------------------------------------------------------------
create or replace function public.enqueue_whatsapp_delivery()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Types autorisés (V1 — fiche validée) : tout autre type est ignoré.
  if new.type not in (
    'new_message', 'new_interest', 'interest_accepted',
    'verification_approved', 'verification_rejected', 'verification_paused',
    'account_security'
  ) then
    return new;
  end if;

  -- Consentement actif + numéro présent + compte actif, sinon rien (silencieux).
  if not exists (
    select 1
    from public.notification_channel_consents c
    join public.profiles p on p.id = c.profile_id
    where c.profile_id = new.user_id
      and c.channel = 'whatsapp'
      and c.withdrawn_at is null
      and coalesce(pg_catalog.btrim(p.whatsapp_phone), '') <> ''
      and p.account_status = 'active'::public.account_status
  ) then
    return new;
  end if;

  -- Anti-rafale : une seule livraison EN ATTENTE par (membre, type).
  if exists (
    select 1 from public.notification_deliveries d
    where d.profile_id = new.user_id
      and d.channel = 'whatsapp'
      and d.event_type = new.type
      and d.status = 'pending'
  ) then
    return new;
  end if;

  insert into public.notification_deliveries
    (notification_id, profile_id, channel, event_type)
  values (new.id, new.user_id, 'whatsapp', new.type);

  return new;
end;
$$;

drop trigger if exists trg_member_notifications_enqueue_whatsapp
  on public.member_notifications;
create trigger trg_member_notifications_enqueue_whatsapp
  after insert on public.member_notifications
  for each row execute function public.enqueue_whatsapp_delivery();

-- ---------------------------------------------------------------------------
-- 5. Événements source → member_notifications ----------------------------------
--    (la source de vérité s'alimente EN BASE, là où les écritures ont lieu.)
-- ---------------------------------------------------------------------------

-- 5a. Nouveau message reçu — JAMAIS le contenu ni le nom de l'expéditeur.
--     Anti-rafale : pas de doublon tant qu'une notification new_message du
--     même expéditeur reste NON LUE.
create or replace function public.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipient uuid;
begin
  select case when m.user_a = new.sender_id then m.user_b else m.user_a end
    into v_recipient
  from public.matches m
  where m.id = new.match_id;

  if v_recipient is null then
    return new;
  end if;

  if exists (
    select 1 from public.member_notifications n
    where n.user_id = v_recipient
      and n.type = 'new_message'
      and n.related_profile_id = new.sender_id
      and n.read_at is null
  ) then
    return new;
  end if;

  insert into public.member_notifications (user_id, type, title, body, related_profile_id)
  values (
    v_recipient,
    'new_message',
    'Nouveau message',
    'Vous avez reçu un nouveau message. Ouvrez votre messagerie pour le lire.',
    new.sender_id
  );

  return new;
end;
$$;

drop trigger if exists trg_messages_notify_new_message on public.messages;
create trigger trg_messages_notify_new_message
  after insert on public.messages
  for each row execute function public.notify_new_message();

-- 5b. Nouvel intérêt reçu (match créé en pending → user_b est le destinataire).
create or replace function public.notify_new_interest()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'pending' then
    return new;
  end if;

  if exists (
    select 1 from public.member_notifications n
    where n.user_id = new.user_b
      and n.type = 'new_interest'
      and n.related_profile_id = new.user_a
      and n.read_at is null
  ) then
    return new;
  end if;

  insert into public.member_notifications (user_id, type, title, body, related_profile_id)
  values (
    new.user_b,
    'new_interest',
    'Nouvel intérêt',
    'Un membre s''intéresse à votre profil. Découvrez qui dans vos intérêts reçus.',
    new.user_a
  );

  return new;
end;
$$;

drop trigger if exists trg_matches_notify_new_interest on public.matches;
create trigger trg_matches_notify_new_interest
  after insert on public.matches
  for each row execute function public.notify_new_interest();

-- 5c. Intérêt accepté (pending → accepted : user_a, l'initiateur, est notifié).
create or replace function public.notify_interest_accepted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status is not distinct from new.status
     or new.status <> 'accepted' then
    return new;
  end if;

  insert into public.member_notifications (user_id, type, title, body, related_profile_id)
  values (
    new.user_a,
    'interest_accepted',
    'Intérêt accepté',
    'Votre intérêt a été accepté. Vous pouvez maintenant échanger par message.',
    new.user_b
  );

  return new;
end;
$$;

drop trigger if exists trg_matches_notify_interest_accepted on public.matches;
create trigger trg_matches_notify_interest_accepted
  after update on public.matches
  for each row execute function public.notify_interest_accepted();
