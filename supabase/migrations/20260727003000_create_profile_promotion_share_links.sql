-- =============================================================================
-- KASSALAFAM — MARIAGE À TOUT PRIX
-- Migration : liens promotionnels administrateur pour les réseaux sociaux
-- Date      : 2026-07-27
--
-- Objet :
--   Ajouter un backend sécurisé permettant à un administrateur authentifié de
--   créer des liens promotionnels opaques pour Facebook, WhatsApp, Instagram ou
--   Snapchat, uniquement pendant une autorisation promotionnelle active du
--   membre et uniquement pour les canaux qu’il a explicitement choisis.
--
-- Garanties :
--   * aucun profil n’est publié automatiquement ;
--   * aucune API Facebook, WhatsApp, Instagram ou Snapchat n’est appelée ;
--   * le jeton en clair est retourné une seule fois puis seul son hash SHA-256
--     est conservé ;
--   * plusieurs liens peuvent rester valides simultanément : créer un nouveau
--     partage ne casse pas les publications déjà diffusées ;
--   * chaque lien dure entre 1 heure et 30 jours et ne dépasse jamais
--     l’expiration du consentement promotionnel ;
--   * retrait/remplacement/expiration du consentement, suspension du compte,
--     perte de l’approbation, floutage des photos ou invalidation de la photo
--     choisie rendent immédiatement tous les liens concernés inutilisables ;
--   * table sans accès direct client, RLS active, écritures par RPC
--     SECURITY DEFINER exécutables uniquement par service_role ;
--   * aucune donnée existante modifiée et aucun backfill.
--
-- À NE PAS appliquer automatiquement à Supabase Production.
-- Attendre un GO explicite séparé.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Table d’historique des liens promotionnels.
-- -----------------------------------------------------------------------------
create table if not exists public.profile_promotion_share_links (
  id                  uuid primary key default gen_random_uuid(),
  profile_id          uuid not null
                      references public.profiles(id) on delete cascade,
  consent_id          uuid not null
                      references public.profile_promotion_consents(id)
                      on delete cascade,
  photo_id            uuid
                      references public.photos(id) on delete set null,
  channel             text not null,
  token_hash          bytea not null,
  token_prefix        text not null,
  created_by          uuid not null,
  created_at          timestamptz not null default now(),
  expires_at          timestamptz not null,
  revoked_at          timestamptz,
  revoked_by          uuid,
  revocation_reason   text,

  constraint profile_promotion_share_links_channel_valid
    check (channel in ('facebook', 'instagram', 'snapchat', 'whatsapp')),

  constraint profile_promotion_share_links_token_hash_unique
    unique (token_hash),

  constraint profile_promotion_share_links_token_hash_len
    check (octet_length(token_hash) = 32),

  constraint profile_promotion_share_links_token_prefix_len
    check (char_length(token_prefix) = 8),

  constraint profile_promotion_share_links_expiry_valid
    check (expires_at > created_at),

  constraint profile_promotion_share_links_revoked_coherence
    check ((revoked_at is null) = (revoked_by is null)),

  constraint profile_promotion_share_links_revoked_after_created
    check (revoked_at is null or revoked_at >= created_at),

  constraint profile_promotion_share_links_revocation_reason_valid
    check (
      revocation_reason is null
      or (
        revoked_at is not null
        and char_length(btrim(revocation_reason)) between 1 and 500
      )
    )
);

create index if not exists profile_promotion_share_links_profile_history_idx
  on public.profile_promotion_share_links(profile_id, created_at desc);

create index if not exists profile_promotion_share_links_consent_idx
  on public.profile_promotion_share_links(consent_id, created_at desc);

create index if not exists profile_promotion_share_links_channel_active_idx
  on public.profile_promotion_share_links(profile_id, channel, expires_at desc)
  where revoked_at is null;

-- -----------------------------------------------------------------------------
-- 2. RLS et privilèges : aucun accès direct navigateur.
-- -----------------------------------------------------------------------------
alter table public.profile_promotion_share_links enable row level security;

revoke all on table public.profile_promotion_share_links from public;
revoke all on table public.profile_promotion_share_links from anon;
revoke all on table public.profile_promotion_share_links from authenticated;
revoke all on table public.profile_promotion_share_links from service_role;
grant select on table public.profile_promotion_share_links to service_role;

-- -----------------------------------------------------------------------------
-- 3. Diagnostic d’éligibilité interne.
--
-- Codes stables :
--   eligible
--   profile_not_found
--   account_suspended
--   verification_required
--   onboarding_incomplete
--   profile_incomplete
--   photo_privacy_enabled
--   consent_required
--   consent_expired
--   channel_not_authorized
--   photo_required
--   photo_invalid
-- -----------------------------------------------------------------------------
create or replace function public.profile_promotion_share_eligibility_reason(
  p_profile_id uuid,
  p_channel text
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_consent public.profile_promotion_consents%rowtype;
  v_photo public.photos%rowtype;
  v_channel text := lower(btrim(coalesce(p_channel, '')));
begin
  select *
  into v_profile
  from public.profiles p
  where p.id = p_profile_id;

  if not found then
    return 'profile_not_found';
  end if;

  if v_profile.account_status <> 'active' then
    return 'account_suspended';
  end if;

  if v_profile.verification_status <> 'approved' then
    return 'verification_required';
  end if;

  if v_profile.onboarding_completed_at is null then
    return 'onboarding_incomplete';
  end if;

  if coalesce(btrim(v_profile.first_name), '') = ''
     or v_profile.birth_date is null
     or v_profile.birth_date > (current_date - interval '18 years')::date
     or coalesce(btrim(v_profile.country), '') = ''
     or coalesce(btrim(v_profile.city), '') = ''
     or coalesce(btrim(v_profile.bio), '') = ''
     or coalesce(btrim(v_profile.partner_expectations), '') = ''
     or v_profile.discovery_universe is null
     or v_profile.marital_status is null
  then
    return 'profile_incomplete';
  end if;

  if coalesce(v_profile.blur_photos, false) then
    return 'photo_privacy_enabled';
  end if;

  select *
  into v_consent
  from public.profile_promotion_consents c
  where c.profile_id = p_profile_id
    and c.withdrawn_at is null
  order by c.consented_at desc
  limit 1;

  if not found then
    return 'consent_required';
  end if;

  if v_consent.expires_at <= now() then
    return 'consent_expired';
  end if;

  if v_channel not in ('facebook', 'instagram', 'snapchat', 'whatsapp')
     or not (v_channel = any(v_consent.channels))
  then
    return 'channel_not_authorized';
  end if;

  if v_consent.photo_id is null then
    return 'photo_required';
  end if;

  select *
  into v_photo
  from public.photos ph
  where ph.id = v_consent.photo_id
    and ph.profile_id = p_profile_id;

  if not found
     or coalesce(v_photo.mime_type, '')
        not in ('image/jpeg', 'image/png', 'image/webp')
     or v_photo.size_bytes is null
     or v_photo.size_bytes < 1
     or v_photo.size_bytes > 3145728
     or v_photo.storage_path not like p_profile_id::text || '/%'
  then
    return 'photo_invalid';
  end if;

  return 'eligible';
end;
$$;

revoke all on function public.profile_promotion_share_eligibility_reason(uuid, text)
  from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. Création administrateur.
--
-- Le serveur applicatif valide la session admin avant de créer le client
-- service_role et transmet l’UUID de l’acteur. Le SQL vérifie que cet acteur
-- existe dans auth.users, comme les autres RPC administrateur du projet.
--
-- Plusieurs liens actifs sont autorisés. Pour limiter les abus, au plus
-- 20 liens encore valides par profil et par canal peuvent coexister.
-- -----------------------------------------------------------------------------
create or replace function public.create_profile_promotion_share_link(
  p_profile_id uuid,
  p_actor_id uuid,
  p_channel text,
  p_expires_at timestamptz default null
)
returns table (
  link_id uuid,
  token text,
  token_prefix text,
  channel text,
  expires_at timestamptz,
  consent_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_channel text := lower(btrim(coalesce(p_channel, '')));
  v_reason text;
  v_consent public.profile_promotion_consents%rowtype;
  v_expires timestamptz;
  v_token text;
  v_row public.profile_promotion_share_links%rowtype;
  v_active_count integer;
begin
  if p_actor_id is null
     or not exists (select 1 from auth.users u where u.id = p_actor_id)
  then
    raise exception 'ACTOR_NOT_FOUND' using errcode = '22023';
  end if;

  if v_channel not in ('facebook', 'instagram', 'snapchat', 'whatsapp') then
    raise exception 'INVALID_PROMOTION_CHANNEL' using errcode = '22023';
  end if;

  perform 1
  from public.profiles p
  where p.id = p_profile_id
  for update;

  if not found then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;

  select *
  into v_consent
  from public.profile_promotion_consents c
  where c.profile_id = p_profile_id
    and c.withdrawn_at is null
  order by c.consented_at desc
  limit 1
  for update;

  if not found then
    raise exception 'PROMOTION_CONSENT_REQUIRED' using errcode = '22023';
  end if;

  if v_consent.expires_at <= now() then
    raise exception 'PROMOTION_CONSENT_EXPIRED' using errcode = '22023';
  end if;

  if not (v_channel = any(v_consent.channels)) then
    raise exception 'PROMOTION_CHANNEL_NOT_AUTHORIZED' using errcode = '22023';
  end if;

  v_reason := public.profile_promotion_share_eligibility_reason(
    p_profile_id,
    v_channel
  );

  if v_reason <> 'eligible' then
    raise exception 'PROMOTION_PROFILE_NOT_SHAREABLE:%', v_reason
      using errcode = '22023';
  end if;

  v_expires := coalesce(
    p_expires_at,
    least(now() + interval '7 days', v_consent.expires_at)
  );

  if v_expires < now() + interval '1 hour' then
    raise exception 'EXPIRY_TOO_SHORT' using errcode = '22023';
  end if;

  if v_expires > now() + interval '30 days' then
    raise exception 'EXPIRY_TOO_LONG' using errcode = '22023';
  end if;

  if v_expires > v_consent.expires_at then
    raise exception 'EXPIRY_EXCEEDS_PROMOTION_CONSENT'
      using errcode = '22023';
  end if;

  -- Les liens expirés restent en historique mais sont marqués révoqués pour que
  -- le volume "actif" ne soit jamais ambigu.
  update public.profile_promotion_share_links l
  set revoked_at = now(),
      revoked_by = p_actor_id,
      revocation_reason = 'Expiration constatée lors d’une nouvelle création.'
  where l.profile_id = p_profile_id
    and l.channel = v_channel
    and l.revoked_at is null
    and l.expires_at <= now();

  select count(*)::integer
  into v_active_count
  from public.profile_promotion_share_links l
  where l.profile_id = p_profile_id
    and l.consent_id = v_consent.id
    and l.channel = v_channel
    and l.revoked_at is null
    and l.expires_at > now();

  if v_active_count >= 20 then
    raise exception 'ACTIVE_PROMOTION_LINK_LIMIT_REACHED'
      using errcode = '54000';
  end if;

  v_token := replace(
    replace(
      rtrim(encode(extensions.gen_random_bytes(32), 'base64'), '='),
      '+',
      '-'
    ),
    '/',
    '_'
  );

  insert into public.profile_promotion_share_links(
    profile_id,
    consent_id,
    photo_id,
    channel,
    token_hash,
    token_prefix,
    created_by,
    expires_at
  )
  values (
    p_profile_id,
    v_consent.id,
    v_consent.photo_id,
    v_channel,
    extensions.digest(v_token, 'sha256'),
    left(v_token, 8),
    p_actor_id,
    v_expires
  )
  returning * into v_row;

  return query
  select
    v_row.id,
    v_token,
    v_row.token_prefix,
    v_row.channel,
    v_row.expires_at,
    v_consent.expires_at;
end;
$$;

revoke all on function public.create_profile_promotion_share_link(
  uuid, uuid, text, timestamptz
) from public, anon, authenticated;

grant execute on function public.create_profile_promotion_share_link(
  uuid, uuid, text, timestamptz
) to service_role;

-- -----------------------------------------------------------------------------
-- 5. Révocation administrateur, idempotente.
-- -----------------------------------------------------------------------------
create or replace function public.revoke_profile_promotion_share_link(
  p_link_id uuid,
  p_actor_id uuid,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link public.profile_promotion_share_links%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if p_actor_id is null
     or not exists (select 1 from auth.users u where u.id = p_actor_id)
  then
    raise exception 'ACTOR_NOT_FOUND' using errcode = '22023';
  end if;

  if v_reason is not null and char_length(v_reason) > 500 then
    raise exception 'REASON_LENGTH_INVALID' using errcode = '22023';
  end if;

  select *
  into v_link
  from public.profile_promotion_share_links l
  where l.id = p_link_id
  for update;

  if not found then
    raise exception 'PROMOTION_LINK_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_link.revoked_at is not null then
    return false;
  end if;

  update public.profile_promotion_share_links
  set revoked_at = now(),
      revoked_by = p_actor_id,
      revocation_reason = coalesce(
        v_reason,
        'Révocation manuelle par un administrateur.'
      )
  where id = p_link_id;

  return true;
end;
$$;

revoke all on function public.revoke_profile_promotion_share_link(
  uuid, uuid, text
) from public, anon, authenticated;

grant execute on function public.revoke_profile_promotion_share_link(
  uuid, uuid, text
) to service_role;

-- -----------------------------------------------------------------------------
-- 6. Résolution publique côté serveur.
--
-- Toute cause d’invalidité renvoie zéro ligne, sans détail.
-- -----------------------------------------------------------------------------
create or replace function public.resolve_profile_promotion_share_link(
  p_token text
)
returns table (
  link_id uuid,
  profile_id uuid,
  consent_id uuid,
  photo_id uuid,
  channel text,
  expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then
    return;
  end if;

  return query
  select
    l.id,
    l.profile_id,
    l.consent_id,
    l.photo_id,
    l.channel,
    l.expires_at
  from public.profile_promotion_share_links l
  join public.profile_promotion_consents c
    on c.id = l.consent_id
   and c.profile_id = l.profile_id
   and c.photo_id = l.photo_id
  where l.token_hash = extensions.digest(p_token, 'sha256')
    and l.revoked_at is null
    and l.expires_at > now()
    and c.withdrawn_at is null
    and c.expires_at > now()
    and l.expires_at <= c.expires_at
    and l.channel = any(c.channels)
    and public.profile_promotion_share_eligibility_reason(
      l.profile_id,
      l.channel
    ) = 'eligible';
end;
$$;

revoke all on function public.resolve_profile_promotion_share_link(text)
  from public, anon, authenticated;

grant execute on function public.resolve_profile_promotion_share_link(text)
  to service_role;

-- -----------------------------------------------------------------------------
-- 7. Métadonnées des liens pour le back-office.
-- -----------------------------------------------------------------------------
create or replace function public.admin_list_profile_promotion_share_links(
  p_profile_id uuid default null
)
returns table (
  link_id uuid,
  profile_id uuid,
  consent_id uuid,
  photo_id uuid,
  token_prefix text,
  channel text,
  created_by uuid,
  created_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid,
  revocation_reason text,
  status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    l.id,
    l.profile_id,
    l.consent_id,
    l.photo_id,
    l.token_prefix,
    l.channel,
    l.created_by,
    l.created_at,
    l.expires_at,
    l.revoked_at,
    l.revoked_by,
    l.revocation_reason,
    case
      when l.revoked_at is not null then 'revoked'
      when l.expires_at <= now() then 'expired'
      when not exists (
        select 1
        from public.profile_promotion_consents c
        where c.id = l.consent_id
          and c.profile_id = l.profile_id
          and c.photo_id = l.photo_id
          and c.withdrawn_at is null
          and c.expires_at > now()
          and l.expires_at <= c.expires_at
          and l.channel = any(c.channels)
      ) then 'invalidated'
      when public.profile_promotion_share_eligibility_reason(
        l.profile_id,
        l.channel
      ) <> 'eligible' then 'invalidated'
      else 'active'
    end
  from public.profile_promotion_share_links l
  where p_profile_id is null or l.profile_id = p_profile_id
  order by l.created_at desc;
$$;

revoke all on function public.admin_list_profile_promotion_share_links(uuid)
  from public, anon, authenticated;

grant execute on function public.admin_list_profile_promotion_share_links(uuid)
  to service_role;

-- -----------------------------------------------------------------------------
-- 8. Statut promotionnel groupé pour les cartes de /admin/members.
-- -----------------------------------------------------------------------------
create or replace function public.admin_get_profile_promotion_share_status(
  p_profile_ids uuid[]
)
returns table (
  profile_id uuid,
  consent_id uuid,
  photo_id uuid,
  channels text[],
  consented_at timestamptz,
  consent_expires_at timestamptz,
  effectively_shareable boolean,
  eligibility_reason text,
  active_link_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with requested as (
    select distinct value as profile_id
    from unnest(coalesce(p_profile_ids, array[]::uuid[])) as value
  ),
  active_consent as (
    select distinct on (c.profile_id)
      c.profile_id,
      c.id as consent_id,
      c.photo_id,
      c.channels,
      c.consented_at,
      c.expires_at
    from public.profile_promotion_consents c
    join requested r on r.profile_id = c.profile_id
    where c.withdrawn_at is null
    order by c.profile_id, c.consented_at desc
  ),
  evaluated as (
    select
      r.profile_id,
      c.consent_id,
      c.photo_id,
      c.channels,
      c.consented_at,
      c.expires_at,
      case
        when c.consent_id is null then 'consent_required'
        when c.expires_at <= now() then 'consent_expired'
        else public.profile_promotion_share_eligibility_reason(
          r.profile_id,
          c.channels[1]
        )
      end as reason
    from requested r
    left join active_consent c on c.profile_id = r.profile_id
  )
  select
    e.profile_id,
    e.consent_id,
    e.photo_id,
    coalesce(e.channels, array[]::text[]),
    e.consented_at,
    e.expires_at,
    e.reason = 'eligible',
    e.reason,
    (
      select count(*)
      from public.profile_promotion_share_links l
      where l.profile_id = e.profile_id
        and l.consent_id = e.consent_id
        and l.photo_id = e.photo_id
        and l.revoked_at is null
        and l.expires_at > now()
        and l.expires_at <= e.expires_at
        and l.channel = any(e.channels)
        and public.profile_promotion_share_eligibility_reason(
          l.profile_id,
          l.channel
        ) = 'eligible'
    )
  from evaluated e
  order by e.profile_id;
$$;

revoke all on function public.admin_get_profile_promotion_share_status(uuid[])
  from public, anon, authenticated;

grant execute on function public.admin_get_profile_promotion_share_status(uuid[])
  to service_role;
