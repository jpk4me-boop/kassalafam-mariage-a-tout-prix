-- =============================================================================
-- KASSALAFAM — MARIAGE À TOUT PRIX
-- L3G — Back-office « Membres & Journal d'administration ».
--       Additif, backend only. Aucune donnée applicative créée.
-- Date : 2026-07-06
--
-- CONTENU
--   A. Journal APPEND-ONLY public.admin_audit_log — comble le SEUL trou d'audit
--      existant : les décisions de VÉRIFICATION de profil (approve/reject/pause)
--      n'étaient jusqu'ici PAS historisées (seule la dernière décision vivait
--      dans les colonnes verification_* de profiles). Les suspensions
--      (account_moderation_actions) et les signalements (safety_report_actions)
--      possèdent DÉJÀ leur journal immuable : ils ne sont PAS dupliqués ici.
--   B. RPC transactionnelle public.admin_set_verification_status
--      (service_role only) : verrou -> concurrence optimiste -> validation ->
--      UPDATE verification_* -> INSERT admin_audit_log, le tout dans UNE
--      transaction. Remplace les .update() directs des Server Actions.
--   C. RPC de lecture paginée public.admin_list_members (service_role only) :
--      filtres + tri + agrégats par membre + total_count, calculés EN BASE
--      (jamais toute la table chargée en mémoire côté application).
--
-- PÉRIMÈTRE / NON-RÉGRESSION
--   N'ajoute AUCUN effet d'enforcement (découverte / intérêts / messagerie /
--   photos NON touchés). Ne modifie ni les enums, ni les tables existantes, ni
--   leurs policies. safety_reports / account_moderation_actions /
--   safety_report_actions restent l'autorité de leur domaine.
--
-- SÉCURITÉ
--   admin_audit_log : RLS activée, AUCUNE policy, privilèges membres révoqués ;
--   SELECT + INSERT réservés à service_role (jamais UPDATE/DELETE : append-only,
--   trigger d'immuabilité). Les RPC sont SECURITY DEFINER, search_path = '',
--   références pleinement qualifiées, EXECUTE réservé à service_role. p_actor_id
--   provient TOUJOURS de la session admin validée côté serveur (requireAdmin) ;
--   l'email de l'acteur est RELU en base depuis auth.users (jamais transmis par
--   le client). Aucun secret, aucune clé, aucun UUID admin en dur.
--
-- IDEMPOTENCE : create table/index if not exists, create or replace function,
--   drop trigger if exists / create trigger, revoke/grant idempotents.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- A. JOURNAL APPEND-ONLY public.admin_audit_log
--    Une ligne par décision administrative NON déjà journalisée ailleurs.
--    Aujourd'hui : uniquement les décisions de vérification (action_type
--    'verification_set'). Le CHECK sur action_type borne volontairement les
--    valeurs acceptées : toute extension future passera par une migration.
--
--    CONFIDENTIALITÉ : aucun email du membre CIBLE n'est stocké — son UUID
--    (target_profile_id_snapshot) est la référence d'audit minimale et survit à
--    la suppression du profil (target_profile_id en FK ON DELETE SET NULL).
--    L'email de l'ACTEUR admin est capturé côté serveur par la RPC.
-- ---------------------------------------------------------------------------
create table if not exists public.admin_audit_log (
  id                          uuid primary key default gen_random_uuid(),
  action_type                 text not null,
  actor_id                    uuid references auth.users (id) on delete set null,
  actor_email_snapshot        text,
  target_profile_id           uuid references public.profiles (id) on delete set null,
  target_profile_id_snapshot  uuid not null,
  previous_status             text,
  new_status                  text,
  reason                      text,
  created_at                  timestamptz not null default now(),
  constraint admin_audit_log_action_type_valid check (
    action_type in ('verification_set')
  ),
  -- Motif : NULL (ex. approbation) ou 1..2000 après normalisation btrim.
  constraint admin_audit_log_reason_len check (
    reason is null or char_length(btrim(reason)) between 1 and 2000
  )
);

-- Flux chronologique global (le plus récent d'abord).
create index if not exists admin_audit_log_created_idx
  on public.admin_audit_log (created_at desc);

-- Actions d'un administrateur donné.
create index if not exists admin_audit_log_actor_idx
  on public.admin_audit_log (actor_id, created_at desc);

-- Historique administratif d'un membre ciblé (survit à la suppression).
create index if not exists admin_audit_log_target_idx
  on public.admin_audit_log (target_profile_id_snapshot, created_at desc);

-- Filtre par type d'action.
create index if not exists admin_audit_log_action_type_idx
  on public.admin_audit_log (action_type, created_at desc);

-- ---------------------------------------------------------------------------
-- A.bis  RLS + PRIVILÈGES (append-only, service_role uniquement).
--    RLS activée, AUCUNE policy => aucun accès direct anon/authenticated.
--    Révocation totale puis SELECT + INSERT au seul service_role (jamais
--    UPDATE/DELETE : append-only, y compris pour lui). La RPC SECURITY DEFINER
--    insère en tant que propriétaire (l'INSERT ne déclenche pas l'anti-mutation).
-- ---------------------------------------------------------------------------
alter table public.admin_audit_log enable row level security;

revoke all on table public.admin_audit_log from public;
revoke all on table public.admin_audit_log from anon;
revoke all on table public.admin_audit_log from authenticated;
revoke all on table public.admin_audit_log from service_role;
grant select, insert on table public.admin_audit_log to service_role;

-- Immuabilité : append-only. Refuse tout DELETE et toute modification d'une
-- ligne. AUTORISE UNIQUEMENT la mise à NULL des FK par un CASCADE ON DELETE SET
-- NULL (actor_id / target_profile_id) : sinon supprimer un acteur admin ou un
-- profil rendrait les lignes d'audit indésupprimables. Même distinction cascade
-- (pg_trigger_depth() > 1) vs requête directe (= 1) que account_moderation_actions.
create or replace function public.admin_audit_log_no_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'ADMIN_AUDIT_LOG_APPEND_ONLY' using errcode = '42501';
  end if;

  if pg_trigger_depth() > 1
     and new.id                         is not distinct from old.id
     and new.action_type                is not distinct from old.action_type
     and new.actor_email_snapshot       is not distinct from old.actor_email_snapshot
     and new.target_profile_id_snapshot is not distinct from old.target_profile_id_snapshot
     and new.previous_status            is not distinct from old.previous_status
     and new.new_status                 is not distinct from old.new_status
     and new.reason                     is not distinct from old.reason
     and new.created_at                 is not distinct from old.created_at
     and (
       new.actor_id is not distinct from old.actor_id
       or (old.actor_id is not null and new.actor_id is null)
     )
     and (
       new.target_profile_id is not distinct from old.target_profile_id
       or (old.target_profile_id is not null and new.target_profile_id is null)
     )
     and (
          (old.actor_id          is not null and new.actor_id          is null)
       or (old.target_profile_id is not null and new.target_profile_id is null)
     )
  then
    return new;  -- cascade SET NULL légitime
  end if;

  raise exception 'ADMIN_AUDIT_LOG_APPEND_ONLY' using errcode = '42501';
end;
$$;

revoke all on function public.admin_audit_log_no_mutation() from public;
revoke all on function public.admin_audit_log_no_mutation() from anon;
revoke all on function public.admin_audit_log_no_mutation() from authenticated;

drop trigger if exists trg_admin_audit_log_append_only on public.admin_audit_log;
create trigger trg_admin_audit_log_append_only
  before update or delete on public.admin_audit_log
  for each row execute function public.admin_audit_log_no_mutation();

-- ---------------------------------------------------------------------------
-- B. RPC TRANSACTIONNELLE admin_set_verification_status
--    Effectue, dans UNE transaction : validation -> verrou (FOR UPDATE) ->
--    concurrence optimiste -> transition -> acteur -> UPDATE verification_* ->
--    INSERT admin_audit_log -> RETURN du profil.
--
--    - p_expected_status : état vu par l'admin (garde de concurrence).
--    - p_new_status : 'approved' | 'rejected' | 'paused' (jamais 'pending' :
--      c'est l'état membre initial, jamais posé par un admin).
--    - Motif : OBLIGATOIRE (5..500) pour 'rejected' et 'paused' (cohérent avec
--      profiles_rejection_reason_len <= 500) ; IGNORÉ (forcé NULL) pour
--      'approved'. Le motif est écrit dans profiles.verification_rejection_reason
--      ET dans le journal.
--    - p_actor_id provient de requireAdmin() ; son email est relu ICI depuis
--      auth.users. Erreurs métier STABLES, sans donnée sensible.
--
--    Le client service_role a auth.uid() = NULL : l'UPDATE passe la garde
--    trg_profiles_guard_admin_fields (qui ne bloque que les sessions membres).
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_verification_status(
  p_profile_id uuid,
  p_expected_status text,
  p_new_status text,
  p_reason text,
  p_actor_id uuid
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile     public.profiles%rowtype;
  v_prev        public.profile_verification_status;
  v_reason      text;
  v_actor_email text;
  v_needs_reason boolean;
begin
  -- 1. Validation des paramètres de statut.
  if p_new_status not in ('approved', 'rejected', 'paused') then
    raise exception 'INVALID_VERIFICATION_STATUS' using errcode = '22023';
  end if;
  if p_expected_status not in ('pending', 'approved', 'rejected', 'paused') then
    raise exception 'INVALID_VERIFICATION_STATUS' using errcode = '22023';
  end if;

  v_needs_reason := p_new_status in ('rejected', 'paused');

  -- 2. Normalisation + règles de motif.
  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if v_needs_reason then
    if v_reason is null then
      raise exception 'REASON_REQUIRED' using errcode = '22023';
    end if;
    if char_length(v_reason) < 5 or char_length(v_reason) > 500 then
      raise exception 'REASON_LENGTH_INVALID' using errcode = '22023';
    end if;
  else
    -- 'approved' : aucun motif conservé.
    v_reason := null;
  end if;

  -- 3. Verrou + lecture du profil (sérialise les décisions concurrentes).
  select * into v_profile
    from public.profiles
    where id = p_profile_id
    for update;

  if not found then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_prev := v_profile.verification_status;

  -- 4. Concurrence optimiste : l'état réel doit être celui vu par l'admin.
  if v_prev::text is distinct from p_expected_status then
    raise exception 'VERIFICATION_STATUS_CONFLICT' using errcode = '40001';
  end if;

  -- 5. Pas de transition vers le statut déjà courant.
  if p_new_status = v_prev::text then
    raise exception 'INVALID_VERIFICATION_TRANSITION' using errcode = '22023';
  end if;

  -- 6. Acteur : doit exister dans auth.users. Email relu côté serveur.
  select u.email into v_actor_email
    from auth.users u
    where u.id = p_actor_id;

  if not found then
    raise exception 'ACTOR_NOT_FOUND' using errcode = '22023';
  end if;

  -- 7. Mise à jour atomique des champs de vérification.
  update public.profiles
    set verification_status            = p_new_status::public.profile_verification_status,
        verification_reviewed_at       = now(),
        verification_reviewed_by       = p_actor_id,
        verification_rejection_reason  = v_reason
    where id = p_profile_id
    returning * into v_profile;

  -- 8. Journal append-only (même transaction) — exactement une ligne.
  insert into public.admin_audit_log (
    action_type, actor_id, actor_email_snapshot,
    target_profile_id, target_profile_id_snapshot,
    previous_status, new_status, reason
  )
  values (
    'verification_set', p_actor_id, v_actor_email,
    p_profile_id, p_profile_id,
    v_prev::text, p_new_status, v_reason
  );

  return v_profile;
end;
$$;

revoke all on function public.admin_set_verification_status(uuid, text, text, text, uuid) from public;
revoke all on function public.admin_set_verification_status(uuid, text, text, text, uuid) from anon;
revoke all on function public.admin_set_verification_status(uuid, text, text, text, uuid) from authenticated;
grant execute on function public.admin_set_verification_status(uuid, text, text, text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- C. RPC DE LECTURE PAGINÉE admin_list_members
--    Renvoie UNE page (limit/offset) de membres + total_count (fenêtre), avec
--    filtres, tri et agrégats par membre calculés EN BASE. Évite de charger
--    toute la table côté application. service_role uniquement (elle renvoie des
--    données personnelles minimales de modération ; jamais d'email ici — l'email
--    vit dans auth.users et reste lu séparément via l'API admin).
--
--    Complétude : miroir SQL EXACT de REQUIRED_PROFILE_FIELDS
--    (src/lib/profile.ts) — first_name, gender, birth_date, country, city,
--    marital_status, bio, partner_expectations tous renseignés.
--
--    « Intérêts » et « matchs » vivent tous deux dans public.matches :
--      interests_count = toutes les lignes où le membre participe (envoyés+reçus)
--      matches_count   = celles au statut 'accepted' (relation mutuelle).
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_members(
  p_search text default null,
  p_account_status text default null,
  p_verification_status text default null,
  p_completeness text default null,
  p_has_photo text default null,
  p_country text default null,
  p_city text default null,
  p_sort text default 'recent',
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  id                  uuid,
  first_name          text,
  email               text,
  gender              public.gender,
  birth_date          date,
  country             text,
  city                text,
  account_status      public.account_status,
  verification_status public.profile_verification_status,
  is_complete         boolean,
  has_photo           boolean,
  photos_count        int,
  interests_count     int,
  matches_count       int,
  reports_count       int,
  created_at          timestamptz,
  updated_at          timestamptz,
  total_count         int
)
language sql
stable
security definer
set search_path = ''
as $$
  with filtered as (
    select
      p.id,
      p.first_name,
      u.email as v_email,
      p.gender,
      p.birth_date,
      p.country,
      p.city,
      p.account_status,
      p.verification_status,
      p.created_at,
      p.updated_at,
      (
        p.first_name is not null and btrim(p.first_name) <> ''
        and p.gender is not null
        and p.birth_date is not null
        and p.country is not null and btrim(p.country) <> ''
        and p.city is not null and btrim(p.city) <> ''
        and p.marital_status is not null
        and p.bio is not null and btrim(p.bio) <> ''
        and p.partner_expectations is not null and btrim(p.partner_expectations) <> ''
      ) as v_is_complete,
      exists (
        select 1 from public.photos ph
        where ph.profile_id = p.id and ph.is_primary
      ) as v_has_photo,
      (select count(*) from public.photos ph where ph.profile_id = p.id)::int
        as v_photos_count,
      (select count(*) from public.matches m
        where m.user_a = p.id or m.user_b = p.id)::int as v_interests_count,
      (select count(*) from public.matches m
        where (m.user_a = p.id or m.user_b = p.id)
          and m.status = 'accepted')::int as v_matches_count,
      (select count(*) from public.safety_reports sr
        where sr.reported_user_id = p.id)::int as v_reports_count
    from public.profiles p
    -- Jointure STRICTEMENT SERVEUR sur auth.users : la fonction est SECURITY
    -- DEFINER (propriétaire postgres) et EXECUTE est réservé à service_role, donc
    -- aucun rôle client ne peut lire auth.users par ce biais. Permet la recherche
    -- ET l'affichage de l'email dans le rendu serveur protégé.
    left join auth.users u on u.id = p.id
    where
      (p_account_status is null or p.account_status::text = p_account_status)
      and (p_verification_status is null
           or p.verification_status::text = p_verification_status)
      and (p_country is null or p.country = p_country)
      and (p_city is null or p.city = p_city)
      and (
        p_search is null
        or btrim(p_search) = ''
        or p.first_name ilike '%' || btrim(p_search) || '%'
        or p.city ilike '%' || btrim(p_search) || '%'
        or p.country ilike '%' || btrim(p_search) || '%'
        or u.email ilike '%' || btrim(p_search) || '%'
      )
  ),
  filtered2 as (
    select f.* from filtered f
    where
      (p_completeness is null
       or (p_completeness = 'complete' and f.v_is_complete)
       or (p_completeness = 'incomplete' and not f.v_is_complete))
      and (p_has_photo is null
       or (p_has_photo = 'with' and f.v_has_photo)
       or (p_has_photo = 'without' and not f.v_has_photo))
  )
  select
    f.id,
    f.first_name,
    f.v_email,
    f.gender,
    f.birth_date,
    f.country,
    f.city,
    f.account_status,
    f.verification_status,
    f.v_is_complete,
    f.v_has_photo,
    f.v_photos_count,
    f.v_interests_count,
    f.v_matches_count,
    f.v_reports_count,
    f.created_at,
    f.updated_at,
    count(*) over()::int as total_count
  from filtered2 f
  order by
    case when p_sort = 'alpha' then lower(coalesce(f.first_name, '')) end asc nulls last,
    case when p_sort = 'old' then f.created_at end asc,
    case when p_sort = 'updated' then f.updated_at end desc,
    case
      when p_sort = 'old' then null
      when p_sort = 'updated' then null
      when p_sort = 'alpha' then null
      else f.created_at
    end desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.admin_list_members(text, text, text, text, text, text, text, text, int, int) from public;
revoke all on function public.admin_list_members(text, text, text, text, text, text, text, text, int, int) from anon;
revoke all on function public.admin_list_members(text, text, text, text, text, text, text, text, int, int) from authenticated;
grant execute on function public.admin_list_members(text, text, text, text, text, text, text, text, int, int) to service_role;

-- ---------------------------------------------------------------------------
-- D. JOURNAL D'ADMINISTRATION UNIFIÉ — PAGINATION RÉELLE (service_role only)
--    admin_list_audit_events fusionne les TROIS journaux immuables par UNION ALL
--    et applique filtres + tri décroissant + pagination EN BASE. Aucune
--    duplication : les événements ne sont pas recopiés dans admin_audit_log ;
--    ils sont seulement LUS. total_count (fenêtre) rend la pagination fiable.
--
--    Aucune perte silencieuse d'événements anciens : la page suivante ramène les
--    plus anciens (contrairement à un plafond fixe).
--
--    Filtres : p_source (verification|account|report), p_actor (email exact),
--    p_target (uuid membre ciblé — verification/account uniquement ; les
--    signalements n'exposent pas de profil cible), p_since (borne basse).
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_audit_events(
  p_source text default null,
  p_actor text default null,
  p_target uuid default null,
  p_since timestamptz default null,
  p_limit int default 25,
  p_offset int default 0
)
returns table (
  source            text,
  event_id          uuid,
  actor_email       text,
  target_profile_id uuid,
  previous_status   text,
  new_status        text,
  note              text,
  created_at        timestamptz,
  total_count       int
)
language sql
stable
security definer
set search_path = ''
as $$
  with unified as (
    select
      'verification'::text          as source,
      a.id                          as event_id,
      a.actor_email_snapshot        as actor_email,
      a.target_profile_id_snapshot  as target_profile_id,
      a.previous_status             as previous_status,
      a.new_status                  as new_status,
      a.reason                      as note,
      a.created_at                  as created_at
    from public.admin_audit_log a
    union all
    select
      'account'::text,
      m.id,
      m.actor_email_snapshot,
      m.profile_id_snapshot,
      m.previous_status::text,
      m.new_status::text,
      m.reason,
      m.created_at
    from public.account_moderation_actions m
    union all
    select
      'report'::text,
      r.id,
      r.actor_email_snapshot,
      null::uuid,
      r.previous_status,
      r.new_status,
      r.note,
      r.created_at
    from public.safety_report_actions r
  ),
  filtered as (
    select u.* from unified u
    where (p_source is null or u.source = p_source)
      and (p_actor is null or u.actor_email = p_actor)
      and (p_target is null or u.target_profile_id = p_target)
      and (p_since is null or u.created_at >= p_since)
  )
  select
    f.source,
    f.event_id,
    f.actor_email,
    f.target_profile_id,
    f.previous_status,
    f.new_status,
    f.note,
    f.created_at,
    count(*) over()::int as total_count
  from filtered f
  order by f.created_at desc, f.event_id
  limit least(greatest(coalesce(p_limit, 25), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.admin_list_audit_events(text, text, uuid, timestamptz, int, int) from public;
revoke all on function public.admin_list_audit_events(text, text, uuid, timestamptz, int, int) from anon;
revoke all on function public.admin_list_audit_events(text, text, uuid, timestamptz, int, int) from authenticated;
grant execute on function public.admin_list_audit_events(text, text, uuid, timestamptz, int, int) to service_role;

-- ---------------------------------------------------------------------------
-- E. LISTE DES ACTEURS DISTINCTS (pour le filtre « administrateur » du journal).
--    Petit ensemble (les admins). service_role uniquement.
-- ---------------------------------------------------------------------------
create or replace function public.admin_audit_actors()
returns table (actor_email text)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct e as actor_email
  from (
    select a.actor_email_snapshot as e
      from public.admin_audit_log a
      where a.actor_email_snapshot is not null
    union
    select m.actor_email_snapshot
      from public.account_moderation_actions m
      where m.actor_email_snapshot is not null
    union
    select r.actor_email_snapshot
      from public.safety_report_actions r
      where r.actor_email_snapshot is not null
  ) s
  order by e;
$$;

revoke all on function public.admin_audit_actors() from public;
revoke all on function public.admin_audit_actors() from anon;
revoke all on function public.admin_audit_actors() from authenticated;
grant execute on function public.admin_audit_actors() to service_role;
