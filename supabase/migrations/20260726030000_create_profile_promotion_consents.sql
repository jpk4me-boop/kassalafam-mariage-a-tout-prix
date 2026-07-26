-- =============================================================================
-- KASSALAFAM  MARIAGE À TOUT PRIX
-- Consentement promotionnel des profils sur les réseaux sociaux
-- Date : 2026-07-26
--
-- OBJET
--   Consentement DISTINCT du partage public limité existant.
--   Un membre choisit :
--     - une photo lui appartenant ;
--     - un ou plusieurs réseaux autorisés ;
--     - une durée autorisée : 7, 30 ou 90 jours.
--
-- HISTORIQUE
--   Toute modification remplace le consentement actif par une NOUVELLE ligne.
--   L’ancienne ligne est conservée avec withdrawal_reason = 'replaced'.
--   Le retrait manuel conserve également la ligne.
--
-- SÉCURITÉ
--   - RLS : un membre ne lit que son propre historique ;
--   - aucune écriture directe anon/authenticated ;
--   - écritures exclusivement via RPC SECURITY DEFINER ;
--   - profile_id dérive uniquement de auth.uid() ;
--   - la photo doit appartenir au membre authentifié ;
--   - texte et version du consentement définis côté serveur.
--
-- Cette migration ne crée aucune campagne, publication ou intégration sociale.
-- Elle ne publie aucun profil et n’effectue aucune action externe.
--
-- NE PAS appliquer automatiquement à Supabase Production.
-- =============================================================================

create table if not exists public.profile_promotion_consents (
  id uuid primary key default gen_random_uuid(),

  profile_id uuid not null
    references public.profiles(id)
    on delete cascade,

  -- Une suppression ultérieure de la photo ne supprime pas l’historique légal.
  -- La ligne reste conservée mais devient inutilisable pour une publication.
  photo_id uuid
    references public.photos(id)
    on delete set null,

  policy_version text not null,
  consent_text text not null,

  channels text[] not null,
  duration_days integer not null,

  consented_at timestamptz not null default now(),
  expires_at timestamptz not null,

  withdrawn_at timestamptz,
  withdrawn_by uuid,
  withdrawal_reason text,

  created_at timestamptz not null default now(),

  constraint profile_promotion_consents_channels_valid
    check (
      cardinality(channels) between 1 and 4
      and array_position(channels, null) is null
      and channels <@ array[
        'facebook',
        'instagram',
        'snapchat',
        'whatsapp'
      ]::text[]
    ),

  constraint profile_promotion_consents_duration_valid
    check (duration_days in (7, 30, 90)),

  constraint profile_promotion_consents_expiry_valid
    check (expires_at > consented_at),

  constraint profile_promotion_consents_withdrawal_coherence
    check (
      (
        withdrawn_at is null
        and withdrawn_by is null
        and withdrawal_reason is null
      )
      or
      (
        withdrawn_at is not null
        and withdrawn_by is not null
        and withdrawal_reason in (
          'member_withdrawn',
          'replaced',
          'expired'
        )
      )
    )
);

-- Une seule autorisation non clôturée à la fois par membre.
-- Une ligne arrivée à expiration est clôturée par la RPC avant tout nouveau
-- consentement.
create unique index if not exists profile_promotion_consents_one_active
  on public.profile_promotion_consents(profile_id)
  where withdrawn_at is null;

create index if not exists profile_promotion_consents_profile_history_idx
  on public.profile_promotion_consents(profile_id, consented_at desc);

create index if not exists profile_promotion_consents_expiry_idx
  on public.profile_promotion_consents(expires_at)
  where withdrawn_at is null;

-- ---------------------------------------------------------------------------
-- RLS et privilèges
-- ---------------------------------------------------------------------------

alter table public.profile_promotion_consents enable row level security;

drop policy if exists profile_promotion_consents_select_own
  on public.profile_promotion_consents;

create policy profile_promotion_consents_select_own
  on public.profile_promotion_consents
  for select
  to authenticated
  using (profile_id = (select auth.uid()));

revoke all on table public.profile_promotion_consents from public;
revoke all on table public.profile_promotion_consents from anon;
revoke all on table public.profile_promotion_consents from authenticated;

grant select on table public.profile_promotion_consents to authenticated;

-- ---------------------------------------------------------------------------
-- RPC : set_my_profile_promotion_consent
--
-- Toute activation ou modification crée une nouvelle ligne :
--   1. fermeture des anciennes lignes expirées ;
--   2. remplacement éventuel du consentement actif ;
--   3. insertion d’une nouvelle autorisation.
-- ---------------------------------------------------------------------------

create or replace function public.set_my_profile_promotion_consent(
  p_photo_id uuid,
  p_channels text[],
  p_duration_days integer
)
returns table (
  consent_id uuid,
  photo_id uuid,
  channels text[],
  duration_days integer,
  consented_at timestamptz,
  expires_at timestamptz,
  replaced_previous boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());

  v_version constant text := '2026-07-social-v1';

  v_text constant text :=
    'J’autorise KASSALAFAM à utiliser la photo que je sélectionne et une présentation limitée de mon profil à des fins de promotion de la plateforme sur les réseaux sociaux que je choisis, pendant la durée indiquée. Je peux retirer cette autorisation à tout moment pour les nouvelles publications.';

  v_channels text[];
  v_now timestamptz := now();
  v_expiry timestamptz;
  v_replaced boolean := false;
  v_count integer;

  v_row public.profile_promotion_consents%rowtype;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED'
      using errcode = '42501';
  end if;

  -- Le verrou du profil sérialise les demandes concurrentes du même membre.
  perform 1
  from public.profiles
  where id = v_uid
  for update;

  if not found then
    raise exception 'PROFILE_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if p_duration_days not in (7, 30, 90) then
    raise exception 'INVALID_PROMOTION_DURATION'
      using errcode = '22023';
  end if;

  select coalesce(
    array_agg(normalized.channel order by normalized.channel),
    array[]::text[]
  )
  into v_channels
  from (
    select distinct lower(btrim(raw.channel)) as channel
    from unnest(coalesce(p_channels, array[]::text[])) as raw(channel)
    where btrim(raw.channel) <> ''
  ) as normalized;

  if cardinality(v_channels) < 1
     or cardinality(v_channels) > 4
     or not (
       v_channels <@ array[
         'facebook',
         'instagram',
         'snapchat',
         'whatsapp'
       ]::text[]
     )
  then
    raise exception 'INVALID_PROMOTION_CHANNELS'
      using errcode = '22023';
  end if;

  -- La photo doit appartenir au membre connecté.
  perform 1
  from public.photos
  where id = p_photo_id
    and profile_id = v_uid;

  if not found then
    raise exception 'PROMOTION_PHOTO_NOT_OWNED'
      using errcode = 'P0002';
  end if;

  -- Fermer d’abord une autorisation éventuellement arrivée à expiration.
  update public.profile_promotion_consents
  set
    withdrawn_at = v_now,
    withdrawn_by = v_uid,
    withdrawal_reason = 'expired'
  where profile_id = v_uid
    and withdrawn_at is null
    and expires_at <= v_now;

  -- Une modification conserve l’ancienne ligne comme historique.
  update public.profile_promotion_consents
  set
    withdrawn_at = v_now,
    withdrawn_by = v_uid,
    withdrawal_reason = 'replaced'
  where profile_id = v_uid
    and withdrawn_at is null;

  get diagnostics v_count = row_count;
  v_replaced := v_count > 0;

  v_expiry := v_now + make_interval(days => p_duration_days);

  insert into public.profile_promotion_consents (
    profile_id,
    photo_id,
    policy_version,
    consent_text,
    channels,
    duration_days,
    consented_at,
    expires_at
  )
  values (
    v_uid,
    p_photo_id,
    v_version,
    v_text,
    v_channels,
    p_duration_days,
    v_now,
    v_expiry
  )
  returning * into v_row;

  return query
  select
    v_row.id,
    v_row.photo_id,
    v_row.channels,
    v_row.duration_days,
    v_row.consented_at,
    v_row.expires_at,
    v_replaced;
end;
$$;

revoke all on function public.set_my_profile_promotion_consent(
  uuid,
  text[],
  integer
) from public;

revoke all on function public.set_my_profile_promotion_consent(
  uuid,
  text[],
  integer
) from anon;

grant execute on function public.set_my_profile_promotion_consent(
  uuid,
  text[],
  integer
) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC : withdraw_my_profile_promotion_consent
--
-- Retrait idempotent. Lhistorique n’est jamais supprimé.
-- ---------------------------------------------------------------------------

create or replace function public.withdraw_my_profile_promotion_consent()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_count integer;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED'
      using errcode = '42501';
  end if;

  update public.profile_promotion_consents
  set
    withdrawn_at = now(),
    withdrawn_by = v_uid,
    withdrawal_reason = 'member_withdrawn'
  where profile_id = v_uid
    and withdrawn_at is null;

  get diagnostics v_count = row_count;

  return v_count > 0;
end;
$$;

revoke all on function public.withdraw_my_profile_promotion_consent()
  from public;

revoke all on function public.withdraw_my_profile_promotion_consent()
  from anon;

grant execute on function public.withdraw_my_profile_promotion_consent()
  to authenticated;
