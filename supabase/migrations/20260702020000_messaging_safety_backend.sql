-- =============================================================================
-- KASSALAFAM — MARIAGE À TOUT PRIX
-- L3F-A — Socle backend de sécurité de la messagerie (backend only, additif).
-- Date : 2026-07-02
--
-- OBJECTIF
--   Donner aux membres les moyens de se protéger sans toucher à l'UI ni au MVP
--   messagerie déjà en production (L3E) :
--     - bloquer / débloquer un autre participant ;
--     - signaler un message reçu (avec copie serveur du contenu) ;
--     - empêcher tout NOUVEL envoi dès qu'un blocage existe dans un sens ou
--       l'autre, TOUT EN conservant la lecture de l'historique ;
--     - exclure les profils bloqués de la découverte et de l'expression d'intérêt.
--
-- PÉRIMÈTRE / NON-RÉGRESSION
--   Migration STRICTEMENT ADDITIVE. Elle NE modifie PAS :
--     - l'enum public.match_status ni le statut des matches ;
--     - le contenu des messages (aucune suppression / réécriture) ;
--     - la lecture de l'historique : public.can_message continue de garder la
--       RLS SELECT de messages, get_conversation_messages et mark_conversation_read.
--   Elle NE crée PAS de table conversations, PAS de Realtime, PAS d'Edge Function,
--   PAS d'API IA, PAS d'UI admin. Seul le CHEMIN D'ENVOI (public.send_message)
--   bascule de can_message vers can_send_message.
--
--   Toutes les écritures des nouvelles tables passent EXCLUSIVEMENT par des RPC
--   SECURITY DEFINER : RLS activée mais AUCUNE policy d'écriture (ni de lecture)
--   directe, et les privilèges de table sont révoqués à anon/authenticated.
--   search_path = '' partout ; références toujours pleinement qualifiées.
--
-- IDEMPOTENCE : create table/index if not exists, create or replace function,
--   drop policy if exists, drop function if exists avant changement de signature.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. TABLE public.profile_blocks
--    Un blocage DIRIGÉ : blocker_id a bloqué blocked_id. La réciprocité (blocage
--    « dans n'importe quel sens ») est calculée par le helper blocking_exists.
--    Clé primaire (blocker_id, blocked_id) => insert idempotent via ON CONFLICT.
--    on delete cascade cohérent avec le reste du schéma (matches/messages).
-- ---------------------------------------------------------------------------
create table if not exists public.profile_blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint profile_blocks_pkey primary key (blocker_id, blocked_id),
  constraint profile_blocks_distinct check (blocker_id <> blocked_id)
);

-- Recherche par personne bloquée (sens inverse ; le sens blocker_id est déjà
-- couvert par le préfixe de la clé primaire).
create index if not exists profile_blocks_blocked_idx
  on public.profile_blocks (blocked_id);

alter table public.profile_blocks enable row level security;

-- Aucune policy : RLS activée + aucune policy => aucun accès direct pour
-- authenticated/anon. Les seules lectures/écritures passent par les RPC
-- SECURITY DEFINER ci-dessous (qui s'exécutent en tant que propriétaire et
-- contournent donc la RLS). On révoque en plus tout privilège de table pour
-- interdire tout accès direct même en cas de policy ajoutée par erreur.
revoke all on table public.profile_blocks from anon;
revoke all on table public.profile_blocks from authenticated;

-- ---------------------------------------------------------------------------
-- 2. TABLE public.safety_reports
--    Signalement d'un message REÇU. Le contenu et la date du message sont
--    COPIÉS côté serveur au moment du signalement (snapshots) afin de survivre
--    à une éventuelle suppression ultérieure du message / du match / du profil.
--    D'où les FK en ON DELETE SET NULL (préserver la trace de modération) et des
--    colonnes reporter_id/message_id nullables APRÈS coup — toujours renseignées
--    à la création par la RPC (seul chemin d'insertion).
--    Unicité (reporter_id, message_id) : un même reporter ne signale un message
--    qu'une seule fois => appel idempotent.
-- ---------------------------------------------------------------------------
create table if not exists public.safety_reports (
  id                          uuid primary key default gen_random_uuid(),
  reporter_id                 uuid references public.profiles (id) on delete set null,
  reported_user_id            uuid references public.profiles (id) on delete set null,
  match_id                    uuid references public.matches (id) on delete set null,
  message_id                  uuid references public.messages (id) on delete set null,
  reason                      text not null,
  details                     text,
  message_content_snapshot    text not null,
  message_created_at_snapshot timestamptz not null,
  status                      text not null default 'open',
  -- Champs de traitement futurs (pas d'UI admin dans ce lot).
  reviewed_by                 uuid references public.profiles (id) on delete set null,
  reviewed_at                 timestamptz,
  resolution_note             text,
  created_at                  timestamptz not null default now(),
  constraint safety_reports_reason_valid check (
    reason in (
      'harassment', 'sexual_content', 'scam', 'hate',
      'threat', 'impersonation', 'spam', 'other'
    )
  ),
  constraint safety_reports_status_valid check (
    status in ('open', 'reviewing', 'resolved', 'dismissed')
  ),
  constraint safety_reports_details_len check (
    details is null or char_length(details) <= 1000
  ),
  constraint safety_reports_resolution_len check (
    resolution_note is null or char_length(resolution_note) <= 2000
  ),
  -- Anti-doublon : un reporter ne signale un message donné qu'une fois.
  constraint safety_reports_unique_reporter_message unique (reporter_id, message_id)
);

create index if not exists safety_reports_reported_user_idx
  on public.safety_reports (reported_user_id);
create index if not exists safety_reports_status_idx
  on public.safety_reports (status);

alter table public.safety_reports enable row level security;

-- Idem profile_blocks : RLS activée, aucune policy, privilèges de table révoqués.
-- Lecture/écriture uniquement via RPC (membre) ou futur back-office (admin).
revoke all on table public.safety_reports from anon;
revoke all on table public.safety_reports from authenticated;

-- ---------------------------------------------------------------------------
-- 3. HELPERS DE SÉCURITÉ
-- ---------------------------------------------------------------------------

-- 3a. blocking_exists : existe-t-il un blocage entre deux utilisateurs, DANS
--     N'IMPORTE QUEL SENS ? Helper interne (appelé uniquement par les RPC
--     SECURITY DEFINER ci-dessous, qui l'exécutent avec les droits du
--     propriétaire). NON destiné à l'appel direct par un membre : pas de grant
--     à authenticated.
create or replace function public.blocking_exists(
  p_first uuid,
  p_second uuid
)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.profile_blocks b
    where (b.blocker_id = p_first and b.blocked_id = p_second)
       or (b.blocker_id = p_second and b.blocked_id = p_first)
  );
$$;

revoke all on function public.blocking_exists(uuid, uuid) from public;
revoke all on function public.blocking_exists(uuid, uuid) from anon;

-- 3b. can_send_message : autorise l'ENVOI d'un message.
--     true UNIQUEMENT si : appelant authentifié + participant + match 'accepted'
--     + AUCUN blocage entre les deux participants (dans un sens ou l'autre).
--     Distinct de can_message (lecture), qui reste inchangé pour préserver
--     l'accès en lecture à l'historique même après un blocage.
create or replace function public.can_send_message(p_match_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.matches m
    where m.id = p_match_id
      and m.status = 'accepted'
      and (m.user_a = (select auth.uid()) or m.user_b = (select auth.uid()))
      and not public.blocking_exists(m.user_a, m.user_b)
  );
$$;

revoke all on function public.can_send_message(uuid) from public;
revoke all on function public.can_send_message(uuid) from anon;
grant execute on function public.can_send_message(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. RPC MEMBRES
-- ---------------------------------------------------------------------------

-- 4a. block_match_participant : bloque L'AUTRE participant d'un match.
--     L'appelant ne fournit JAMAIS blocker_id ; il est déduit de auth.uid().
--     L'autre membre est déterminé côté serveur à partir du match. Insert
--     idempotent (ON CONFLICT DO NOTHING). Auto-blocage impossible (l'autre
--     participant est par construction distinct de l'appelant).
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

  -- L'appelant doit participer au match ; on en déduit l'autre membre.
  select case when m.user_a = v_uid then m.user_b else m.user_a end
    into v_other
    from public.matches m
    where m.id = p_match
      and (m.user_a = v_uid or m.user_b = v_uid);

  if v_other is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  -- Garde-fou explicite anti auto-blocage.
  if v_other = v_uid then
    raise exception 'cannot block self' using errcode = '22023';
  end if;

  insert into public.profile_blocks (blocker_id, blocked_id)
    values (v_uid, v_other)
    on conflict (blocker_id, blocked_id) do nothing;
end
$$;

revoke all on function public.block_match_participant(uuid) from public;
revoke all on function public.block_match_participant(uuid) from anon;
grant execute on function public.block_match_participant(uuid) to authenticated;

-- 4b. unblock_profile : retire UNIQUEMENT le blocage créé par l'appelant.
--     Ne peut jamais supprimer le blocage créé par l'autre membre (clause
--     blocker_id = auth.uid()). Idempotent (no-op si aucun blocage).
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

  delete from public.profile_blocks
    where blocker_id = v_uid
      and blocked_id = p_target;
end
$$;

revoke all on function public.unblock_profile(uuid) from public;
revoke all on function public.unblock_profile(uuid) from anon;
grant execute on function public.unblock_profile(uuid) to authenticated;

-- 4c. report_message : signale un message REÇU d'un autre participant.
--     Toutes les appartenances sont vérifiées côté serveur. Le client ne fournit
--     NI reporter_id NI reported_user_id (déduits de auth.uid() et du message).
--     Le contenu et la date du message sont copiés (snapshots) au moment du
--     signalement. Anti-doublon : appel idempotent — un 2e signalement du même
--     message par le même reporter renvoie l'id du signalement existant.
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

  -- Raison strictement validée.
  if p_reason not in (
    'harassment', 'sexual_content', 'scam', 'hate',
    'threat', 'impersonation', 'spam', 'other'
  ) then
    raise exception 'invalid reason' using errcode = '22023';
  end if;

  -- Détails facultatifs, longueur bornée.
  v_clean_details := nullif(btrim(coalesce(p_details, '')), '');
  if v_clean_details is not null and char_length(v_clean_details) > 1000 then
    raise exception 'invalid details' using errcode = '22023';
  end if;

  -- Récupération du message + de son match (côté serveur).
  select msg.sender_id, msg.match_id, msg.content, msg.created_at
    into v_sender, v_match, v_content, v_created
    from public.messages msg
    where msg.id = p_message;

  if v_sender is null then
    raise exception 'invalid message' using errcode = '42501';
  end if;

  -- Le reporter doit participer au match du message signalé.
  if not exists (
    select 1
    from public.matches m
    where m.id = v_match
      and (m.user_a = v_uid or m.user_b = v_uid)
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  -- On ne signale pas son propre message.
  if v_sender = v_uid then
    raise exception 'cannot report own message' using errcode = '42501';
  end if;

  -- Insert idempotent avec snapshots. reported_user_id = expéditeur du message.
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

  -- Doublon (ON CONFLICT DO NOTHING) : on relit l'id existant => idempotent.
  if v_report_id is null then
    select sr.id
      into v_report_id
      from public.safety_reports sr
      where sr.reporter_id = v_uid
        and sr.message_id = p_message;
  end if;

  return v_report_id;
end
$$;

revoke all on function public.report_message(uuid, text, text) from public;
revoke all on function public.report_message(uuid, text, text) from anon;
grant execute on function public.report_message(uuid, text, text) to authenticated;

-- 4d. list_my_blocked_profiles : lecture minimale pour un futur écran « bloqués ».
--     Ne renvoie que des champs sûrs et nécessaires. N'expose que les blocages
--     créés par l'appelant.
create or replace function public.list_my_blocked_profiles()
returns table (
  blocked_user_id uuid,
  first_name text,
  blocked_at timestamptz
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    b.blocked_id as blocked_user_id,
    p.first_name,
    b.created_at as blocked_at
  from public.profile_blocks b
  join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = (select auth.uid())
  order by b.created_at desc;
$$;

revoke all on function public.list_my_blocked_profiles() from public;
revoke all on function public.list_my_blocked_profiles() from anon;
grant execute on function public.list_my_blocked_profiles() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. INTÉGRATION AUX FONCTIONS EXISTANTES
-- ---------------------------------------------------------------------------

-- 5a. send_message : bascule de can_message vers can_send_message (bloque tout
--     NOUVEL envoi dès qu'un blocage existe). Conserve trim, longueur 1..4000,
--     sender_id = auth.uid(), remontée de la conversation. Erreur GÉNÉRIQUE et
--     stable : ne révèle jamais si le refus vient d'un blocage, ni de quel côté.
create or replace function public.send_message(
  p_match uuid,
  p_content text
)
returns public.messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_clean text;
  v_row public.messages%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Garde d'ENVOI : participant + match accepté + aucun blocage (2 sens).
  -- Réponse générique : ne révèle rien sur l'origine du refus.
  if not public.can_send_message(p_match) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  v_clean := btrim(coalesce(p_content, ''));
  if char_length(v_clean) < 1 or char_length(v_clean) > 4000 then
    raise exception 'invalid content' using errcode = '22023';
  end if;

  insert into public.messages (match_id, sender_id, content)
    values (p_match, v_uid, v_clean)
    returning * into v_row;

  -- Remonte la conversation en tête de liste (ordre par matches.updated_at).
  update public.matches
    set updated_at = now()
    where id = p_match;

  return v_row;
end
$$;

revoke all on function public.send_message(uuid, text) from public;
revoke all on function public.send_message(uuid, text) from anon;
grant execute on function public.send_message(uuid, text) to authenticated;

-- 5b. discover_candidates : exclut les candidats liés par un blocage dans un
--     sens OU l'autre. Signature et colonnes de retour INCHANGÉES (create or
--     replace suffit). Seul le prédicat de filtrage est enrichi.
create or replace function public.discover_candidates(
  p_universe text,
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  id uuid,
  first_name text,
  age int,
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
    select v.id, v.gender, v.verification_status
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
    -- Gardes viewer : authentifié, approuvé, genre connu (sinon 0 ligne).
    (select auth.uid()) is not null
    and vw.verification_status = 'approved'
    and vw.gender is not null
    -- Univers valide uniquement (sinon 0 ligne).
    and p_universe in ('christian_marriage', 'islamic_marriage', 'open_marriage')
    -- Filtres candidats.
    and c.verification_status = 'approved'
    and c.id <> (select auth.uid())
    and c.gender = (case vw.gender when 'homme' then 'femme' else 'homme' end)::public.gender
    and c.discovery_universe = p_universe
    -- L3F-A : exclut tout profil lié par un blocage (dans un sens ou l'autre).
    and not public.blocking_exists((select auth.uid()), c.id)
    -- Profil suffisamment complet.
    and c.first_name is not null
    and btrim(c.first_name) <> ''
    and c.gender is not null
    and c.birth_date is not null
  order by c.is_premium desc, has_photo desc, c.created_at desc, c.id
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.discover_candidates(text, int, int) from public;
revoke all on function public.discover_candidates(text, int, int) from anon;
grant execute on function public.discover_candidates(text, int, int) to authenticated;

-- 5c. express_interest : refuse aussi l'appel DIRECT (pas seulement le filtre de
--     découverte) lorsqu'un blocage existe dans un sens ou l'autre. Erreur
--     générique 'not allowed'. Reste du comportement inchangé.
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
  v_existing public.matches%rowtype;
begin
  -- Garde viewer : authentifié, approuvé, genre connu.
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select gender, verification_status
    into v_gender, v_status
    from public.profiles
    where id = v_uid;

  if v_status is distinct from 'approved' or v_gender is null then
    raise exception 'viewer not eligible' using errcode = '42501';
  end if;

  -- Univers valide + pas de self.
  if p_universe not in ('christian_marriage', 'islamic_marriage', 'open_marriage') then
    raise exception 'invalid universe' using errcode = '22023';
  end if;
  if p_target = v_uid then
    raise exception 'self not allowed' using errcode = '22023';
  end if;

  -- L3F-A : blocage dans un sens ou l'autre => refus direct (défense en
  -- profondeur, indépendante du filtre de discover_candidates). Générique.
  if public.blocking_exists(v_uid, p_target) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  -- Validation cible : mêmes prédicats que discover_candidates.
  if not exists (
    select 1
    from public.profiles c
    where c.id = p_target
      and c.verification_status = 'approved'
      and c.gender = (case v_gender when 'homme' then 'femme' else 'homme' end)::public.gender
      and c.discovery_universe = p_universe
      and c.first_name is not null
      and btrim(c.first_name) <> ''
      and c.birth_date is not null
  ) then
    raise exception 'invalid target' using errcode = '42501';
  end if;

  -- Existant sur la paire non ordonnée.
  select * into v_existing
    from public.matches
    where (user_a = v_uid and user_b = p_target)
       or (user_a = p_target and user_b = v_uid)
    limit 1;

  if not found then
    -- Aucune relation : on crée l'intérêt (viewer -> target).
    begin
      insert into public.matches (user_a, user_b, status)
        values (v_uid, p_target, 'pending');
      return 'created';
    exception when unique_violation then
      -- Course concurrente : une ligne vient d'être créée ; on relit.
      select * into v_existing
        from public.matches
        where (user_a = v_uid and user_b = p_target)
           or (user_a = p_target and user_b = v_uid)
        limit 1;
    end;
  end if;

  -- Relation existante (initiale ou issue de la course concurrente).
  if v_existing.status = 'accepted' then
    return 'matched';
  elsif v_existing.status = 'rejected' then
    -- Ne pas recréer : retour contrôlé.
    return 'already';
  else
    -- pending
    if v_existing.user_a = v_uid then
      -- Le viewer a déjà exprimé cet intérêt.
      return 'already';
    else
      -- La cible avait déjà exprimé un intérêt vers le viewer -> mutuel.
      update public.matches
        set status = 'accepted', updated_at = now()
        where id = v_existing.id;
      return 'matched';
    end if;
  end if;
end
$$;

revoke all on function public.express_interest(uuid, text) from public;
revoke all on function public.express_interest(uuid, text) from anon;
grant execute on function public.express_interest(uuid, text) to authenticated;

-- 5d. list_my_relationships : conserve TOUTES les colonnes actuelles et leur
--     ordre, puis AJOUTE en fin de projection :
--       - blocked_by_me      : true uniquement si auth.uid() a créé le blocage ;
--       - messaging_available : false dès qu'un blocage existe dans un sens ou
--         l'autre (et n'est vrai que sur un match 'accepted', seul état où la
--         messagerie existe). La relation et l'historique restent visibles même
--         quand la messagerie est indisponible.
--     « blocked_by_other » n'est PAS exposé explicitement.
--     Le changement de type de retour d'une fonction TABLE impose un DROP
--     préalable (même transaction de migration).
drop function if exists public.list_my_relationships();

create or replace function public.list_my_relationships()
returns table (
  match_id uuid,
  other_id uuid,
  kind text,
  status text,
  first_name text,
  age int,
  city text,
  country text,
  marital_status text,
  intention text,
  has_photo boolean,
  is_blurred boolean,
  last_message_content text,
  last_message_at timestamptz,
  unread_count int,
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
    and (m.user_a = (select auth.uid()) or m.user_b = (select auth.uid()))
    and m.status in ('pending', 'accepted')
    and o.verification_status = 'approved'
    and o.first_name is not null
    and btrim(o.first_name) <> ''
    and o.birth_date is not null
  order by m.updated_at desc, m.id;
$$;

revoke all on function public.list_my_relationships() from public;
revoke all on function public.list_my_relationships() from anon;
grant execute on function public.list_my_relationships() to authenticated;
