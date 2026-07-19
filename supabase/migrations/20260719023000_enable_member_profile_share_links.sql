-- =============================================================================
-- KASSALAFAM — MARIAGE À TOUT PRIX
-- PR4 — gestion par le membre de son lien public limité.
--
-- Garanties :
--   * identité toujours dérivée de auth.uid() ; aucun profile_id/actor_id client ;
--   * création/rotation refusées au compte suspendu ou non publiable ;
--   * lecture limitée aux métadonnées du propre lien, jamais token_hash/token ;
--   * révocation du propre lien autorisée, y compris pour protéger la vie privée ;
--   * retirer le consentement révoque atomiquement tout lien non révoqué afin
--     qu'un consentement ultérieur ne puisse jamais ressusciter un ancien lien ;
--   * le jeton en clair reste retourné une seule fois à création/rotation.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Retrait du consentement : retrait + révocation atomique des liens.
-- -----------------------------------------------------------------------------
create or replace function public.withdraw_my_profile_share_consent()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_count integer;
  v_now timestamptz := pg_catalog.now();
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Sérialise retrait, création et rotation pour ce profil.
  perform 1
  from public.profiles p
  where p.id = v_uid
  for update;

  if not found then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;

  update public.profile_share_consents c
  set withdrawn_at = v_now,
      withdrawn_by = v_uid
  where c.profile_id = v_uid
    and c.withdrawn_at is null;

  get diagnostics v_count = row_count;

  if v_count > 0 then
    update public.profile_share_links l
    set revoked_at = v_now,
        revoked_by = v_uid,
        revocation_reason = 'Retrait du consentement par le membre.'
    where l.profile_id = v_uid
      and l.revoked_at is null;
  end if;

  return v_count > 0;
end;
$$;

revoke all on function public.withdraw_my_profile_share_consent() from public;
revoke all on function public.withdraw_my_profile_share_consent() from anon;
grant execute on function public.withdraw_my_profile_share_consent() to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Lecture membre des métadonnées de son dernier lien.
--    Aucun token, hash, actor_id ni motif n'est retourné.
-- -----------------------------------------------------------------------------
create or replace function public.get_my_profile_share_link_status()
returns table (
  link_id uuid,
  token_prefix text,
  created_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  status text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  return query
  select
    l.id,
    l.token_prefix,
    l.created_at,
    l.expires_at,
    l.revoked_at,
    case
      when l.revoked_at is not null then 'revoked'
      when l.expires_at <= pg_catalog.now() then 'expired'
      else 'active'
    end
  from public.profile_share_links l
  where l.profile_id = v_uid
  order by (l.revoked_at is null) desc, l.created_at desc
  limit 1;
end;
$$;

revoke all on function public.get_my_profile_share_link_status() from public;
revoke all on function public.get_my_profile_share_link_status() from anon;
grant execute on function public.get_my_profile_share_link_status() to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Création du propre lien : wrapper propriétaire autour du backend PR2.
-- -----------------------------------------------------------------------------
create or replace function public.create_my_profile_share_link(
  p_expires_at timestamptz default null
)
returns table (
  link_id uuid,
  token text,
  token_prefix text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not public.current_account_is_not_suspended() then
    raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501';
  end if;

  return query
  select c.link_id, c.token, c.token_prefix, c.expires_at
  from public.create_profile_share_link(v_uid, v_uid, p_expires_at) c;
end;
$$;

revoke all on function public.create_my_profile_share_link(timestamptz) from public;
revoke all on function public.create_my_profile_share_link(timestamptz) from anon;
grant execute on function public.create_my_profile_share_link(timestamptz) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Révocation du propre lien. Uniformise l'absence et la non-appartenance.
--    Autorisée même si le compte est suspendu : action protectrice de la vie privée.
-- -----------------------------------------------------------------------------
create or replace function public.revoke_my_profile_share_link(
  p_link_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_owner uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select l.profile_id
  into v_owner
  from public.profile_share_links l
  where l.id = p_link_id
  for update;

  if not found or v_owner is distinct from v_uid then
    raise exception 'LINK_NOT_FOUND' using errcode = 'P0002';
  end if;

  return public.revoke_profile_share_link(
    p_link_id,
    v_uid,
    'Révocation demandée par le membre.'
  );
end;
$$;

revoke all on function public.revoke_my_profile_share_link(uuid) from public;
revoke all on function public.revoke_my_profile_share_link(uuid) from anon;
grant execute on function public.revoke_my_profile_share_link(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Rotation atomique : révoque le lien non révoqué puis crée le nouveau.
--    En cas d'échec de création, toute la transaction est annulée et l'ancien
--    lien reste intact. Cette action permet de récupérer un nouveau jeton quand
--    l'adresse complète du lien précédent n'est plus disponible.
-- -----------------------------------------------------------------------------
create or replace function public.rotate_my_profile_share_link(
  p_expires_at timestamptz default null
)
returns table (
  link_id uuid,
  token text,
  token_prefix text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not public.current_account_is_not_suspended() then
    raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501';
  end if;

  perform 1
  from public.profiles p
  where p.id = v_uid
  for update;

  if not found then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from public.profile_share_consents c
    where c.profile_id = v_uid
      and c.withdrawn_at is null
  ) then
    raise exception 'CONSENT_REQUIRED' using errcode = '22023';
  end if;

  if not public.profile_is_shareable(v_uid) then
    raise exception 'PROFILE_NOT_PUBLISHABLE' using errcode = '22023';
  end if;

  update public.profile_share_links l
  set revoked_at = pg_catalog.now(),
      revoked_by = v_uid,
      revocation_reason = 'Rotation demandée par le membre.'
  where l.profile_id = v_uid
    and l.revoked_at is null;

  return query
  select c.link_id, c.token, c.token_prefix, c.expires_at
  from public.create_profile_share_link(v_uid, v_uid, p_expires_at) c;
end;
$$;

revoke all on function public.rotate_my_profile_share_link(timestamptz) from public;
revoke all on function public.rotate_my_profile_share_link(timestamptz) from anon;
grant execute on function public.rotate_my_profile_share_link(timestamptz) to authenticated;
