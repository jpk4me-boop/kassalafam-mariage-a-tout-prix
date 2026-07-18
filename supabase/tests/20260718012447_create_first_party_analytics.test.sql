-- =============================================================================
-- Analytique first-party — Suite de tests SQL AUTO-ASSERTANTE
-- (migration 20260718012447_create_first_party_analytics).
--
-- EXÉCUTION : à jouer INTÉGRALEMENT et VERBATIM sur une base JETABLE (branche
-- Supabase / lab), avec `psql -v ON_ERROR_STOP=1`, APRÈS application de toutes
-- les migrations. Toute la suite tient dans UN SEUL `BEGIN … ROLLBACK` : aucune
-- donnée n'est conservée. Chaque scénario est un bloc `DO $$ … $$`
-- AUTO-ASSERTANT ; tout écart lève `ASSERT FAIL S<n>: …`.
-- Un déroulé complet SANS erreur = les 26 scénarios ont réussi.
--
-- NOTE TEMPORELLE : now() est CONSTANT dans la transaction. Les scénarios qui
-- vérifient un rafraîchissement d'horodatage antidatent d'abord la ligne par un
-- UPDATE privilégié, puis vérifient le retour à now().
-- UUID famille 00cc (profils/acteurs) et 00ee (sessions) — distincts des autres
-- suites du dépôt. JAMAIS sur Production.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Création d'une session ANONYME (first-touch complet enregistré)
-- ---------------------------------------------------------------------------
DO $$
declare v_cnt int; v_profile uuid; v_first text; v_src text;
begin
  perform public.analytics_upsert_session(
    '00000000-0000-0000-00ee-000000000001', null, '/register',
    'facebook.com', 'facebook', 'social', 'lancement', null, null);

  select count(*) into v_cnt from public.analytics_sessions
    where id = '00000000-0000-0000-00ee-000000000001';
  if v_cnt <> 1 then raise exception 'ASSERT FAIL S1: session_count=%', v_cnt; end if;

  select profile_id, first_path_group, utm_source into v_profile, v_first, v_src
    from public.analytics_sessions where id = '00000000-0000-0000-00ee-000000000001';
  if v_profile is not null then raise exception 'ASSERT FAIL S1: profile_id non NULL'; end if;
  if v_first <> '/register' then raise exception 'ASSERT FAIL S1: first_path=%', v_first; end if;
  if v_src <> 'facebook' then raise exception 'ASSERT FAIL S1: utm_source=%', v_src; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Heartbeat : last_seen_at antidaté puis rafraîchi par un nouvel upsert
-- ---------------------------------------------------------------------------
DO $$
declare v_seen timestamptz; v_last text;
begin
  update public.analytics_sessions
    set last_seen_at = now() - interval '1 hour'
    where id = '00000000-0000-0000-00ee-000000000001';

  perform public.analytics_upsert_session(
    '00000000-0000-0000-00ee-000000000001', null, '/login',
    null, null, null, null, null, null);

  select last_seen_at, last_path_group into v_seen, v_last
    from public.analytics_sessions where id = '00000000-0000-0000-00ee-000000000001';
  if v_seen <> now() then raise exception 'ASSERT FAIL S2: last_seen non rafraîchi'; end if;
  if v_last <> '/login' then raise exception 'ASSERT FAIL S2: last_path=%', v_last; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Association ULTÉRIEURE au profil (posée une fois, jamais retirée)
-- ---------------------------------------------------------------------------
DO $$
declare v_profile uuid;
begin
  insert into auth.users (id, email) values
    ('00000000-0000-0000-00cc-000000000003','ana03@ex.test');
  insert into public.profiles (id, intention) values
    ('00000000-0000-0000-00cc-000000000003','mariage_serieux');

  perform public.analytics_upsert_session(
    '00000000-0000-0000-00ee-000000000001',
    '00000000-0000-0000-00cc-000000000003', '/dashboard',
    null, null, null, null, null, null);
  select profile_id into v_profile
    from public.analytics_sessions where id = '00000000-0000-0000-00ee-000000000001';
  if v_profile is distinct from '00000000-0000-0000-00cc-000000000003'::uuid then
    raise exception 'ASSERT FAIL S3: association profil manquante';
  end if;

  -- Un heartbeat anonyme ultérieur ne DÉTACHE pas le profil.
  perform public.analytics_upsert_session(
    '00000000-0000-0000-00ee-000000000001', null, '/discover',
    null, null, null, null, null, null);
  select profile_id into v_profile
    from public.analytics_sessions where id = '00000000-0000-0000-00ee-000000000001';
  if v_profile is distinct from '00000000-0000-0000-00cc-000000000003'::uuid then
    raise exception 'ASSERT FAIL S3: profil détaché par un heartbeat anonyme';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. FIRST-TOUCH : utm/first_path/referrer jamais écrasés (ni NULL ni vide)
-- ---------------------------------------------------------------------------
DO $$
declare v_src text; v_first text; v_ref text;
begin
  perform public.analytics_upsert_session(
    '00000000-0000-0000-00ee-000000000001', null, '/aide',
    '', '', null, 'autre-campagne', null, null);

  select utm_source, first_path_group, referrer_domain into v_src, v_first, v_ref
    from public.analytics_sessions where id = '00000000-0000-0000-00ee-000000000001';
  if v_src <> 'facebook' then raise exception 'ASSERT FAIL S4: utm_source écrasé (%)', v_src; end if;
  if v_first <> '/register' then raise exception 'ASSERT FAIL S4: first_path écrasé (%)', v_first; end if;
  if v_ref <> 'facebook.com' then raise exception 'ASSERT FAIL S4: referrer écrasé (%)', v_ref; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Enregistrement d'une page vue AUTORISÉE (+ anti-doublon < 30 s)
-- ---------------------------------------------------------------------------
DO $$
declare v_cnt int;
begin
  perform public.analytics_record_event(
    '00000000-0000-0000-00ee-000000000001', null, 'page_view', '/register', '{}'::jsonb);
  perform public.analytics_record_event(
    '00000000-0000-0000-00ee-000000000001', null, 'page_view', '/register', '{}'::jsonb);

  select count(*) into v_cnt from public.analytics_events
    where session_id = '00000000-0000-0000-00ee-000000000001'
      and event_type = 'page_view' and path_group = '/register';
  if v_cnt <> 1 then raise exception 'ASSERT FAIL S5: page_view count=% (anti-doublon)', v_cnt; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Refus d'un événement INCONNU : ANALYTICS_INVALID_EVENT
-- ---------------------------------------------------------------------------
DO $$
declare v_raised boolean := false; v_msg text;
begin
  begin
    perform public.analytics_record_event(
      '00000000-0000-0000-00ee-000000000001', null, 'profile_viewed', '/', '{}'::jsonb);
  exception when others then v_raised := true; v_msg := sqlerrm; end;
  if not v_raised or v_msg <> 'ANALYTICS_INVALID_EVENT' then
    raise exception 'ASSERT FAIL S6: attendu ANALYTICS_INVALID_EVENT, obtenu %', coalesce(v_msg,'(succès)');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Refus d'une chaîne TROP LONGUE (utm_source 81 caractères)
-- ---------------------------------------------------------------------------
DO $$
declare v_raised boolean := false; v_msg text;
begin
  begin
    perform public.analytics_upsert_session(
      '00000000-0000-0000-00ee-000000000007', null, '/',
      null, repeat('a', 81), null, null, null, null);
  exception when others then v_raised := true; v_msg := sqlerrm; end;
  if not v_raised or v_msg <> 'ANALYTICS_INVALID_ACQUISITION' then
    raise exception 'ASSERT FAIL S7: attendu ANALYTICS_INVALID_ACQUISITION, obtenu %', coalesce(v_msg,'(succès)');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 8. Refus d'une METADATA interdite (aucune clé autorisée au MVP)
-- ---------------------------------------------------------------------------
DO $$
declare v_raised boolean := false; v_msg text;
begin
  begin
    perform public.analytics_record_event(
      '00000000-0000-0000-00ee-000000000001', null, 'page_view', '/',
      '{"email":"fuite@ex.test"}'::jsonb);
  exception when others then v_raised := true; v_msg := sqlerrm; end;
  if not v_raised or v_msg <> 'ANALYTICS_INVALID_METADATA' then
    raise exception 'ASSERT FAIL S8: attendu ANALYTICS_INVALID_METADATA, obtenu %', coalesce(v_msg,'(succès)');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 9. anon : AUCUNE lecture directe des tables analytiques (42501)
-- ---------------------------------------------------------------------------
DO $$
declare v_raised boolean := false; v_state text; v_tmp int;
begin
  begin
    set local role anon;
    select count(*) into v_tmp from public.analytics_sessions;
  exception when others then v_raised := true; v_state := sqlstate; end;
  reset role;
  if not v_raised or v_state <> '42501' then
    raise exception 'ASSERT FAIL S9: anon lit analytics_sessions (state=%)', coalesce(v_state,'(succès)');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 10. authenticated : AUCUNE lecture directe (42501) — les 3 tables
-- ---------------------------------------------------------------------------
DO $$
declare v_raised boolean := false; v_state text; v_tmp int;
begin
  begin
    set local role authenticated;
    select count(*) into v_tmp from public.analytics_events;
  exception when others then v_raised := true; v_state := sqlstate; end;
  reset role;
  if not v_raised or v_state <> '42501' then
    raise exception 'ASSERT FAIL S10: authenticated lit analytics_events (state=%)', coalesce(v_state,'(succès)');
  end if;

  v_raised := false; v_state := null;
  begin
    set local role authenticated;
    select count(*) into v_tmp from public.member_activity;
  exception when others then v_raised := true; v_state := sqlstate; end;
  reset role;
  if not v_raised or v_state <> '42501' then
    raise exception 'ASSERT FAIL S10: authenticated lit member_activity (state=%)', coalesce(v_state,'(succès)');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 11. anon : aucune exécution des RPC admin (42501)
-- ---------------------------------------------------------------------------
DO $$
declare v_raised boolean := false; v_state text;
begin
  begin
    set local role anon;
    perform public.admin_get_analytics_overview(now() - interval '1 day', now(), 120);
  exception when others then v_raised := true; v_state := sqlstate; end;
  reset role;
  if not v_raised or v_state <> '42501' then
    raise exception 'ASSERT FAIL S11: anon exécute overview (state=%)', coalesce(v_state,'(succès)');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 12. authenticated : aucune exécution des RPC admin (42501)
-- ---------------------------------------------------------------------------
DO $$
declare v_raised boolean := false; v_state text;
begin
  begin
    set local role authenticated;
    perform public.admin_get_member_activity(
      array['00000000-0000-0000-00cc-000000000003']::uuid[]);
  exception when others then v_raised := true; v_state := sqlstate; end;
  reset role;
  if not v_raised or v_state <> '42501' then
    raise exception 'ASSERT FAIL S12: authenticated exécute member_activity (state=%)', coalesce(v_state,'(succès)');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 13. service_role : privilège EXECUTE présent sur les 7 fonctions
-- ---------------------------------------------------------------------------
DO $$
declare f text;
begin
  foreach f in array array[
    'public.analytics_is_valid_path_group(text)',
    'public.analytics_upsert_session(uuid, uuid, text, text, text, text, text, text, text)',
    'public.analytics_record_event(uuid, uuid, text, text, jsonb)',
    'public.analytics_touch_member_activity(uuid, text)',
    'public.admin_get_analytics_overview(timestamptz, timestamptz, integer)',
    'public.admin_get_acquisition_breakdown(timestamptz, timestamptz, integer)',
    'public.admin_get_member_activity(uuid[])'
  ] loop
    if not has_function_privilege('service_role', f, 'execute') then
      raise exception 'ASSERT FAIL S13: service_role sans EXECUTE sur %', f;
    end if;
    if has_function_privilege('anon', f, 'execute')
       or has_function_privilege('authenticated', f, 'execute') then
      raise exception 'ASSERT FAIL S13: rôle public avec EXECUTE sur %', f;
    end if;
  end loop;
  if not has_function_privilege('service_role', 'public.purge_expired_analytics()', 'execute') then
    raise exception 'ASSERT FAIL S13: service_role sans EXECUTE sur purge';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 14. MEMBRE EN LIGNE : compté à < 2 min, pas au-delà
-- ---------------------------------------------------------------------------
DO $$
declare v_online bigint;
begin
  -- Membre A : heartbeat maintenant (en ligne).
  perform public.analytics_touch_member_activity(
    '00000000-0000-0000-00cc-000000000003', '/dashboard');

  -- Membre B : activité antidatée de 10 minutes (hors ligne).
  insert into auth.users (id, email) values
    ('00000000-0000-0000-00cc-000000000014','ana14@ex.test');
  insert into public.profiles (id, intention) values
    ('00000000-0000-0000-00cc-000000000014','mariage_serieux');
  perform public.analytics_touch_member_activity(
    '00000000-0000-0000-00cc-000000000014', '/matches');
  update public.member_activity
    set last_seen_at = now() - interval '10 minutes'
    where profile_id = '00000000-0000-0000-00cc-000000000014';

  select o.online_members into v_online
    from public.admin_get_analytics_overview(now() - interval '1 day', now() + interval '1 hour', 120) o;
  if v_online <> 1 then raise exception 'ASSERT FAIL S14: online_members=% (attendu 1)', v_online; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 15. VISITEUR ANONYME EN LIGNE : sessions sans profil uniquement
-- ---------------------------------------------------------------------------
DO $$
declare v_anon bigint;
begin
  -- Session anonyme active maintenant.
  perform public.analytics_upsert_session(
    '00000000-0000-0000-00ee-000000000015', null, '/',
    null, null, null, null, null, null);

  -- La session -0001 est LIÉE à un profil : ne compte pas comme anonyme.
  select o.online_anonymous_visitors into v_anon
    from public.admin_get_analytics_overview(now() - interval '1 day', now() + interval '1 hour', 120) o;
  if v_anon <> 1 then raise exception 'ASSERT FAIL S15: online_anonymous=% (attendu 1)', v_anon; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 16. Session EXPIRÉE exclue du temps réel (antidatée à 3 minutes)
-- ---------------------------------------------------------------------------
DO $$
declare v_anon bigint;
begin
  update public.analytics_sessions
    set last_seen_at = now() - interval '3 minutes'
    where id = '00000000-0000-0000-00ee-000000000015';

  select o.online_anonymous_visitors into v_anon
    from public.admin_get_analytics_overview(now() - interval '1 day', now() + interval '1 hour', 120) o;
  if v_anon <> 0 then raise exception 'ASSERT FAIL S16: online_anonymous=% (attendu 0)', v_anon; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 17. AGRÉGATS sur période : sessions, visiteurs, pages vues
-- ---------------------------------------------------------------------------
DO $$
declare v_sessions bigint; v_visitors bigint; v_views bigint;
begin
  select o.sessions, o.unique_visitors, o.page_views
    into v_sessions, v_visitors, v_views
    from public.admin_get_analytics_overview(now() - interval '1 day', now() + interval '1 hour', 120) o;
  -- Fixtures : sessions -0001 et -0015 démarrées dans la fenêtre.
  if v_sessions <> 2 then raise exception 'ASSERT FAIL S17: sessions=% (attendu 2)', v_sessions; end if;
  if v_visitors <> 2 then raise exception 'ASSERT FAIL S17: visitors=% (attendu 2)', v_visitors; end if;
  if v_views <> 1 then raise exception 'ASSERT FAIL S17: page_views=% (attendu 1)', v_views; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 18. CONVERSION à dénominateur NUL : taux NULL, jamais de division par zéro
-- ---------------------------------------------------------------------------
DO $$
declare v_rate numeric; v_rate2 numeric; v_sessions bigint;
begin
  select o.sessions, o.registration_conversion_rate, o.profile_completion_rate
    into v_sessions, v_rate, v_rate2
    from public.admin_get_analytics_overview(
      now() - interval '400 days', now() - interval '399 days', 120) o;
  if v_sessions <> 0 then raise exception 'ASSERT FAIL S18: sessions=% (attendu 0)', v_sessions; end if;
  if v_rate is not null or v_rate2 is not null then
    raise exception 'ASSERT FAIL S18: taux non NULL avec dénominateur nul';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 19. ACQUISITION UTM : ventilation facebook/social présente, sans ID session
-- ---------------------------------------------------------------------------
DO $$
declare v_sessions bigint;
begin
  select b.sessions into v_sessions
    from public.admin_get_acquisition_breakdown(
      now() - interval '1 day', now() + interval '1 hour', 20) b
    where b.source = 'facebook' and b.medium = 'social' and b.campaign = 'lancement';
  if v_sessions is distinct from 1 then
    raise exception 'ASSERT FAIL S19: facebook/social/lancement=% (attendu 1)', v_sessions;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 20. ACQUISITION DIRECTE : ni UTM ni référent → direct / none
-- ---------------------------------------------------------------------------
DO $$
declare v_sessions bigint;
begin
  select b.sessions into v_sessions
    from public.admin_get_acquisition_breakdown(
      now() - interval '1 day', now() + interval '1 hour', 20) b
    where b.source = 'direct' and b.medium = 'none';
  if v_sessions is distinct from 1 then
    raise exception 'ASSERT FAIL S20: direct/none=% (attendu 1)', v_sessions;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 21. DERNIÈRE CONNEXION : auth.users.last_sign_in_at restitué tel quel
-- ---------------------------------------------------------------------------
DO $$
declare v_sign timestamptz; v_seen timestamptz;
begin
  update auth.users
    set last_sign_in_at = now() - interval '2 hours'
    where id = '00000000-0000-0000-00cc-000000000003';

  select a.last_sign_in_at, a.last_seen_at into v_sign, v_seen
    from public.admin_get_member_activity(
      array['00000000-0000-0000-00cc-000000000003']::uuid[]) a;
  if v_sign is distinct from (now() - interval '2 hours') then
    raise exception 'ASSERT FAIL S21: last_sign_in_at=%', v_sign;
  end if;
  if v_seen is null then raise exception 'ASSERT FAIL S21: last_seen_at NULL'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 22. ACTIVITÉ MEMBRE : first_seen conservé, last_seen rafraîchi, route à jour
-- ---------------------------------------------------------------------------
DO $$
declare v_first timestamptz; v_seen timestamptz; v_path text;
begin
  update public.member_activity
    set first_seen_at = now() - interval '30 days',
        last_seen_at  = now() - interval '1 day'
    where profile_id = '00000000-0000-0000-00cc-000000000003';

  perform public.analytics_touch_member_activity(
    '00000000-0000-0000-00cc-000000000003', '/matches/[matchId]');

  select first_seen_at, last_seen_at, last_path_group into v_first, v_seen, v_path
    from public.member_activity
    where profile_id = '00000000-0000-0000-00cc-000000000003';
  if v_first is distinct from (now() - interval '30 days') then
    raise exception 'ASSERT FAIL S22: first_seen écrasé (%)', v_first;
  end if;
  if v_seen <> now() then raise exception 'ASSERT FAIL S22: last_seen non rafraîchi'; end if;
  if v_path <> '/matches/[matchId]' then raise exception 'ASSERT FAIL S22: last_path=%', v_path; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 23. PURGE : session inactive depuis 91 jours supprimée, récente conservée
-- ---------------------------------------------------------------------------
DO $$
declare v_del_sessions bigint; v_cnt int;
begin
  insert into public.analytics_sessions (id, started_at, last_seen_at)
    values ('00000000-0000-0000-00ee-000000000023',
            now() - interval '100 days', now() - interval '91 days');

  select p.deleted_sessions into v_del_sessions from public.purge_expired_analytics() p;
  if v_del_sessions <> 1 then
    raise exception 'ASSERT FAIL S23: deleted_sessions=% (attendu 1)', v_del_sessions;
  end if;

  select count(*) into v_cnt from public.analytics_sessions
    where id = '00000000-0000-0000-00ee-000000000001';
  if v_cnt <> 1 then raise exception 'ASSERT FAIL S23: session récente purgée à tort'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 24. PURGE : événement de plus de 180 jours supprimé, récent conservé
-- ---------------------------------------------------------------------------
DO $$
declare v_del_events bigint; v_cnt int;
begin
  insert into public.analytics_events (session_id, event_type, path_group, occurred_at)
    values ('00000000-0000-0000-00ee-000000000001', 'page_view', '/', now() - interval '181 days');

  select p.deleted_events into v_del_events from public.purge_expired_analytics() p;
  if v_del_events <> 1 then
    raise exception 'ASSERT FAIL S24: deleted_events=% (attendu 1)', v_del_events;
  end if;

  select count(*) into v_cnt from public.analytics_events
    where session_id = '00000000-0000-0000-00ee-000000000001' and event_type = 'page_view';
  if v_cnt <> 1 then raise exception 'ASSERT FAIL S24: événement récent purgé à tort'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 25. PURGE : member_activity JAMAIS touchée par la purge analytique
-- ---------------------------------------------------------------------------
DO $$
declare v_cnt int;
begin
  update public.member_activity
    set last_seen_at = now() - interval '400 days'
    where profile_id = '00000000-0000-0000-00cc-000000000014';

  perform public.purge_expired_analytics();

  select count(*) into v_cnt from public.member_activity;
  if v_cnt <> 2 then
    raise exception 'ASSERT FAIL S25: member_activity_count=% (attendu 2)', v_cnt;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 26. TOP PAGES : agrégation par route normalisée, pas d'ID de session,
--     et RPC inexécutable par anon/authenticated
-- ---------------------------------------------------------------------------
DO $$
declare v_views bigint; v_sessions bigint;
begin
  select t.page_views, t.sessions into v_views, v_sessions
    from public.admin_get_top_pages(now() - interval '1 day', now() + interval '1 hour', 15) t
    where t.path_group = '/register';
  if v_views is distinct from 1 or v_sessions is distinct from 1 then
    raise exception 'ASSERT FAIL S26: /register views=%, sessions=%', v_views, v_sessions;
  end if;

  if has_function_privilege('anon', 'public.admin_get_top_pages(timestamptz, timestamptz, integer)', 'execute')
     or has_function_privilege('authenticated', 'public.admin_get_top_pages(timestamptz, timestamptz, integer)', 'execute') then
    raise exception 'ASSERT FAIL S26: rôle public avec EXECUTE sur admin_get_top_pages';
  end if;
end $$;

ROLLBACK;
