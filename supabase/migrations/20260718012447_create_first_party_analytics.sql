-- =============================================================================
-- Analytique interne FIRST-PARTY & présence (privacy-first).
--
-- Remplace les métriques « Non disponible » du back-office par une mesure
-- d'audience interne SANS service tiers. Principes de confidentialité :
--   - AUCUNE adresse IP, AUCUN User-Agent, AUCUNE empreinte navigateur ;
--   - AUCUNE URL brute : uniquement des routes NORMALISÉES (path_group) dont
--     les UUID/tokens sont remplacés par leur segment nominal ([matchId]…) ;
--   - référent réduit au HOSTNAME ; UTM limités à l'allowlist (source, medium,
--     campaign, content, term) avec bornes strictes ;
--   - aucune donnée métier privée (nom, email, message, texte de profil) ;
--   - rétention limitée : sessions 90 j, événements 180 j ; l'activité membre
--     (member_activity) vit avec le profil (CASCADE à la suppression).
--
-- Définitions :
--   - « en ligne » = last_seen_at >= now() - 120 s (seuil paramétrable) ;
--   - « visiteur unique » = session navigateur TECHNIQUE distincte (cookie
--     first-party aléatoire), pas une personne physique ;
--   - dernière connexion = auth.users.last_sign_in_at (aucun doublon créé) ;
--   - dernière activité membre = member_activity.last_seen_at (heartbeat).
--
-- Sécurité :
--   - RLS ACTIVÉE sur les 3 tables, AUCUNE policy : anon/authenticated n'ont
--     aucun accès direct (lecture ou écriture) ; seuls le serveur privilégié
--     (service_role, qui contourne la RLS) et les fonctions ci-dessous opèrent ;
--   - toutes les fonctions : search_path = '' + objets qualifiés ; EXECUTE
--     révoqué à public/anon/authenticated, accordé à service_role uniquement ;
--   - SECURITY INVOKER partout (le service_role a déjà les privilèges — pas
--     besoin d'élévation DEFINER).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- A. HELPER de validation d'une route normalisée.
--    Autorise uniquement /segment/segment2/[param] (charset borné, <= 120).
--    REFUSE toute séquence ressemblant à un UUID (défense en profondeur : même
--    si la normalisation applicative échouait, la base n'accepte pas un
--    identifiant réel comme chemin).
-- ---------------------------------------------------------------------------
create or replace function public.analytics_is_valid_path_group(p_path text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_path is not null
     and char_length(p_path) between 1 and 120
     and p_path ~ '^/[A-Za-z0-9\[\]_/-]*$'
     and p_path !~ '//'
     and p_path !~* '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
$$;

revoke all on function public.analytics_is_valid_path_group(text) from public;
revoke all on function public.analytics_is_valid_path_group(text) from anon;
revoke all on function public.analytics_is_valid_path_group(text) from authenticated;
grant execute on function public.analytics_is_valid_path_group(text) to service_role;

-- ---------------------------------------------------------------------------
-- B. TABLE member_activity — présence & dernière activité RÉELLE d'un membre.
--    Une ligne par profil. Vit et meurt avec le profil (CASCADE).
--    N'est JAMAIS un substitut de auth.users.last_sign_in_at (connexion).
-- ---------------------------------------------------------------------------
create table public.member_activity (
  profile_id      uuid primary key
                  references public.profiles(id) on delete cascade,
  first_seen_at   timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  last_path_group text null
                  check (last_path_group is null
                         or public.analytics_is_valid_path_group(last_path_group)),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index member_activity_last_seen_at_idx
  on public.member_activity (last_seen_at desc);

alter table public.member_activity enable row level security;
revoke all on table public.member_activity from public;
revoke all on table public.member_activity from anon;
revoke all on table public.member_activity from authenticated;

-- ---------------------------------------------------------------------------
-- C. TABLE analytics_sessions — session navigateur TECHNIQUE first-party.
--    id = UUID aléatoire porté par un cookie HttpOnly (jamais un identifiant
--    publicitaire). profile_id associé APRÈS authentification (SET NULL à la
--    suppression du profil : la ligne redevient anonyme).
--    First-touch : referrer/utm/first_path_group figés à la création, jamais
--    écrasés par une valeur vide.
-- ---------------------------------------------------------------------------
create table public.analytics_sessions (
  id               uuid primary key,
  profile_id       uuid null
                   references public.profiles(id) on delete set null,
  started_at       timestamptz not null default now(),
  last_seen_at     timestamptz not null default now(),
  first_path_group text null
                   check (first_path_group is null
                          or public.analytics_is_valid_path_group(first_path_group)),
  last_path_group  text null
                   check (last_path_group is null
                          or public.analytics_is_valid_path_group(last_path_group)),
  referrer_domain  text null
                   check (referrer_domain is null
                          or referrer_domain ~ '^[a-z0-9.-]{1,190}$'),
  utm_source       text null check (utm_source   is null or utm_source   ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
  utm_medium       text null check (utm_medium   is null or utm_medium   ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
  utm_campaign     text null check (utm_campaign is null or utm_campaign ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
  utm_content      text null check (utm_content  is null or utm_content  ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
  utm_term         text null check (utm_term     is null or utm_term     ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index analytics_sessions_last_seen_at_idx on public.analytics_sessions (last_seen_at desc);
create index analytics_sessions_profile_id_idx   on public.analytics_sessions (profile_id) where profile_id is not null;
create index analytics_sessions_started_at_idx   on public.analytics_sessions (started_at);
create index analytics_sessions_utm_source_idx   on public.analytics_sessions (utm_source) where utm_source is not null;

alter table public.analytics_sessions enable row level security;
revoke all on table public.analytics_sessions from public;
revoke all on table public.analytics_sessions from anon;
revoke all on table public.analytics_sessions from authenticated;

-- ---------------------------------------------------------------------------
-- D. TABLE analytics_events — événements autorisés (allowlist stricte).
--    metadata : réservé pour l'avenir — le MVP n'autorise AUCUNE clé ('{}').
--    Les conversions métier (inscription terminée, profil complété, intérêts,
--    matchs) sont DÉRIVÉES des tables métier, jamais enregistrées ici.
-- ---------------------------------------------------------------------------
create table public.analytics_events (
  id          bigint generated always as identity primary key,
  session_id  uuid not null
              references public.analytics_sessions(id) on delete cascade,
  profile_id  uuid null
              references public.profiles(id) on delete set null,
  event_type  text not null
              check (event_type in ('page_view', 'registration_started', 'login_succeeded')),
  path_group  text null
              check (path_group is null
                     or public.analytics_is_valid_path_group(path_group)),
  occurred_at timestamptz not null default now(),
  metadata    jsonb not null default '{}'::jsonb
              check (pg_column_size(metadata) <= 1024)
);

create index analytics_events_occurred_at_idx on public.analytics_events (occurred_at);
create index analytics_events_type_occurred_idx on public.analytics_events (event_type, occurred_at);
create index analytics_events_session_id_idx on public.analytics_events (session_id);
create index analytics_events_profile_id_idx on public.analytics_events (profile_id) where profile_id is not null;

alter table public.analytics_events enable row level security;
revoke all on table public.analytics_events from public;
revoke all on table public.analytics_events from anon;
revoke all on table public.analytics_events from authenticated;

-- ---------------------------------------------------------------------------
-- E. INGESTION — analytics_upsert_session (service_role uniquement).
--    Crée ou rafraîchit la session : heartbeat last_seen_at, dernier chemin,
--    association au profil authentifié (une fois posée, jamais retirée ici),
--    first-touch (referrer/utm/first_path) JAMAIS écrasé par une valeur vide.
--    Rejette toute donnée non conforme (erreur métier STABLE, sans détail).
-- ---------------------------------------------------------------------------
create or replace function public.analytics_upsert_session(
  p_session_id      uuid,
  p_profile_id      uuid default null,
  p_path_group      text default null,
  p_referrer_domain text default null,
  p_utm_source      text default null,
  p_utm_medium      text default null,
  p_utm_campaign    text default null,
  p_utm_content     text default null,
  p_utm_term        text default null
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_ref  text := nullif(lower(btrim(coalesce(p_referrer_domain, ''))), '');
  v_src  text := nullif(lower(btrim(coalesce(p_utm_source, ''))), '');
  v_med  text := nullif(lower(btrim(coalesce(p_utm_medium, ''))), '');
  v_cmp  text := nullif(lower(btrim(coalesce(p_utm_campaign, ''))), '');
  v_cnt  text := nullif(lower(btrim(coalesce(p_utm_content, ''))), '');
  v_trm  text := nullif(lower(btrim(coalesce(p_utm_term, ''))), '');
  v_path text := nullif(btrim(coalesce(p_path_group, '')), '');
begin
  if p_session_id is null then
    raise exception 'ANALYTICS_INVALID_SESSION' using errcode = '22023';
  end if;
  if v_path is not null and not public.analytics_is_valid_path_group(v_path) then
    raise exception 'ANALYTICS_INVALID_PATH' using errcode = '22023';
  end if;
  if (v_ref is not null and v_ref !~ '^[a-z0-9.-]{1,190}$')
     or (v_src is not null and v_src !~ '^[a-z0-9][a-z0-9._-]{0,79}$')
     or (v_med is not null and v_med !~ '^[a-z0-9][a-z0-9._-]{0,79}$')
     or (v_cmp is not null and v_cmp !~ '^[a-z0-9][a-z0-9._-]{0,79}$')
     or (v_cnt is not null and v_cnt !~ '^[a-z0-9][a-z0-9._-]{0,79}$')
     or (v_trm is not null and v_trm !~ '^[a-z0-9][a-z0-9._-]{0,79}$') then
    raise exception 'ANALYTICS_INVALID_ACQUISITION' using errcode = '22023';
  end if;

  insert into public.analytics_sessions as s (
    id, profile_id, started_at, last_seen_at,
    first_path_group, last_path_group, referrer_domain,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term
  )
  values (
    p_session_id, p_profile_id, now(), now(),
    v_path, v_path, v_ref,
    v_src, v_med, v_cmp, v_cnt, v_trm
  )
  on conflict (id) do update set
    last_seen_at     = now(),
    updated_at       = now(),
    -- Association au profil : posée une seule fois, jamais retirée ici.
    profile_id       = coalesce(s.profile_id, excluded.profile_id),
    last_path_group  = coalesce(excluded.last_path_group, s.last_path_group),
    -- First-touch : une valeur déjà renseignée n'est JAMAIS écrasée (ni par
    -- NULL ni par une chaîne vide, neutralisée en NULL plus haut).
    first_path_group = coalesce(s.first_path_group, excluded.first_path_group),
    referrer_domain  = coalesce(s.referrer_domain,  excluded.referrer_domain),
    utm_source       = coalesce(s.utm_source,   excluded.utm_source),
    utm_medium       = coalesce(s.utm_medium,   excluded.utm_medium),
    utm_campaign     = coalesce(s.utm_campaign, excluded.utm_campaign),
    utm_content      = coalesce(s.utm_content,  excluded.utm_content),
    utm_term         = coalesce(s.utm_term,     excluded.utm_term);
end;
$$;

revoke all on function public.analytics_upsert_session(uuid, uuid, text, text, text, text, text, text, text) from public;
revoke all on function public.analytics_upsert_session(uuid, uuid, text, text, text, text, text, text, text) from anon;
revoke all on function public.analytics_upsert_session(uuid, uuid, text, text, text, text, text, text, text) from authenticated;
grant execute on function public.analytics_upsert_session(uuid, uuid, text, text, text, text, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- F. INGESTION — analytics_record_event (service_role uniquement).
--    Allowlist d'événements ; session obligatoire ; metadata : AUCUNE clé
--    autorisée pour le MVP ; anti-doublon page_view (même session + même
--    route < 30 s → ignoré silencieusement).
-- ---------------------------------------------------------------------------
create or replace function public.analytics_record_event(
  p_session_id uuid,
  p_profile_id uuid default null,
  p_event_type text default null,
  p_path_group text default null,
  p_metadata   jsonb default '{}'::jsonb
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_path text := nullif(btrim(coalesce(p_path_group, '')), '');
begin
  if p_event_type is null
     or p_event_type not in ('page_view', 'registration_started', 'login_succeeded') then
    raise exception 'ANALYTICS_INVALID_EVENT' using errcode = '22023';
  end if;
  if v_path is not null and not public.analytics_is_valid_path_group(v_path) then
    raise exception 'ANALYTICS_INVALID_PATH' using errcode = '22023';
  end if;
  -- metadata : clés explicitement autorisées = AUCUNE pour le MVP. Tout objet
  -- non vide (ou non-objet) est refusé : jamais de texte utilisateur libre.
  if p_metadata is null
     or jsonb_typeof(p_metadata) <> 'object'
     or p_metadata <> '{}'::jsonb then
    raise exception 'ANALYTICS_INVALID_METADATA' using errcode = '22023';
  end if;
  if not exists (select 1 from public.analytics_sessions where id = p_session_id) then
    raise exception 'ANALYTICS_SESSION_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Anti-doublon évident : même page_view (session + route) reçu < 30 s.
  if p_event_type = 'page_view' and exists (
    select 1 from public.analytics_events e
      where e.session_id = p_session_id
        and e.event_type = 'page_view'
        and e.path_group is not distinct from v_path
        and e.occurred_at >= now() - interval '30 seconds'
  ) then
    return;
  end if;

  insert into public.analytics_events (session_id, profile_id, event_type, path_group, metadata)
  values (p_session_id, p_profile_id, p_event_type, v_path, '{}'::jsonb);
end;
$$;

revoke all on function public.analytics_record_event(uuid, uuid, text, text, jsonb) from public;
revoke all on function public.analytics_record_event(uuid, uuid, text, text, jsonb) from anon;
revoke all on function public.analytics_record_event(uuid, uuid, text, text, jsonb) from authenticated;
grant execute on function public.analytics_record_event(uuid, uuid, text, text, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- G. PRÉSENCE MEMBRE — analytics_touch_member_activity (service_role).
--    p_profile_id provient EXCLUSIVEMENT de la session Supabase validée côté
--    serveur (jamais du navigateur). Timestamp + route normalisée, rien d'autre.
-- ---------------------------------------------------------------------------
create or replace function public.analytics_touch_member_activity(
  p_profile_id uuid,
  p_path_group text default null
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_path text := nullif(btrim(coalesce(p_path_group, '')), '');
begin
  if p_profile_id is null then
    raise exception 'ANALYTICS_INVALID_PROFILE' using errcode = '22023';
  end if;
  if v_path is not null and not public.analytics_is_valid_path_group(v_path) then
    raise exception 'ANALYTICS_INVALID_PATH' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_profile_id) then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.member_activity as ma (profile_id, first_seen_at, last_seen_at, last_path_group)
  values (p_profile_id, now(), now(), v_path)
  on conflict (profile_id) do update set
    last_seen_at    = now(),
    updated_at      = now(),
    last_path_group = coalesce(excluded.last_path_group, ma.last_path_group);
end;
$$;

revoke all on function public.analytics_touch_member_activity(uuid, text) from public;
revoke all on function public.analytics_touch_member_activity(uuid, text) from anon;
revoke all on function public.analytics_touch_member_activity(uuid, text) from authenticated;
grant execute on function public.analytics_touch_member_activity(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- H. RPC ADMIN — admin_get_analytics_overview (service_role uniquement).
--    Agrégats temps réel + période. Taux NULL quand le dénominateur est nul.
--    « sessions » = sessions DÉMARRÉES dans la période ;
--    « unique_visitors » = sessions techniques ACTIVES pendant la période.
--    Inscriptions / profils complétés : DÉRIVÉS des tables métier (autorité).
-- ---------------------------------------------------------------------------
create or replace function public.admin_get_analytics_overview(
  p_from timestamptz,
  p_to   timestamptz,
  p_online_threshold_seconds integer default 120
)
returns table (
  online_members               bigint,
  online_anonymous_visitors    bigint,
  active_members_24h           bigint,
  active_members_7d            bigint,
  sessions                     bigint,
  unique_visitors              bigint,
  page_views                   bigint,
  registrations                bigint,
  completed_profiles           bigint,
  registration_conversion_rate numeric,
  profile_completion_rate      numeric
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_threshold interval;
  v_sessions bigint; v_visitors bigint; v_views bigint;
  v_regs bigint; v_completed bigint;
begin
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'ANALYTICS_INVALID_RANGE' using errcode = '22023';
  end if;
  if p_online_threshold_seconds is null
     or p_online_threshold_seconds < 30
     or p_online_threshold_seconds > 3600 then
    raise exception 'ANALYTICS_INVALID_THRESHOLD' using errcode = '22023';
  end if;
  v_threshold := make_interval(secs => p_online_threshold_seconds);

  select count(*) into v_sessions
    from public.analytics_sessions s
    where s.started_at >= p_from and s.started_at < p_to;
  select count(*) into v_visitors
    from public.analytics_sessions s
    where s.last_seen_at >= p_from and s.started_at < p_to;
  select count(*) into v_views
    from public.analytics_events e
    where e.event_type = 'page_view'
      and e.occurred_at >= p_from and e.occurred_at < p_to;
  select count(*) into v_regs
    from public.profiles p
    where p.created_at >= p_from and p.created_at < p_to;
  select count(*) into v_completed
    from public.profiles p
    where p.onboarding_completed_at is not null
      and p.onboarding_completed_at >= p_from and p.onboarding_completed_at < p_to;

  return query select
    (select count(*) from public.member_activity ma
       where ma.last_seen_at >= now() - v_threshold),
    (select count(*) from public.analytics_sessions s
       where s.profile_id is null and s.last_seen_at >= now() - v_threshold),
    (select count(*) from public.member_activity ma
       where ma.last_seen_at >= now() - interval '24 hours'),
    (select count(*) from public.member_activity ma
       where ma.last_seen_at >= now() - interval '7 days'),
    v_sessions,
    v_visitors,
    v_views,
    v_regs,
    v_completed,
    case when v_sessions > 0 then round(v_regs::numeric / v_sessions, 4) end,
    case when v_regs > 0 then round(v_completed::numeric / v_regs, 4) end;
end;
$$;

revoke all on function public.admin_get_analytics_overview(timestamptz, timestamptz, integer) from public;
revoke all on function public.admin_get_analytics_overview(timestamptz, timestamptz, integer) from anon;
revoke all on function public.admin_get_analytics_overview(timestamptz, timestamptz, integer) from authenticated;
grant execute on function public.admin_get_analytics_overview(timestamptz, timestamptz, integer) to service_role;

-- ---------------------------------------------------------------------------
-- I. RPC ADMIN — admin_get_acquisition_breakdown (service_role uniquement).
--    Ventilation par canal TECHNIQUE (UTM prioritaire, sinon domaine référent
--    → medium 'referral', sinon 'direct'/'none' — jamais de source inventée).
--    Agrégats uniquement : AUCUN identifiant de session retourné.
-- ---------------------------------------------------------------------------
create or replace function public.admin_get_acquisition_breakdown(
  p_from  timestamptz,
  p_to    timestamptz,
  p_limit integer default 20
)
returns table (
  source             text,
  medium             text,
  campaign           text,
  sessions           bigint,
  registrations      bigint,
  completed_profiles bigint,
  conversion_rate    numeric
)
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'ANALYTICS_INVALID_RANGE' using errcode = '22023';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'ANALYTICS_INVALID_LIMIT' using errcode = '22023';
  end if;

  return query
    with scoped as (
      select
        coalesce(s.utm_source, s.referrer_domain, 'direct')            as src,
        coalesce(s.utm_medium,
                 case when s.utm_source is not null then '(non renseigné)'
                      when s.referrer_domain is not null then 'referral'
                      else 'none' end)                                 as med,
        coalesce(s.utm_campaign, '(aucune)')                           as cmp,
        s.profile_id                                                   as pid
      from public.analytics_sessions s
      where s.started_at >= p_from and s.started_at < p_to
    )
    select
      sc.src,
      sc.med,
      sc.cmp,
      count(*)::bigint as sessions,
      count(distinct p.id)::bigint as registrations,
      count(distinct p.id) filter (where p.onboarding_completed_at is not null)::bigint
        as completed_profiles,
      case when count(*) > 0
           then round(count(distinct p.id)::numeric / count(*), 4) end as conversion_rate
    from scoped sc
    left join public.profiles p
      on p.id = sc.pid
     and p.created_at >= p_from and p.created_at < p_to
    group by sc.src, sc.med, sc.cmp
    order by count(*) desc, sc.src asc
    limit p_limit;
end;
$$;

revoke all on function public.admin_get_acquisition_breakdown(timestamptz, timestamptz, integer) from public;
revoke all on function public.admin_get_acquisition_breakdown(timestamptz, timestamptz, integer) from anon;
revoke all on function public.admin_get_acquisition_breakdown(timestamptz, timestamptz, integer) from authenticated;
grant execute on function public.admin_get_acquisition_breakdown(timestamptz, timestamptz, integer) to service_role;

-- ---------------------------------------------------------------------------
-- I bis. RPC ADMIN — admin_get_top_pages (service_role uniquement).
--    Routes NORMALISÉES les plus consultées (pages vues + sessions distinctes).
--    Jamais de token/UUID réel : path_group est validé/anonymisé en amont.
-- ---------------------------------------------------------------------------
create or replace function public.admin_get_top_pages(
  p_from  timestamptz,
  p_to    timestamptz,
  p_limit integer default 15
)
returns table (
  path_group text,
  page_views bigint,
  sessions   bigint
)
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'ANALYTICS_INVALID_RANGE' using errcode = '22023';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'ANALYTICS_INVALID_LIMIT' using errcode = '22023';
  end if;

  return query
    select
      coalesce(e.path_group, '(inconnue)') as path_group,
      count(*)::bigint                     as page_views,
      count(distinct e.session_id)::bigint as sessions
    from public.analytics_events e
    where e.event_type = 'page_view'
      and e.occurred_at >= p_from and e.occurred_at < p_to
    group by coalesce(e.path_group, '(inconnue)')
    order by count(*) desc, 1 asc
    limit p_limit;
end;
$$;

revoke all on function public.admin_get_top_pages(timestamptz, timestamptz, integer) from public;
revoke all on function public.admin_get_top_pages(timestamptz, timestamptz, integer) from anon;
revoke all on function public.admin_get_top_pages(timestamptz, timestamptz, integer) from authenticated;
grant execute on function public.admin_get_top_pages(timestamptz, timestamptz, integer) to service_role;

-- ---------------------------------------------------------------------------
-- J. RPC ADMIN — admin_get_member_activity (service_role uniquement).
--    Dernière connexion (auth.users.last_sign_in_at — source d'autorité, aucun
--    champ redondant créé) + dernière activité (member_activity.last_seen_at)
--    pour un LOT d'identifiants (évite N appels getUserById).
-- ---------------------------------------------------------------------------
create or replace function public.admin_get_member_activity(
  p_profile_ids uuid[]
)
returns table (
  profile_id      uuid,
  last_sign_in_at timestamptz,
  last_seen_at    timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- SECURITY DEFINER nécessaire : lecture de auth.users (schéma auth).
  if p_profile_ids is null or array_length(p_profile_ids, 1) is null then
    return;
  end if;
  if array_length(p_profile_ids, 1) > 200 then
    raise exception 'ANALYTICS_TOO_MANY_IDS' using errcode = '22023';
  end if;

  return query
    select
      ids.id,
      u.last_sign_in_at,
      ma.last_seen_at
    from unnest(p_profile_ids) as ids(id)
    left join auth.users u          on u.id = ids.id
    left join public.member_activity ma on ma.profile_id = ids.id;
end;
$$;

revoke all on function public.admin_get_member_activity(uuid[]) from public;
revoke all on function public.admin_get_member_activity(uuid[]) from anon;
revoke all on function public.admin_get_member_activity(uuid[]) from authenticated;
grant execute on function public.admin_get_member_activity(uuid[]) to service_role;

-- ---------------------------------------------------------------------------
-- K. RÉTENTION — purge_expired_analytics (service_role uniquement).
--    Événements > 180 j, sessions inactives > 90 j (leurs événements suivent
--    par CASCADE). member_activity n'est JAMAIS purgée ici : elle vit avec le
--    profil. Aucune donnée métier touchée.
-- ---------------------------------------------------------------------------
create or replace function public.purge_expired_analytics()
returns table (deleted_events bigint, deleted_sessions bigint)
language plpgsql
set search_path = ''
as $$
declare
  v_events bigint;
  v_sessions bigint;
begin
  delete from public.analytics_events e
    where e.occurred_at < now() - interval '180 days';
  get diagnostics v_events = row_count;

  delete from public.analytics_sessions s
    where s.last_seen_at < now() - interval '90 days';
  get diagnostics v_sessions = row_count;

  return query select v_events, v_sessions;
end;
$$;

revoke all on function public.purge_expired_analytics() from public;
revoke all on function public.purge_expired_analytics() from anon;
revoke all on function public.purge_expired_analytics() from authenticated;
grant execute on function public.purge_expired_analytics() to service_role;
