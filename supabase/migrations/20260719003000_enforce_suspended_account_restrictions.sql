-- =============================================================================
-- L3F-C3B/C3D — application autoritative des suspensions de compte.
--
-- Objectifs :
--   * un membre suspendu ne peut plus écrire son profil, ses photos ou Storage ;
--   * aucune action métier membre (onboarding, acquisition, consentement accordé,
--     intérêt, réponse, blocage/déblocage, signalement, messagerie) n'est possible ;
--   * un profil suspendu disparaît de la découverte et des relations visibles ;
--   * aucun nouveau message ne peut être envoyé et les conversations sont
--     temporairement inaccessibles si un participant est suspendu ;
--   * aucune ligne métier n'est supprimée : après réactivation, matchs et messages
--     redeviennent accessibles selon les règles ordinaires.
--
-- Le retrait d'un consentement de partage reste volontairement autorisé : c'est
-- une action protectrice de la vie privée. Les lectures du propre profil et des
-- propres notifications restent également disponibles.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Prédicat central : TRUE pour un compte actif OU une session dont le profil
--    n'existe pas encore (inscription/onboarding initial), FALSE uniquement quand
--    le profil courant est explicitement `suspended`.
-- -----------------------------------------------------------------------------
create or replace function public.current_account_is_not_suspended()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select p.account_status <> 'suspended'::public.account_status
    from public.profiles p
    where p.id = (select auth.uid())
  ), true);
$$;

revoke all on function public.current_account_is_not_suspended() from public;
revoke all on function public.current_account_is_not_suspended() from anon;
grant execute on function public.current_account_is_not_suspended() to authenticated;
grant execute on function public.current_account_is_not_suspended() to service_role;

-- -----------------------------------------------------------------------------
-- 2. Défense en profondeur sur profiles : même si une policy ou une RPC dérive,
--    toute UPDATE initiée avec un JWT membre suspendu est refusée par le trigger.
-- -----------------------------------------------------------------------------
create or replace function public.guard_profiles_admin_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Hors session utilisateur (service_role / postgres) : rien à garder.
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.verification_status
         is distinct from 'pending'::public.profile_verification_status
       or new.verification_reviewed_at is not null
       or new.verification_reviewed_by is not null
       or new.verification_rejection_reason is not null
       or new.account_status is distinct from 'active'::public.account_status
       or new.suspended_at is not null
       or new.suspended_by is not null
       or new.suspension_reason is not null
       or new.is_premium is distinct from false
    then
      raise exception 'PROFILE_ADMIN_FIELDS_READ_ONLY' using errcode = '42501';
    end if;
    return new;
  end if;

  -- Une session membre suspendue ne peut modifier aucune colonne de son profil.
  if old.account_status = 'suspended'::public.account_status then
    raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501';
  end if;

  if new.verification_status         is distinct from old.verification_status
     or new.verification_reviewed_at is distinct from old.verification_reviewed_at
     or new.verification_reviewed_by is distinct from old.verification_reviewed_by
     or new.verification_rejection_reason
          is distinct from old.verification_rejection_reason
     or new.account_status    is distinct from old.account_status
     or new.suspended_at      is distinct from old.suspended_at
     or new.suspended_by      is distinct from old.suspended_by
     or new.suspension_reason is distinct from old.suspension_reason
     or new.is_premium is distinct from old.is_premium
  then
    raise exception 'PROFILE_ADMIN_FIELDS_READ_ONLY' using errcode = '42501';
  end if;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. RLS : écritures directes des photos et de Storage refusées pour la
--    session suspendue. Pour `profiles`, la policy owner-only existante reste
--    inchangée afin que le trigger puisse retourner l'erreur stable
--    ACCOUNT_SUSPENDED au lieu d'un UPDATE silencieux à zéro ligne.
-- -----------------------------------------------------------------------------
drop policy if exists photos_insert_own on public.photos;
create policy photos_insert_own
on public.photos
for insert
to authenticated
with check (
  (select auth.uid()) = profile_id
  and (select public.current_account_is_not_suspended())
);

drop policy if exists photos_update_own on public.photos;
create policy photos_update_own
on public.photos
for update
to authenticated
using (
  (select auth.uid()) = profile_id
  and (select public.current_account_is_not_suspended())
)
with check (
  (select auth.uid()) = profile_id
  and (select public.current_account_is_not_suspended())
);

drop policy if exists photos_delete_own on public.photos;
create policy photos_delete_own
on public.photos
for delete
to authenticated
using (
  (select auth.uid()) = profile_id
  and (select public.current_account_is_not_suspended())
);

drop policy if exists profile_photos_insert_own on storage.objects;
create policy profile_photos_insert_own
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (select public.current_account_is_not_suspended())
);

drop policy if exists profile_photos_update_own on storage.objects;
create policy profile_photos_update_own
on storage.objects
for update
to authenticated
using (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (select public.current_account_is_not_suspended())
)
with check (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (select public.current_account_is_not_suspended())
);

drop policy if exists profile_photos_delete_own on storage.objects;
create policy profile_photos_delete_own
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (select public.current_account_is_not_suspended())
);

-- La lecture directe des matches est refusée au participant suspendu. Les RPC
-- ci-dessous filtrent en plus tout autre participant suspendu.
drop policy if exists matches_select_participants on public.matches;
create policy matches_select_participants
on public.matches
for select
to authenticated
using (
  ((select auth.uid()) = user_a or (select auth.uid()) = user_b)
  and (select public.current_account_is_not_suspended())
);

-- -----------------------------------------------------------------------------
-- 4. Découverte.
-- -----------------------------------------------------------------------------
create or replace function public.discover_candidates(
  p_universe text,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table(
  id uuid,
  first_name text,
  age integer,
  city text,
  country text,
  marital_status text,
  intention text,
  discovery_universe text,
  has_photo boolean,
  is_blurred boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with viewer as (
    select v.id, v.gender, v.verification_status, v.account_status
    from public.profiles v
    where v.id = (select auth.uid())
  )
  select
    c.id,
    c.first_name,
    date_part('year', age(c.birth_date))::int as age,
    c.city,
    c.country,
    c.marital_status,
    c.intention,
    c.discovery_universe,
    exists (
      select 1
      from public.photos ph
      where ph.profile_id = c.id
        and ph.is_primary
    ) as has_photo,
    c.blur_photos as is_blurred
  from public.profiles c
  cross join viewer vw
  where
    (select auth.uid()) is not null
    and vw.account_status = 'active'::public.account_status
    and vw.verification_status = 'approved'
    and vw.gender is not null
    and p_universe in ('christian_marriage', 'islamic_marriage', 'open_marriage')
    and c.account_status = 'active'::public.account_status
    and c.verification_status = 'approved'
    and c.id <> (select auth.uid())
    and c.gender = (case vw.gender when 'homme' then 'femme' else 'homme' end)::public.gender
    and c.discovery_universe = p_universe
    and not public.blocking_exists((select auth.uid()), c.id)
    and c.first_name is not null
    and btrim(c.first_name) <> ''
    and c.gender is not null
    and c.birth_date is not null
  order by c.is_premium desc, has_photo desc, c.created_at desc, c.id
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

create or replace function public.express_interest(
  p_target uuid,
  p_universe text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_gender public.gender;
  v_status public.profile_verification_status;
  v_account_status public.account_status;
  v_existing public.matches%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select gender, verification_status, account_status
    into v_gender, v_status, v_account_status
    from public.profiles
    where id = v_uid;

  if v_account_status is distinct from 'active'::public.account_status then
    raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501';
  end if;

  if v_status is distinct from 'approved' or v_gender is null then
    raise exception 'viewer not eligible' using errcode = '42501';
  end if;

  if p_universe not in ('christian_marriage', 'islamic_marriage', 'open_marriage') then
    raise exception 'invalid universe' using errcode = '22023';
  end if;
  if p_target = v_uid then
    raise exception 'self not allowed' using errcode = '22023';
  end if;

  if public.blocking_exists(v_uid, p_target) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.profiles c
    where c.id = p_target
      and c.account_status = 'active'::public.account_status
      and c.verification_status = 'approved'
      and c.gender = (case v_gender when 'homme' then 'femme' else 'homme' end)::public.gender
      and c.discovery_universe = p_universe
      and c.first_name is not null
      and btrim(c.first_name) <> ''
      and c.birth_date is not null
  ) then
    raise exception 'invalid target' using errcode = '42501';
  end if;

  select * into v_existing
    from public.matches
    where (user_a = v_uid and user_b = p_target)
       or (user_a = p_target and user_b = v_uid)
    limit 1;

  if not found then
    begin
      insert into public.matches (user_a, user_b, status)
        values (v_uid, p_target, 'pending');
      return 'created';
    exception when unique_violation then
      select * into v_existing
        from public.matches
        where (user_a = v_uid and user_b = p_target)
           or (user_a = p_target and user_b = v_uid)
        limit 1;
    end;
  end if;

  if v_existing.status = 'accepted' then
    return 'matched';
  elsif v_existing.status = 'rejected' then
    return 'already';
  elsif v_existing.user_a = v_uid then
    return 'already';
  else
    update public.matches
      set status = 'accepted', updated_at = now()
      where id = v_existing.id;
    return 'matched';
  end if;
end;
$$;

create or replace function public.respond_to_interest(
  p_match uuid,
  p_decision text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.matches%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not public.current_account_is_not_suspended() then
    raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501';
  end if;

  if p_decision not in ('accepted', 'rejected') then
    raise exception 'invalid decision' using errcode = '22023';
  end if;

  select * into v_row
    from public.matches
    where id = p_match;

  if not found or v_row.user_b is distinct from v_uid then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.profiles a
    join public.profiles b on b.id = v_row.user_b
    where a.id = v_row.user_a
      and a.account_status = 'active'::public.account_status
      and b.account_status = 'active'::public.account_status
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if v_row.status <> 'pending' then
    return v_row.status::text;
  end if;

  update public.matches
    set status = p_decision::public.match_status,
        updated_at = now()
    where id = p_match
      and status = 'pending';

  return p_decision;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Relations et messagerie.
-- -----------------------------------------------------------------------------
create or replace function public.list_my_relationships()
returns table(
  match_id uuid,
  other_id uuid,
  kind text,
  status text,
  first_name text,
  age integer,
  city text,
  country text,
  marital_status text,
  intention text,
  has_photo boolean,
  is_blurred boolean,
  last_message_content text,
  last_message_at timestamptz,
  unread_count integer,
  blocked_by_me boolean,
  messaging_available boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    m.id as match_id,
    o.id as other_id,
    (case
      when m.status = 'accepted' then 'matched'
      when m.user_b = (select auth.uid()) then 'received'
      else 'sent'
    end)::text as kind,
    m.status::text as status,
    o.first_name,
    date_part('year', age(o.birth_date))::int as age,
    o.city,
    o.country,
    o.marital_status,
    o.intention,
    exists (
      select 1
      from public.photos ph
      where ph.profile_id = o.id
        and ph.is_primary
    ) as has_photo,
    o.blur_photos as is_blurred,
    lm.content as last_message_content,
    lm.created_at as last_message_at,
    coalesce((
      select count(*)
      from public.messages msg
      where msg.match_id = m.id
        and msg.sender_id <> (select auth.uid())
        and msg.read_at is null
    ), 0)::int as unread_count,
    exists (
      select 1
      from public.profile_blocks b
      where b.blocker_id = (select auth.uid())
        and b.blocked_id = o.id
    ) as blocked_by_me,
    (
      m.status = 'accepted'
      and not public.blocking_exists((select auth.uid()), o.id)
    ) as messaging_available
  from public.matches m
  join public.profiles o
    on o.id = case
                when m.user_a = (select auth.uid()) then m.user_b
                else m.user_a
              end
  left join lateral (
    select msg.content, msg.created_at
    from public.messages msg
    where msg.match_id = m.id
    order by msg.created_at desc
    limit 1
  ) lm on true
  where (select auth.uid()) is not null
    and public.current_account_is_not_suspended()
    and (m.user_a = (select auth.uid()) or m.user_b = (select auth.uid()))
    and m.status in ('pending', 'accepted')
    and o.account_status = 'active'::public.account_status
    and o.verification_status = 'approved'
    and o.first_name is not null
    and btrim(o.first_name) <> ''
    and o.birth_date is not null
  order by m.updated_at desc, m.id;
$$;

create or replace function public.can_message(p_match_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_account_is_not_suspended()
  and exists (
    select 1
    from public.matches m
    join public.profiles a on a.id = m.user_a
    join public.profiles b on b.id = m.user_b
    where m.id = p_match_id
      and m.status = 'accepted'
      and (m.user_a = (select auth.uid()) or m.user_b = (select auth.uid()))
      and a.account_status = 'active'::public.account_status
      and b.account_status = 'active'::public.account_status
  );
$$;

create or replace function public.can_send_message(p_match_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_account_is_not_suspended()
  and exists (
    select 1
    from public.matches m
    join public.profiles a on a.id = m.user_a
    join public.profiles b on b.id = m.user_b
    where m.id = p_match_id
      and m.status = 'accepted'
      and (m.user_a = (select auth.uid()) or m.user_b = (select auth.uid()))
      and a.account_status = 'active'::public.account_status
      and b.account_status = 'active'::public.account_status
      and not public.blocking_exists(m.user_a, m.user_b)
  );
$$;

create or replace function public.is_match_participant(p_match_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_account_is_not_suspended()
  and exists (
    select 1
    from public.matches m
    join public.profiles a on a.id = m.user_a
    join public.profiles b on b.id = m.user_b
    where m.id = p_match_id
      and (m.user_a = (select auth.uid()) or m.user_b = (select auth.uid()))
      and a.account_status = 'active'::public.account_status
      and b.account_status = 'active'::public.account_status
  );
$$;

-- `send_message`, `get_conversation_messages` et `mark_conversation_read`
-- conservent leurs définitions : elles délèguent respectivement à
-- can_send_message/can_message, désormais autoritatifs sur la suspension.

-- -----------------------------------------------------------------------------
-- 6. Sécurité membre : le membre suspendu ne peut initier aucune action, mais
--    un membre actif peut toujours signaler un ancien message d'un compte devenu
--    suspendu. Aucune donnée de blocage ou de signalement n'est supprimée.
-- -----------------------------------------------------------------------------
create or replace function public.block_match_participant(p_match uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_other uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not public.current_account_is_not_suspended() then
    raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501';
  end if;

  select case when m.user_a = v_uid then m.user_b else m.user_a end
    into v_other
    from public.matches m
    where m.id = p_match
      and (m.user_a = v_uid or m.user_b = v_uid);

  if v_other is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_other = v_uid then
    raise exception 'cannot block self' using errcode = '22023';
  end if;

  insert into public.profile_blocks (blocker_id, blocked_id)
    values (v_uid, v_other)
    on conflict (blocker_id, blocked_id) do nothing;
end;
$$;

create or replace function public.unblock_profile(p_target uuid)
returns void
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

  delete from public.profile_blocks
    where blocker_id = v_uid
      and blocked_id = p_target;
end;
$$;

create or replace function public.list_my_blocked_profiles()
returns table(blocked_user_id uuid, first_name text, blocked_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select
    b.blocked_id as blocked_user_id,
    p.first_name,
    b.created_at as blocked_at
  from public.profile_blocks b
  join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = (select auth.uid())
    and public.current_account_is_not_suspended()
  order by b.created_at desc;
$$;

create or replace function public.report_message(
  p_message uuid,
  p_reason text,
  p_details text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_sender uuid;
  v_match uuid;
  v_content text;
  v_created timestamptz;
  v_clean_details text;
  v_report_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not public.current_account_is_not_suspended() then
    raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501';
  end if;

  if p_reason not in (
    'harassment', 'sexual_content', 'scam', 'hate',
    'threat', 'impersonation', 'spam', 'other'
  ) then
    raise exception 'invalid reason' using errcode = '22023';
  end if;

  v_clean_details := nullif(btrim(coalesce(p_details, '')), '');
  if v_clean_details is not null and char_length(v_clean_details) > 1000 then
    raise exception 'invalid details' using errcode = '22023';
  end if;

  select msg.sender_id, msg.match_id, msg.content, msg.created_at
    into v_sender, v_match, v_content, v_created
    from public.messages msg
    where msg.id = p_message;

  if v_sender is null then
    raise exception 'invalid message' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.matches m
    where m.id = v_match
      and (m.user_a = v_uid or m.user_b = v_uid)
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if v_sender = v_uid then
    raise exception 'cannot report own message' using errcode = '42501';
  end if;

  insert into public.safety_reports (
    reporter_id, reported_user_id, match_id, message_id,
    reason, details, message_content_snapshot, message_created_at_snapshot
  )
  values (
    v_uid, v_sender, v_match, p_message,
    p_reason, v_clean_details, v_content, v_created
  )
  on conflict (reporter_id, message_id) do nothing
  returning id into v_report_id;

  if v_report_id is null then
    select sr.id
      into v_report_id
      from public.safety_reports sr
      where sr.reporter_id = v_uid
        and sr.message_id = p_message;
  end if;

  return v_report_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. Onboarding, acquisition et consentement de partage.
-- -----------------------------------------------------------------------------
create or replace function public.record_acquisition_source(
  p_source text,
  p_other text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_other text;
  v_existing_source text;
  v_existing_other text;
  v_existing_at timestamptz;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not public.current_account_is_not_suspended() then
    raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501';
  end if;

  if p_source not in (
    'tiktok', 'instagram', 'facebook', 'youtube',
    'whatsapp_recommendation', 'google', 'other'
  ) then
    raise exception 'invalid acquisition source' using errcode = '22023';
  end if;

  if p_source = 'other' then
    v_other := btrim(p_other);
    if v_other is null or v_other = '' then
      raise exception 'acquisition detail required for source other'
        using errcode = '22023';
    end if;
    if char_length(v_other) > 120 then
      raise exception 'acquisition detail too long' using errcode = '22023';
    end if;
  else
    if p_other is not null and btrim(p_other) <> '' then
      raise exception 'acquisition detail not allowed for this source'
        using errcode = '22023';
    end if;
    v_other := null;
  end if;

  select acquisition_source, acquisition_source_other, acquisition_source_recorded_at
    into v_existing_source, v_existing_other, v_existing_at
    from public.profiles
    where id = v_uid
    for update;

  if not found then
    begin
      insert into public.profiles (
        id, acquisition_source, acquisition_source_other, acquisition_source_recorded_at
      )
      values (v_uid, p_source, v_other, now());
      return 'recorded';
    exception when unique_violation then
      select acquisition_source, acquisition_source_other, acquisition_source_recorded_at
        into v_existing_source, v_existing_other, v_existing_at
        from public.profiles
        where id = v_uid
        for update;
    end;
  end if;

  if v_existing_at is not null then
    if v_existing_source is not distinct from p_source
       and v_existing_other is not distinct from v_other then
      return 'unchanged';
    end if;
    return 'already_recorded';
  end if;

  update public.profiles
    set acquisition_source = p_source,
        acquisition_source_other = v_other,
        acquisition_source_recorded_at = now()
    where id = v_uid;

  return 'recorded';
end;
$$;

create or replace function public.complete_member_onboarding_v2()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_profile public.profiles%rowtype;
  v_now timestamptz;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'ONBOARDING_AUTH_REQUIRED' using errcode = '42501';
  end if;
  if not public.current_account_is_not_suspended() then
    raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501';
  end if;

  select * into v_profile
  from public.profiles
  where id = v_uid
  for update;

  if not found then
    raise exception 'ONBOARDING_PROFILE_MISSING';
  end if;

  if v_profile.onboarding_completed_at is not null then
    return v_profile.onboarding_completed_at;
  end if;

  if v_profile.acquisition_source_recorded_at is null then
    raise exception 'ONBOARDING_INCOMPLETE_ACQUISITION';
  end if;
  if coalesce(pg_catalog.btrim(v_profile.first_name), '') = '' then
    raise exception 'ONBOARDING_INCOMPLETE_FIRST_NAME';
  end if;
  if v_profile.gender is null then
    raise exception 'ONBOARDING_INCOMPLETE_GENDER';
  end if;
  if v_profile.birth_date is null
     or v_profile.birth_date > (current_date - interval '18 years')::date then
    raise exception 'ONBOARDING_INCOMPLETE_BIRTH_DATE';
  end if;
  if v_profile.marital_status is null then
    raise exception 'ONBOARDING_INCOMPLETE_MARITAL_STATUS';
  end if;
  if v_profile.religion is null then
    raise exception 'ONBOARDING_INCOMPLETE_RELIGION';
  end if;
  if coalesce(pg_catalog.btrim(v_profile.profession), '') = ''
     or v_profile.education_level is null
     or v_profile.height_cm is null then
    raise exception 'ONBOARDING_INCOMPLETE_PROFESSIONAL';
  end if;
  if coalesce(pg_catalog.btrim(v_profile.origin_country), '') = ''
     or coalesce(pg_catalog.btrim(v_profile.origin_city), '') = ''
     or coalesce(pg_catalog.btrim(v_profile.country), '') = ''
     or coalesce(pg_catalog.btrim(v_profile.city), '') = ''
     or coalesce(pg_catalog.btrim(v_profile.region), '') = '' then
    raise exception 'ONBOARDING_INCOMPLETE_LOCATION';
  end if;
  if coalesce(pg_catalog.array_length(v_profile.marriage_goals, 1), 0) < 2
     or coalesce(pg_catalog.array_length(v_profile.desired_partner_traits, 1), 0) < 2
     or v_profile.polygamy_preference is null
     or v_profile.children_intent is null then
    raise exception 'ONBOARDING_INCOMPLETE_MATRIMONIAL';
  end if;
  if coalesce(pg_catalog.btrim(v_profile.bio), '') = '' then
    raise exception 'ONBOARDING_INCOMPLETE_BIO';
  end if;
  if coalesce(pg_catalog.btrim(v_profile.partner_expectations), '') = '' then
    raise exception 'ONBOARDING_INCOMPLETE_PARTNER_EXPECTATIONS';
  end if;
  if not exists (
    select 1 from public.photos ph
    where ph.profile_id = v_uid and ph.is_primary
  ) then
    raise exception 'ONBOARDING_INCOMPLETE_PRIMARY_PHOTO';
  end if;

  if not public.profile_meets_onboarding_requirements(v_profile) then
    raise exception 'ONBOARDING_INCOMPLETE';
  end if;

  v_now := pg_catalog.now();

  update public.profiles
  set onboarding_completed_at = v_now
  where id = v_uid
    and onboarding_completed_at is null;

  return v_now;
end;
$$;

create or replace function public.grant_my_profile_share_consent()
returns table(
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
  v_version constant text := '2026-07-v1';
  v_text constant text :=
    'J’autorise KASSALAFAM à publier et partager une présentation limitée de mon profil à des fins de mise en relation matrimoniale.';
  v_row public.profile_share_consents%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not public.current_account_is_not_suspended() then
    raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501';
  end if;

  perform 1 from public.profiles where id = v_uid for update;
  if not found then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;

  select * into v_row
    from public.profile_share_consents c
    where c.profile_id = v_uid
      and c.withdrawn_at is null;

  if found then
    return query
      select v_row.id, v_row.policy_version, v_row.consented_at, true;
    return;
  end if;

  insert into public.profile_share_consents (profile_id, policy_version, consent_text)
  values (v_uid, v_version, v_text)
  returning * into v_row;

  return query
    select v_row.id, v_row.policy_version, v_row.consented_at, false;
end;
$$;

-- ACL des fonctions remplacées : CREATE OR REPLACE les préserve. Le helper
-- nouveau est le seul objet dont les privilèges sont définis ici explicitement.
