-- =============================================================================
-- Durcissement auto-modération — Suite de tests SQL AUTO-ASSERTANTE pour la
-- garde SELF_MODERATION_FORBIDDEN de admin_set_account_status
-- (migration 20260718004907_prevent_admin_self_moderation).
--
-- EXÉCUTION : à jouer INTÉGRALEMENT et VERBATIM sur une base JETABLE (branche
-- Supabase / lab), idéalement avec `psql -v ON_ERROR_STOP=1`, APRÈS application
-- de toutes les migrations. Toute la suite est encapsulée dans UN SEUL
-- `BEGIN … ROLLBACK` : aucune donnée n'est conservée. Chaque scénario est un
-- bloc `DO $$ … $$` AUTO-ASSERTANT : tout écart lève `ASSERT FAIL S<n>: …`.
-- Un déroulé complet SANS erreur = les 7 scénarios ont réussi.
--
-- UUID distincts de la suite historique 20260704010000 (familles 00aa/00bb/00dd)
-- pour éviter toute collision si les deux suites sont jouées dans la même
-- session. Hors `set local role`, le rôle courant privilégié simule le client
-- service_role de la Server Action admin.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. AUTO-SUSPENSION refusée : acteur = profil cible (active -> suspended)
--    -> SELF_MODERATION_FORBIDDEN, SQLSTATE 42501, profil INCHANGÉ, journal VIDE.
-- ---------------------------------------------------------------------------
DO $$
declare v_raised boolean := false; v_msg text; v_state text;
        v_status text; v_at timestamptz; v_by uuid; v_reason text; v_cnt int;
begin
  insert into auth.users (id, email) values
    ('00000000-0000-0000-00aa-000000000001','selfadm01@ex.test');
  insert into public.profiles (id, intention) values
    ('00000000-0000-0000-00aa-000000000001','mariage_serieux');

  begin
    perform public.admin_set_account_status(
      '00000000-0000-0000-00aa-000000000001','active','suspended',
      'Tentative de suspension de mon propre compte.',
      '00000000-0000-0000-00aa-000000000001');
  exception when others then
    v_raised := true; v_msg := sqlerrm; v_state := sqlstate;
  end;

  if not v_raised or v_msg <> 'SELF_MODERATION_FORBIDDEN' then
    raise exception 'ASSERT FAIL S1: attendu SELF_MODERATION_FORBIDDEN, obtenu %', coalesce(v_msg,'(succès)');
  end if;
  if v_state <> '42501' then
    raise exception 'ASSERT FAIL S1: SQLSTATE attendu 42501, obtenu %', v_state;
  end if;

  select account_status::text, suspended_at, suspended_by, suspension_reason
    into v_status, v_at, v_by, v_reason
    from public.profiles where id='00000000-0000-0000-00aa-000000000001';
  if v_status <> 'active' then raise exception 'ASSERT FAIL S1: status=% (attendu active)', v_status; end if;
  if v_at is not null or v_by is not null or v_reason is not null then
    raise exception 'ASSERT FAIL S1: métadonnées de suspension mutées (at=%, by=%, reason=%)', v_at, v_by, v_reason;
  end if;

  select count(*) into v_cnt
    from public.account_moderation_actions
    where profile_id_snapshot='00000000-0000-0000-00aa-000000000001';
  if v_cnt <> 0 then raise exception 'ASSERT FAIL S1: journal_count=% (attendu 0)', v_cnt; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. AUTO-RÉACTIVATION refusée : profil suspendu par un TIERS, puis le membre
--    (acteur = cible) tente suspended -> active -> SELF_MODERATION_FORBIDDEN,
--    SQLSTATE 42501, statut TOUJOURS suspended, métadonnées INTACTES, aucune
--    NOUVELLE ligne de journal.
-- ---------------------------------------------------------------------------
DO $$
declare v_raised boolean := false; v_msg text; v_state text;
        v_status text; v_at timestamptz; v_by uuid; v_reason text; v_cnt int;
        v_at_before timestamptz;
begin
  insert into auth.users (id, email) values
    ('00000000-0000-0000-00aa-000000000002','adm02@ex.test'),
    ('00000000-0000-0000-00bb-000000000002','self02@ex.test');
  insert into public.profiles (id, intention) values
    ('00000000-0000-0000-00bb-000000000002','mariage_serieux');

  -- Mise en place : suspension VALIDE par un administrateur distinct.
  perform public.admin_set_account_status(
    '00000000-0000-0000-00bb-000000000002','active','suspended',
    'Suspension préparatoire par un administrateur distinct.',
    '00000000-0000-0000-00aa-000000000002');

  select suspended_at into v_at_before
    from public.profiles where id='00000000-0000-0000-00bb-000000000002';
  if v_at_before is null then raise exception 'ASSERT FAIL S2: setup incomplet (suspended_at NULL)'; end if;

  -- Tentative d'auto-réactivation (acteur = cible).
  begin
    perform public.admin_set_account_status(
      '00000000-0000-0000-00bb-000000000002','suspended','active',
      'Tentative de réactivation de mon propre compte.',
      '00000000-0000-0000-00bb-000000000002');
  exception when others then
    v_raised := true; v_msg := sqlerrm; v_state := sqlstate;
  end;

  if not v_raised or v_msg <> 'SELF_MODERATION_FORBIDDEN' then
    raise exception 'ASSERT FAIL S2: attendu SELF_MODERATION_FORBIDDEN, obtenu %', coalesce(v_msg,'(succès)');
  end if;
  if v_state <> '42501' then
    raise exception 'ASSERT FAIL S2: SQLSTATE attendu 42501, obtenu %', v_state;
  end if;

  select account_status::text, suspended_at, suspended_by, suspension_reason
    into v_status, v_at, v_by, v_reason
    from public.profiles where id='00000000-0000-0000-00bb-000000000002';
  if v_status <> 'suspended' then raise exception 'ASSERT FAIL S2: status=% (attendu suspended)', v_status; end if;
  if v_at is distinct from v_at_before
     or v_by is distinct from '00000000-0000-0000-00aa-000000000002'::uuid
     or v_reason is distinct from 'Suspension préparatoire par un administrateur distinct.' then
    raise exception 'ASSERT FAIL S2: métadonnées de suspension altérées';
  end if;

  select count(*) into v_cnt
    from public.account_moderation_actions
    where profile_id_snapshot='00000000-0000-0000-00bb-000000000002';
  if v_cnt <> 1 then raise exception 'ASSERT FAIL S2: journal_count=% (attendu 1, la seule action du setup)', v_cnt; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. NON-RÉGRESSION : un administrateur DISTINCT peut toujours suspendre un
--    membre (statut, métadonnées, journal = exactement 1 ligne conforme).
-- ---------------------------------------------------------------------------
DO $$
declare v_status text; v_by uuid; v_cnt int; v_prev text; v_new text;
begin
  insert into auth.users (id, email) values
    ('00000000-0000-0000-00aa-000000000003','adm03@ex.test'),
    ('00000000-0000-0000-00bb-000000000003','own03@ex.test');
  insert into public.profiles (id, intention) values
    ('00000000-0000-0000-00bb-000000000003','mariage_serieux');

  perform public.admin_set_account_status(
    '00000000-0000-0000-00bb-000000000003','active','suspended',
    'Suspension normale par un administrateur distinct.',
    '00000000-0000-0000-00aa-000000000003');

  select account_status::text, suspended_by into v_status, v_by
    from public.profiles where id='00000000-0000-0000-00bb-000000000003';
  if v_status <> 'suspended' then raise exception 'ASSERT FAIL S3: status=%', v_status; end if;
  if v_by is distinct from '00000000-0000-0000-00aa-000000000003'::uuid then raise exception 'ASSERT FAIL S3: suspended_by=%', v_by; end if;

  select count(*) into v_cnt
    from public.account_moderation_actions where profile_id_snapshot='00000000-0000-0000-00bb-000000000003';
  if v_cnt <> 1 then raise exception 'ASSERT FAIL S3: journal_count=%', v_cnt; end if;
  select previous_status::text, new_status::text into v_prev, v_new
    from public.account_moderation_actions where profile_id_snapshot='00000000-0000-0000-00bb-000000000003';
  if v_prev <> 'active' or v_new <> 'suspended' then raise exception 'ASSERT FAIL S3: transition %->%', v_prev, v_new; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. NON-RÉGRESSION : un administrateur DISTINCT peut toujours réactiver le
--    membre du S3 (métadonnées remises à NULL, journal = 2 lignes exactement).
-- ---------------------------------------------------------------------------
DO $$
declare v_status text; v_at timestamptz; v_by uuid; v_reason text; v_cnt int;
begin
  perform public.admin_set_account_status(
    '00000000-0000-0000-00bb-000000000003','suspended','active',
    'Réactivation normale après vérifications favorables.',
    '00000000-0000-0000-00aa-000000000003');

  select account_status::text, suspended_at, suspended_by, suspension_reason
    into v_status, v_at, v_by, v_reason
    from public.profiles where id='00000000-0000-0000-00bb-000000000003';
  if v_status <> 'active' then raise exception 'ASSERT FAIL S4: status=%', v_status; end if;
  if v_at is not null or v_by is not null or v_reason is not null then
    raise exception 'ASSERT FAIL S4: métadonnées non remises à NULL';
  end if;

  select count(*) into v_cnt
    from public.account_moderation_actions where profile_id_snapshot='00000000-0000-0000-00bb-000000000003';
  if v_cnt <> 2 then raise exception 'ASSERT FAIL S4: journal_count=% (attendu 2)', v_cnt; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. NON-RÉGRESSION : p_report_id reste fonctionnel (suspension liée à un
--    signalement visant le profil -> report_id journalisé).
-- ---------------------------------------------------------------------------
DO $$
declare v_rep uuid;
begin
  insert into auth.users (id, email) values
    ('00000000-0000-0000-00aa-000000000005','adm05@ex.test'),
    ('00000000-0000-0000-00bb-000000000005','own05@ex.test');
  insert into public.profiles (id, intention) values
    ('00000000-0000-0000-00bb-000000000005','mariage_serieux');
  insert into public.safety_reports (id, reported_user_id, reason, message_content_snapshot, message_created_at_snapshot, status)
    values ('00000000-0000-0000-00dd-000000000005','00000000-0000-0000-00bb-000000000005','harassment','msg',now(),'resolved');

  perform public.admin_set_account_status(
    '00000000-0000-0000-00bb-000000000005','active','suspended',
    'Suspension consécutive au signalement résolu.',
    '00000000-0000-0000-00aa-000000000005',
    '00000000-0000-0000-00dd-000000000005');

  select report_id into v_rep
    from public.account_moderation_actions where profile_id_snapshot='00000000-0000-0000-00bb-000000000005';
  if v_rep is distinct from '00000000-0000-0000-00dd-000000000005'::uuid then
    raise exception 'ASSERT FAIL S5: report_id=%', v_rep;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6. NON-RÉGRESSION : ACCOUNT_STATUS_CONFLICT reste fonctionnel (statut attendu
--    obsolète -> 40001), y compris pour un acteur distinct.
-- ---------------------------------------------------------------------------
DO $$
declare v_raised boolean := false; v_msg text; v_state text;
begin
  insert into auth.users (id, email) values
    ('00000000-0000-0000-00aa-000000000006','adm06@ex.test'),
    ('00000000-0000-0000-00bb-000000000006','own06@ex.test');
  insert into public.profiles (id, intention) values
    ('00000000-0000-0000-00bb-000000000006','mariage_serieux');

  begin
    perform public.admin_set_account_status(
      '00000000-0000-0000-00bb-000000000006','suspended','active',
      'Statut attendu obsolète : le profil est en réalité actif.',
      '00000000-0000-0000-00aa-000000000006');
  exception when others then
    v_raised := true; v_msg := sqlerrm; v_state := sqlstate;
  end;

  if not v_raised or v_msg <> 'ACCOUNT_STATUS_CONFLICT' then
    raise exception 'ASSERT FAIL S6: attendu ACCOUNT_STATUS_CONFLICT, obtenu %', coalesce(v_msg,'(succès)');
  end if;
  if v_state <> '40001' then
    raise exception 'ASSERT FAIL S6: SQLSTATE attendu 40001, obtenu %', v_state;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 7. PRIVILÈGES : anon/authenticated sans EXECUTE ; service_role avec EXECUTE
--    — inchangés après CREATE OR REPLACE + REVOKE/GRANT explicites.
-- ---------------------------------------------------------------------------
DO $$
declare v_sig constant text := 'public.admin_set_account_status(uuid, text, text, text, uuid, uuid)';
begin
  if has_function_privilege('anon', v_sig, 'execute') then
    raise exception 'ASSERT FAIL S7: anon ne doit PAS pouvoir exécuter la RPC';
  end if;
  if has_function_privilege('authenticated', v_sig, 'execute') then
    raise exception 'ASSERT FAIL S7: authenticated ne doit PAS pouvoir exécuter la RPC';
  end if;
  if not has_function_privilege('service_role', v_sig, 'execute') then
    raise exception 'ASSERT FAIL S7: service_role DOIT pouvoir exécuter la RPC';
  end if;
end $$;

ROLLBACK;
