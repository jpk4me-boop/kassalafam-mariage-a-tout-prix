-- =============================================================================
-- KASSALAFAM — MARIAGE À TOUT PRIX
-- V1 — backend de consentement et publication pour la vitrine publique.
--
-- Garanties :
--   * consentement distinct du partage limité par jeton ;
--   * aucune publication automatique ni aucun backfill ;
--   * identité membre toujours déduite de auth.uid() ;
--   * identifiant public opaque, stable, non dérivé d'un UUID ou d'une donnée
--     personnelle ;
--   * photo explicitement choisie et appartenant au membre ;
--   * retrait du consentement et dépublication atomiques ;
--   * suppression/invalidation de la photo sélectionnée => dépublication ;
--   * historique de publication append-only ;
--   * RLS activée sans accès direct client ou service_role ;
--   * toutes les actions passent par des RPC SECURITY DEFINER ;
--   * aucune route publique, aucun sitemap et aucun paiement dans cette PR.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Consentements spécifiques à la vitrine publique.
-- -----------------------------------------------------------------------------
create table public.candidate_showcase_consents (
  id             uuid primary key default gen_random_uuid(),
  profile_id     uuid not null references public.profiles(id) on delete cascade,
  policy_version text not null,
  consent_text   text not null,
  consented_at   timestamptz not null default now(),
  withdrawn_at   timestamptz,
  withdrawn_by   uuid,
  created_at     timestamptz not null default now(),

  constraint candidate_showcase_consents_policy_version_len
    check (char_length(btrim(policy_version)) between 3 and 80),
  constraint candidate_showcase_consents_text_len
    check (char_length(btrim(consent_text)) between 40 and 2000),
  constraint candidate_showcase_consents_withdrawn_after_consent
    check (withdrawn_at is null or withdrawn_at >= consented_at),
  constraint candidate_showcase_consents_withdrawn_coherence
    check ((withdrawn_at is null) = (withdrawn_by is null))
);

create unique index candidate_showcase_consents_one_active
  on public.candidate_showcase_consents(profile_id)
  where withdrawn_at is null;

create index candidate_showcase_consents_profile_history
  on public.candidate_showcase_consents(profile_id, consented_at desc);

-- -----------------------------------------------------------------------------
-- 2. État courant de publication. Le slug est public mais opaque et stable.
-- -----------------------------------------------------------------------------
create table public.candidate_showcase_publications (
  id                uuid primary key default gen_random_uuid(),
  profile_id        uuid not null unique
                    references public.profiles(id) on delete cascade,
  public_slug       text not null unique,
  selected_photo_id uuid
                    references public.photos(id) on delete set null,
  listing_enabled   boolean not null default false,
  published_at      timestamptz,
  unpublished_at    timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint candidate_showcase_public_slug_format
    check (
      char_length(public_slug) = 22
      and public_slug ~ '^[A-Za-z0-9_-]{22}$'
    ),
  constraint candidate_showcase_publication_state_coherence
    check (
      (
        listing_enabled
        and selected_photo_id is not null
        and published_at is not null
        and unpublished_at is null
      )
      or
      (
        not listing_enabled
        and (
          (published_at is null and unpublished_at is null)
          or
          (
            published_at is not null
            and unpublished_at is not null
            and unpublished_at >= published_at
          )
        )
      )
    )
);

create index candidate_showcase_publications_enabled
  on public.candidate_showcase_publications(public_slug)
  where listing_enabled;

drop trigger if exists trg_candidate_showcase_publications_updated_at
  on public.candidate_showcase_publications;
create trigger trg_candidate_showcase_publications_updated_at
  before update on public.candidate_showcase_publications
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 3. Historique append-only des actions de publication.
--    Les UUID sont des snapshots d'audit, sans FK, afin que l'historique survive
--    à une suppression ultérieure du profil, de la publication ou de la photo.
-- -----------------------------------------------------------------------------
create table public.candidate_showcase_publication_events (
  id             uuid primary key default gen_random_uuid(),
  publication_id uuid not null,
  profile_id     uuid not null,
  photo_id       uuid,
  actor_id       uuid,
  action_type    text not null,
  reason         text not null,
  created_at     timestamptz not null default now(),

  constraint candidate_showcase_events_action_type
    check (
      action_type in (
        'published',
        'photo_changed',
        'unpublished',
        'consent_withdrawn',
        'photo_invalidated'
      )
    ),
  constraint candidate_showcase_events_reason_len
    check (char_length(btrim(reason)) between 3 and 500)
);

create index candidate_showcase_events_profile_history
  on public.candidate_showcase_publication_events(profile_id, created_at desc);

create or replace function public.candidate_showcase_events_no_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'CANDIDATE_SHOWCASE_EVENTS_APPEND_ONLY'
    using errcode = '42501';
end;
$$;

revoke all on function public.candidate_showcase_events_no_mutation()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_candidate_showcase_events_no_mutation
  on public.candidate_showcase_publication_events;
create trigger trg_candidate_showcase_events_no_mutation
  before update or delete on public.candidate_showcase_publication_events
  for each row execute function public.candidate_showcase_events_no_mutation();

-- -----------------------------------------------------------------------------
-- 4. RLS + privilèges : zéro accès direct, y compris service_role.
--    Les default privileges H2 accordent les droits aux futures tables à
--    service_role ; ils sont explicitement révoqués ici car ce backend impose
--    des RPC dédiées pour toutes les lectures et écritures.
-- -----------------------------------------------------------------------------
alter table public.candidate_showcase_consents enable row level security;
alter table public.candidate_showcase_publications enable row level security;
alter table public.candidate_showcase_publication_events enable row level security;

revoke all on table public.candidate_showcase_consents
  from public, anon, authenticated, service_role;
revoke all on table public.candidate_showcase_publications
  from public, anon, authenticated, service_role;
revoke all on table public.candidate_showcase_publication_events
  from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 5. Diagnostic interne d'éligibilité. Aucun rôle API ne peut l'appeler.
-- -----------------------------------------------------------------------------
create or replace function public.candidate_showcase_eligibility_reason(
  p_profile_id uuid,
  p_photo_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_photo public.photos%rowtype;
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

  if coalesce(pg_catalog.btrim(v_profile.first_name), '') = ''
     or v_profile.gender is null
     or v_profile.birth_date is null
     or v_profile.birth_date > (current_date - interval '18 years')::date
     or coalesce(pg_catalog.btrim(v_profile.country), '') = ''
     or coalesce(pg_catalog.btrim(v_profile.city), '') = ''
     or v_profile.marital_status is null
     or v_profile.discovery_universe is null
     or coalesce(pg_catalog.btrim(v_profile.bio), '') = ''
     or coalesce(pg_catalog.btrim(v_profile.partner_expectations), '') = ''
  then
    return 'profile_incomplete';
  end if;

  if v_profile.blur_photos then
    return 'photo_privacy_enabled';
  end if;

  if not exists (
    select 1
    from public.candidate_showcase_consents c
    where c.profile_id = p_profile_id
      and c.withdrawn_at is null
  ) then
    return 'consent_required';
  end if;

  if p_photo_id is null then
    return 'photo_required';
  end if;

  select *
  into v_photo
  from public.photos ph
  where ph.id = p_photo_id
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

revoke all on function public.candidate_showcase_eligibility_reason(uuid, uuid)
  from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 6. Consentement membre : création idempotente, texte imposé côté serveur.
-- -----------------------------------------------------------------------------
create or replace function public.grant_my_candidate_showcase_consent()
returns table (
  consent_id uuid,
  policy_version text,
  consented_at timestamptz,
  was_already_active boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_version constant text := '2026-07-showcase-v1';
  v_text constant text :=
    'J’autorise KASSALAFAM à afficher une présentation limitée de mon profil dans une vitrine publique accessible sur Internet et susceptible d’être indexée par les moteurs de recherche, afin de faciliter des mises en relation matrimoniales. Je peux retirer cette autorisation à tout moment ; le retrait désactive immédiatement ma publication.';
  v_profile public.profiles%rowtype;
  v_row public.candidate_showcase_consents%rowtype;
begin
  if v_uid is null then
    raise exception 'SHOWCASE_AUTH_REQUIRED' using errcode = '42501';
  end if;

  select *
  into v_profile
  from public.profiles p
  where p.id = v_uid
  for update;

  if not found then
    raise exception 'SHOWCASE_PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_profile.account_status <> 'active' then
    raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501';
  end if;

  select *
  into v_row
  from public.candidate_showcase_consents c
  where c.profile_id = v_uid
    and c.withdrawn_at is null;

  if found then
    return query
    select v_row.id, v_row.policy_version, v_row.consented_at, true;
    return;
  end if;

  insert into public.candidate_showcase_consents(
    profile_id,
    policy_version,
    consent_text
  )
  values (v_uid, v_version, v_text)
  returning * into v_row;

  return query
  select v_row.id, v_row.policy_version, v_row.consented_at, false;
end;
$$;

revoke all on function public.grant_my_candidate_showcase_consent()
  from public, anon, authenticated, service_role;
grant execute on function public.grant_my_candidate_showcase_consent()
  to authenticated;

-- -----------------------------------------------------------------------------
-- 7. Publication membre. p_photo_id NULL sélectionne la photo principale.
-- -----------------------------------------------------------------------------
create or replace function public.publish_my_candidate_showcase(
  p_photo_id uuid default null
)
returns table (
  publication_id uuid,
  public_slug text,
  photo_id uuid,
  published_at timestamptz,
  was_already_published boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_profile public.profiles%rowtype;
  v_photo_id uuid;
  v_reason text;
  v_now timestamptz := pg_catalog.now();
  v_slug text;
  v_row public.candidate_showcase_publications%rowtype;
  v_action text;
  v_attempt integer;
begin
  if v_uid is null then
    raise exception 'SHOWCASE_AUTH_REQUIRED' using errcode = '42501';
  end if;

  select *
  into v_profile
  from public.profiles p
  where p.id = v_uid
  for update;

  if not found then
    raise exception 'SHOWCASE_PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_profile.account_status <> 'active' then
    raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501';
  end if;

  if p_photo_id is null then
    select ph.id
    into v_photo_id
    from public.photos ph
    where ph.profile_id = v_uid
      and ph.is_primary
    order by ph.created_at, ph.id
    limit 1;
  else
    v_photo_id := p_photo_id;
  end if;

  v_reason := public.candidate_showcase_eligibility_reason(v_uid, v_photo_id);

  if v_reason = 'consent_required' then
    raise exception 'SHOWCASE_CONSENT_REQUIRED' using errcode = '22023';
  elsif v_reason = 'photo_privacy_enabled' then
    raise exception 'SHOWCASE_PHOTO_PRIVACY_ENABLED' using errcode = '22023';
  elsif v_reason = 'photo_required' then
    raise exception 'SHOWCASE_PHOTO_REQUIRED' using errcode = '22023';
  elsif v_reason = 'photo_invalid' then
    raise exception 'SHOWCASE_PHOTO_INVALID' using errcode = '22023';
  elsif v_reason <> 'eligible' then
    raise exception 'SHOWCASE_PROFILE_NOT_ELIGIBLE' using errcode = '22023';
  end if;

  select *
  into v_row
  from public.candidate_showcase_publications p
  where p.profile_id = v_uid
  for update;

  if found
     and v_row.listing_enabled
     and v_row.selected_photo_id = v_photo_id
  then
    return query
    select v_row.id, v_row.public_slug, v_row.selected_photo_id,
           v_row.published_at, true;
    return;
  end if;

  if not found then
    for v_attempt in 1..5 loop
      v_slug := replace(replace(rtrim(
        encode(extensions.gen_random_bytes(16), 'base64'), '='
      ), '+', '-'), '/', '_');

      begin
        insert into public.candidate_showcase_publications(
          profile_id,
          public_slug,
          selected_photo_id,
          listing_enabled,
          published_at,
          unpublished_at
        )
        values (
          v_uid,
          v_slug,
          v_photo_id,
          true,
          v_now,
          null
        )
        returning * into v_row;

        exit;
      exception when unique_violation then
        if v_attempt = 5 then
          raise exception 'SHOWCASE_SLUG_GENERATION_FAILED'
            using errcode = '40001';
        end if;
      end;
    end loop;

    v_action := 'published';
  else
    v_action := case
      when v_row.listing_enabled
           and v_row.selected_photo_id is distinct from v_photo_id
        then 'photo_changed'
      else 'published'
    end;

    update public.candidate_showcase_publications p
    set selected_photo_id = v_photo_id,
        listing_enabled = true,
        published_at = case
          when p.listing_enabled then p.published_at
          else v_now
        end,
        unpublished_at = null
    where p.id = v_row.id
    returning * into v_row;
  end if;

  insert into public.candidate_showcase_publication_events(
    publication_id,
    profile_id,
    photo_id,
    actor_id,
    action_type,
    reason
  )
  values (
    v_row.id,
    v_uid,
    v_photo_id,
    v_uid,
    v_action,
    case
      when v_action = 'photo_changed'
        then 'Photo publique modifiée par le membre.'
      else 'Publication activée par le membre.'
    end
  );

  return query
  select v_row.id, v_row.public_slug, v_row.selected_photo_id,
         v_row.published_at, false;
end;
$$;

revoke all on function public.publish_my_candidate_showcase(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.publish_my_candidate_showcase(uuid)
  to authenticated;

-- -----------------------------------------------------------------------------
-- 8. Dépublication membre : idempotente et autorisée même en suspension.
-- -----------------------------------------------------------------------------
create or replace function public.unpublish_my_candidate_showcase()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_now timestamptz := pg_catalog.now();
  v_row public.candidate_showcase_publications%rowtype;
begin
  if v_uid is null then
    raise exception 'SHOWCASE_AUTH_REQUIRED' using errcode = '42501';
  end if;

  perform 1
  from public.profiles p
  where p.id = v_uid
  for update;

  if not found then
    raise exception 'SHOWCASE_PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;

  select *
  into v_row
  from public.candidate_showcase_publications p
  where p.profile_id = v_uid
  for update;

  if not found or not v_row.listing_enabled then
    return false;
  end if;

  update public.candidate_showcase_publications p
  set listing_enabled = false,
      unpublished_at = v_now
  where p.id = v_row.id
  returning * into v_row;

  insert into public.candidate_showcase_publication_events(
    publication_id,
    profile_id,
    photo_id,
    actor_id,
    action_type,
    reason
  )
  values (
    v_row.id,
    v_uid,
    v_row.selected_photo_id,
    v_uid,
    'unpublished',
    'Publication désactivée par le membre.'
  );

  return true;
end;
$$;

revoke all on function public.unpublish_my_candidate_showcase()
  from public, anon, authenticated, service_role;
grant execute on function public.unpublish_my_candidate_showcase()
  to authenticated;

-- -----------------------------------------------------------------------------
-- 9. Retrait du consentement : retrait + dépublication atomiques.
-- -----------------------------------------------------------------------------
create or replace function public.withdraw_my_candidate_showcase_consent()
returns table (
  consent_withdrawn boolean,
  listing_unpublished boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_now timestamptz := pg_catalog.now();
  v_consent_count integer := 0;
  v_row public.candidate_showcase_publications%rowtype;
  v_unpublished boolean := false;
begin
  if v_uid is null then
    raise exception 'SHOWCASE_AUTH_REQUIRED' using errcode = '42501';
  end if;

  perform 1
  from public.profiles p
  where p.id = v_uid
  for update;

  if not found then
    raise exception 'SHOWCASE_PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;

  update public.candidate_showcase_consents c
  set withdrawn_at = v_now,
      withdrawn_by = v_uid
  where c.profile_id = v_uid
    and c.withdrawn_at is null;

  get diagnostics v_consent_count = row_count;

  select *
  into v_row
  from public.candidate_showcase_publications p
  where p.profile_id = v_uid
  for update;

  if found and v_row.listing_enabled then
    update public.candidate_showcase_publications p
    set listing_enabled = false,
        unpublished_at = v_now
    where p.id = v_row.id
    returning * into v_row;

    insert into public.candidate_showcase_publication_events(
      publication_id,
      profile_id,
      photo_id,
      actor_id,
      action_type,
      reason
    )
    values (
      v_row.id,
      v_uid,
      v_row.selected_photo_id,
      v_uid,
      'consent_withdrawn',
      'Consentement retiré par le membre ; publication désactivée.'
    );

    v_unpublished := true;
  end if;

  return query
  select v_consent_count > 0, v_unpublished;
end;
$$;

revoke all on function public.withdraw_my_candidate_showcase_consent()
  from public, anon, authenticated, service_role;
grant execute on function public.withdraw_my_candidate_showcase_consent()
  to authenticated;

-- -----------------------------------------------------------------------------
-- 10. Statut membre : aucune lecture directe des tables.
-- -----------------------------------------------------------------------------
create or replace function public.get_my_candidate_showcase_status()
returns table (
  consent_active boolean,
  consent_policy_version text,
  consented_at timestamptz,
  publication_id uuid,
  public_slug text,
  selected_photo_id uuid,
  listing_enabled boolean,
  effectively_public boolean,
  published_at timestamptz,
  unpublished_at timestamptz,
  eligibility_reason text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_consent public.candidate_showcase_consents%rowtype;
  v_publication public.candidate_showcase_publications%rowtype;
  v_reason text;
begin
  if v_uid is null then
    raise exception 'SHOWCASE_AUTH_REQUIRED' using errcode = '42501';
  end if;

  perform 1
  from public.profiles p
  where p.id = v_uid;

  if not found then
    raise exception 'SHOWCASE_PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;

  select *
  into v_consent
  from public.candidate_showcase_consents c
  where c.profile_id = v_uid
    and c.withdrawn_at is null;

  select *
  into v_publication
  from public.candidate_showcase_publications p
  where p.profile_id = v_uid;

  v_reason := public.candidate_showcase_eligibility_reason(
    v_uid,
    v_publication.selected_photo_id
  );

  return query
  select
    v_consent.id is not null,
    v_consent.policy_version,
    v_consent.consented_at,
    v_publication.id,
    v_publication.public_slug,
    v_publication.selected_photo_id,
    coalesce(v_publication.listing_enabled, false),
    coalesce(v_publication.listing_enabled, false)
      and v_reason = 'eligible',
    v_publication.published_at,
    v_publication.unpublished_at,
    v_reason;
end;
$$;

revoke all on function public.get_my_candidate_showcase_status()
  from public, anon, authenticated, service_role;
grant execute on function public.get_my_candidate_showcase_status()
  to authenticated;

-- -----------------------------------------------------------------------------
-- 11. Photo supprimée ou devenue invalide : dépublication automatique.
-- -----------------------------------------------------------------------------
create or replace function public.candidate_showcase_handle_photo_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.candidate_showcase_publications%rowtype;
  v_now timestamptz := pg_catalog.now();
  v_invalid boolean;
  v_was_enabled boolean;
begin
  if tg_op = 'DELETE' then
    v_invalid := true;
  else
    v_invalid :=
      new.profile_id is distinct from old.profile_id
      or coalesce(new.mime_type, '')
         not in ('image/jpeg', 'image/png', 'image/webp')
      or new.size_bytes is null
      or new.size_bytes < 1
      or new.size_bytes > 3145728
      or new.storage_path not like new.profile_id::text || '/%';
  end if;

  if not v_invalid then
    return new;
  end if;

  select *
  into v_row
  from public.candidate_showcase_publications p
  where p.selected_photo_id = old.id
  for update;

  if found then
    v_was_enabled := v_row.listing_enabled;

    update public.candidate_showcase_publications p
    set selected_photo_id = null,
        listing_enabled = false,
        unpublished_at = case
          when p.listing_enabled then v_now
          else p.unpublished_at
        end
    where p.id = v_row.id
    returning * into v_row;

    if v_was_enabled then
      insert into public.candidate_showcase_publication_events(
        publication_id,
        profile_id,
        photo_id,
        actor_id,
        action_type,
        reason
      )
      values (
        v_row.id,
        v_row.profile_id,
        old.id,
        (select auth.uid()),
        'photo_invalidated',
        'La photo publique sélectionnée a été supprimée ou est devenue invalide.'
      );
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke all on function public.candidate_showcase_handle_photo_mutation()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_candidate_showcase_photo_mutation
  on public.photos;
create trigger trg_candidate_showcase_photo_mutation
  before update of profile_id, storage_path, mime_type, size_bytes
  or delete on public.photos
  for each row execute function public.candidate_showcase_handle_photo_mutation();
