-- =============================================================================
-- L3F-C3A — Suite de tests SQL AUTO-ASSERTANTE pour admin_set_account_status /
--           account_moderation_actions / garde des champs administratifs.
--
-- EXÉCUTION : ce fichier est prévu pour être joué INTÉGRALEMENT et VERBATIM sur
-- une base JETABLE (branche Supabase), idéalement avec `psql -v ON_ERROR_STOP=1`.
-- Toute la suite est encapsulée dans UN SEUL `BEGIN … ROLLBACK` : aucune donnée
-- n'est conservée. Chaque scénario est un bloc `DO $$ … $$` AUTO-ASSERTANT :
--   - les erreurs métier ATTENDUES sont capturées et vérifiées ;
--   - tout écart lève `ASSERT FAIL S<n>: …`, ce qui arrête immédiatement la
--     suite (sous ON_ERROR_STOP) — signe d'un échec.
-- Un déroulé complet SANS erreur = les 27 scénarios ont réussi.
--
-- Rôle membre simulé via `set local role authenticated` +
-- `request.jwt.claims` (auth.uid() = sub). Hors de ces blocs, le rôle courant
-- (privilégié) a auth.uid() = NULL, ce qui simule le client service_role de la
-- Server Action admin. UUID tous valides (8-4-4-4-12 hex), aucun placeholder.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. active -> suspended, raison valide : SUCCÈS
-- ---------------------------------------------------------------------------
DO $$
declare v_status text; v_by uuid; v_at timestamptz; v_reason text; v_cnt int;
        v_prev text; v_new text; v_email text; v_rep uuid;
begin
  insert into auth.users (id, email) values
    ('00000000-0000-0000-000a-000000000001','adm01@ex.test'),
    ('00000000-0000-0000-000b-000000000001','own01@ex.test');
  insert into public.profiles (id, intention) values ('00000000-0000-0000-000b-000000000001','mariage_serieux');

  perform public.admin_set_account_status(
    '00000000-0000-0000-000b-000000000001','active','suspended',
    'Comportement inapproprié confirmé après revue.','00000000-0000-0000-000a-000000000001');

  select account_status::text, suspended_by, suspended_at, suspension_reason
    into v_status, v_by, v_at, v_reason
    from public.profiles where id='00000000-0000-0000-000b-000000000001';
  if v_status <> 'suspended' then raise exception 'ASSERT FAIL S1: status=%', v_status; end if;
  if v_by is distinct from '00000000-0000-0000-000a-000000000001'::uuid then raise exception 'ASSERT FAIL S1: suspended_by'; end if;
  if v_at is null then raise exception 'ASSERT FAIL S1: suspended_at NULL'; end if;

  select count(*) into v_cnt
    from public.account_moderation_actions where profile_id_snapshot='00000000-0000-0000-000b-000000000001';
  if v_cnt <> 1 then raise exception 'ASSERT FAIL S1: journal_count=%', v_cnt; end if;
  select previous_status::text, new_status::text, actor_email_snapshot, report_id, reason
    into v_prev, v_new, v_email, v_rep, v_reason
    from public.account_moderation_actions where profile_id_snapshot='00000000-0000-0000-000b-000000000001';
  if v_prev <> 'active' or v_new <> 'suspended' then raise exception 'ASSERT FAIL S1: transition %->%', v_prev, v_new; end if;
  if v_email <> 'adm01@ex.test' then raise exception 'ASSERT FAIL S1: actor_email=%', v_email; end if;
  if v_rep is not null then raise exception 'ASSERT FAIL S1: report_id non NULL'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. suspended -> active : SUCCÈS (raison de réactivation conservée au journal)
-- ---------------------------------------------------------------------------
DO $$
declare v_status text; v_meta_null boolean; v_reason text;
begin
  insert into auth.users (id, email) values
    ('00000000-0000-0000-000a-000000000002','adm02@ex.test'),
    ('00000000-0000-0000-000b-000000000002','own02@ex.test');
  insert into public.profiles (id, intention, account_status, suspended_at, suspended_by, suspension_reason)
    values ('00000000-0000-0000-000b-000000000002','mariage_serieux','suspended', now(),
            '00000000-0000-0000-000a-000000000002','Sanction initiale suffisamment longue.');

  perform public.admin_set_account_status(
    '00000000-0000-0000-000b-000000000002','suspended','active',
    'Réactivation après vérification complémentaire.','00000000-0000-0000-000a-000000000002');

  select account_status::text, (suspended_at is null and suspended_by is null and suspension_reason is null)
    into v_status, v_meta_null from public.profiles where id='00000000-0000-0000-000b-000000000002';
  if v_status <> 'active' then raise exception 'ASSERT FAIL S2: status=%', v_status; end if;
  if not v_meta_null then raise exception 'ASSERT FAIL S2: metadonnees non nulles'; end if;

  select reason into v_reason from public.account_moderation_actions
    where profile_id_snapshot='00000000-0000-0000-000b-000000000002' and new_status='active'::public.account_status;
  if v_reason <> 'Réactivation après vérification complémentaire.' then raise exception 'ASSERT FAIL S2: reason journal=%', v_reason; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Suspension avec report_id correspondant : SUCCÈS + report_id journalisé
-- ---------------------------------------------------------------------------
DO $$
declare v_rep uuid;
begin
  insert into auth.users (id, email) values
    ('00000000-0000-0000-000a-000000000003','adm03@ex.test'),
    ('00000000-0000-0000-000b-000000000003','own03@ex.test');
  insert into public.profiles (id, intention) values ('00000000-0000-0000-000b-000000000003','mariage_serieux');
  insert into public.safety_reports (id, reported_user_id, reason, message_content_snapshot, message_created_at_snapshot, status)
    values ('00000000-0000-0000-000d-000000000003','00000000-0000-0000-000b-000000000003','harassment','msg',now(),'resolved');

  perform public.admin_set_account_status(
    '00000000-0000-0000-000b-000000000003','active','suspended',
    'Suspension consécutive au signalement résolu.','00000000-0000-0000-000a-000000000003',
    '00000000-0000-0000-000d-000000000003');

  select report_id into v_rep from public.account_moderation_actions where profile_id_snapshot='00000000-0000-0000-000b-000000000003';
  if v_rep is distinct from '00000000-0000-0000-000d-000000000003'::uuid then raise exception 'ASSERT FAIL S3: report_id=%', v_rep; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. report_id d'un AUTRE profil : REPORT_PROFILE_MISMATCH
-- ---------------------------------------------------------------------------
DO $$
declare v_raised boolean := false; v_msg text;
begin
  insert into auth.users (id, email) values
    ('00000000-0000-0000-000a-000000000004','adm04@ex.test'),
    ('00000000-0000-0000-000b-000000000004','own04@ex.test'),
    ('00000000-0000-0000-000c-000000000004','oth04@ex.test');
  insert into public.profiles (id, intention) values
    ('00000000-0000-0000-000b-000000000004','mariage_serieux'),
    ('00000000-0000-0000-000c-000000000004','mariage_serieux');
  insert into public.safety_reports (id, reported_user_id, reason, message_content_snapshot, message_created_at_snapshot, status)
    values ('00000000-0000-0000-000d-000000000004','00000000-0000-0000-000c-000000000004','spam','msg',now(),'resolved');
  begin
    perform public.admin_set_account_status(
      '00000000-0000-0000-000b-000000000004','active','suspended',
      'Tentative avec un signalement ne visant pas ce profil.','00000000-0000-0000-000a-000000000004',
      '00000000-0000-0000-000d-000000000004');
  exception when others then v_raised := true; v_msg := sqlerrm; end;
  if not v_raised or v_msg <> 'REPORT_PROFILE_MISMATCH' then raise exception 'ASSERT FAIL S4: attendu REPORT_PROFILE_MISMATCH, obtenu %', coalesce(v_msg,'(succès)'); end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. report_id inexistant : REPORT_NOT_FOUND
-- ---------------------------------------------------------------------------
DO $$
declare v_raised boolean := false; v_msg text;
begin
  insert into auth.users (id, email) values
    ('00000000-0000-0000-000a-000000000005','adm05@ex.test'),
    ('00000000-0000-0000-000b-000000000005','own05@ex.test');
  insert into public.profiles (id, intention) values ('00000000-0000-0000-000b-000000000005','mariage_serieux');
  begin
    perform public.admin_set_account_status(
      '00000000-0000-0000-000b-000000000005','active','suspended',
      'Suspension avec un signalement inexistant.','00000000-0000-0000-000a-000000000005',
      '00000000-0000-0000-0fff-000000000005');
  exception when others then v_raised := true; v_msg := sqlerrm; end;
  if not v_raised or v_msg <> 'REPORT_NOT_FOUND' then raise exception 'ASSERT FAIL S5: attendu REPORT_NOT_FOUND, obtenu %', coalesce(v_msg,'(succès)'); end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Profil inexistant : PROFILE_NOT_FOUND
-- ---------------------------------------------------------------------------
DO $$
declare v_raised boolean := false; v_msg text;
begin
  insert into auth.users (id, email) values ('00000000-0000-0000-000a-000000000006','adm06@ex.test');
  begin
    perform public.admin_set_account_status(
      '00000000-0000-0000-0eee-000000000006','active','suspended',
      'Suspension d''un profil qui n''existe pas.','00000000-0000-0000-000a-000000000006');
  exception when others then v_raised := true; v_msg := sqlerrm; end;
  if not v_raised or v_msg <> 'PROFILE_NOT_FOUND' then raise exception 'ASSERT FAIL S6: attendu PROFILE_NOT_FOUND, obtenu %', coalesce(v_msg,'(succès)'); end if;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Acteur inexistant : ACTOR_NOT_FOUND
-- ---------------------------------------------------------------------------
DO $$
declare v_raised boolean := false; v_msg text;
begin
  insert into auth.users (id, email) values ('00000000-0000-0000-000b-000000000007','own07@ex.test');
  insert into public.profiles (id, intention) values ('00000000-0000-0000-000b-000000000007','mariage_serieux');
  begin
    perform public.admin_set_account_status(
      '00000000-0000-0000-000b-000000000007','active','suspended',
      'Suspension avec un acteur admin inexistant.','00000000-0000-0000-0999-000000000007');
  exception when others then v_raised := true; v_msg := sqlerrm; end;
  if not v_raised or v_msg <> 'ACTOR_NOT_FOUND' then raise exception 'ASSERT FAIL S7: attendu ACTOR_NOT_FOUND, obtenu %', coalesce(v_msg,'(succès)'); end if;
end $$;

-- ---------------------------------------------------------------------------
-- 8. Statut attendu obsolète : ACCOUNT_STATUS_CONFLICT
-- ---------------------------------------------------------------------------
DO $$
declare v_raised boolean := false; v_msg text;
begin
  insert into auth.users (id, email) values
    ('00000000-0000-0000-000a-000000000008','adm08@ex.test'),
    ('00000000-0000-0000-000b-000000000008','own08@ex.test');
  insert into public.profiles (id, intention) values ('00000000-0000-0000-000b-000000000008','mariage_serieux'); -- réel=active
  begin
    perform public.admin_set_account_status(
      '00000000-0000-0000-000b-000000000008','suspended','active',
      'Décision fondée sur un état de compte périmé.','00000000-0000-0000-000a-000000000008');
  exception when others then v_raised := true; v_msg := sqlerrm; end;
  if not v_raised or v_msg <> 'ACCOUNT_STATUS_CONFLICT' then raise exception 'ASSERT FAIL S8: attendu ACCOUNT_STATUS_CONFLICT, obtenu %', coalesce(v_msg,'(succès)'); end if;
end $$;

-- ---------------------------------------------------------------------------
-- 9. Transition vers le statut courant : INVALID_ACCOUNT_TRANSITION
-- ---------------------------------------------------------------------------
DO $$
declare v_raised boolean := false; v_msg text;
begin
  insert into auth.users (id, email) values
    ('00000000-0000-0000-000a-000000000009','adm09@ex.test'),
    ('00000000-0000-0000-000b-000000000009','own09@ex.test');
  insert into public.profiles (id, intention) values ('00000000-0000-0000-000b-000000000009','mariage_serieux');
  begin
    perform public.admin_set_account_status(
      '00000000-0000-0000-000b-000000000009','active','active',
      'Transition sans changement d''état.','00000000-0000-0000-000a-000000000009');
  exception when others then v_raised := true; v_msg := sqlerrm; end;
  if not v_raised or v_msg <> 'INVALID_ACCOUNT_TRANSITION' then raise exception 'ASSERT FAIL S9: attendu INVALID_ACCOUNT_TRANSITION, obtenu %', coalesce(v_msg,'(succès)'); end if;
end $$;

-- ---------------------------------------------------------------------------
-- 10. Statut inconnu : INVALID_ACCOUNT_STATUS
-- ---------------------------------------------------------------------------
DO $$
declare v_raised boolean := false; v_msg text;
begin
  insert into auth.users (id, email) values
    ('00000000-0000-0000-000a-000000000010','adm10@ex.test'),
    ('00000000-0000-0000-000b-000000000010','own10@ex.test');
  insert into public.profiles (id, intention) values ('00000000-0000-0000-000b-000000000010','mariage_serieux');
  begin
    perform public.admin_set_account_status(
      '00000000-0000-0000-000b-000000000010','active','frozen',
      'Statut cible non pris en charge.','00000000-0000-0000-000a-000000000010');
  exception when others then v_raised := true; v_msg := sqlerrm; end;
  if not v_raised or v_msg <> 'INVALID_ACCOUNT_STATUS' then raise exception 'ASSERT FAIL S10: attendu INVALID_ACCOUNT_STATUS, obtenu %', coalesce(v_msg,'(succès)'); end if;
end $$;

-- ---------------------------------------------------------------------------
-- 11. Raison absente : REASON_REQUIRED
-- ---------------------------------------------------------------------------
DO $$
declare v_raised boolean := false; v_msg text;
begin
  insert into auth.users (id, email) values
    ('00000000-0000-0000-000a-000000000011','adm11@ex.test'),
    ('00000000-0000-0000-000b-000000000011','own11@ex.test');
  insert into public.profiles (id, intention) values ('00000000-0000-0000-000b-000000000011','mariage_serieux');
  begin
    perform public.admin_set_account_status(
      '00000000-0000-0000-000b-000000000011','active','suspended','   ','00000000-0000-0000-000a-000000000011');
  exception when others then v_raised := true; v_msg := sqlerrm; end;
  if not v_raised or v_msg <> 'REASON_REQUIRED' then raise exception 'ASSERT FAIL S11: attendu REASON_REQUIRED, obtenu %', coalesce(v_msg,'(succès)'); end if;
end $$;

-- ---------------------------------------------------------------------------
-- 12. Raison trop courte : REASON_LENGTH_INVALID
-- ---------------------------------------------------------------------------
DO $$
declare v_raised boolean := false; v_msg text;
begin
  insert into auth.users (id, email) values
    ('00000000-0000-0000-000a-000000000012','adm12@ex.test'),
    ('00000000-0000-0000-000b-000000000012','own12@ex.test');
  insert into public.profiles (id, intention) values ('00000000-0000-0000-000b-000000000012','mariage_serieux');
  begin
    perform public.admin_set_account_status(
      '00000000-0000-0000-000b-000000000012','active','suspended','  court  ','00000000-0000-0000-000a-000000000012');
  exception when others then v_raised := true; v_msg := sqlerrm; end;
  if not v_raised or v_msg <> 'REASON_LENGTH_INVALID' then raise exception 'ASSERT FAIL S12: attendu REASON_LENGTH_INVALID, obtenu %', coalesce(v_msg,'(succès)'); end if;
end $$;

-- ---------------------------------------------------------------------------
-- 13. Raison > 2000 caractères : REASON_LENGTH_INVALID
-- ---------------------------------------------------------------------------
DO $$
declare v_raised boolean := false; v_msg text;
begin
  insert into auth.users (id, email) values
    ('00000000-0000-0000-000a-000000000013','adm13@ex.test'),
    ('00000000-0000-0000-000b-000000000013','own13@ex.test');
  insert into public.profiles (id, intention) values ('00000000-0000-0000-000b-000000000013','mariage_serieux');
  begin
    perform public.admin_set_account_status(
      '00000000-0000-0000-000b-000000000013','active','suspended', repeat('a',2001),'00000000-0000-0000-000a-000000000013');
  exception when others then v_raised := true; v_msg := sqlerrm; end;
  if not v_raised or v_msg <> 'REASON_LENGTH_INVALID' then raise exception 'ASSERT FAIL S13: attendu REASON_LENGTH_INVALID, obtenu %', coalesce(v_msg,'(succès)'); end if;
end $$;

-- ---------------------------------------------------------------------------
-- 14. Raison normalisée avec btrim (profil + journal)
-- ---------------------------------------------------------------------------
DO $$
declare v_pr text; v_jr text;
begin
  insert into auth.users (id, email) values
    ('00000000-0000-0000-000a-000000000014','adm14@ex.test'),
    ('00000000-0000-0000-000b-000000000014','own14@ex.test');
  insert into public.profiles (id, intention) values ('00000000-0000-0000-000b-000000000014','mariage_serieux');
  perform public.admin_set_account_status(
    '00000000-0000-0000-000b-000000000014','active','suspended',
    '   Motif valide entouré d''espaces.   ','00000000-0000-0000-000a-000000000014');
  select suspension_reason into v_pr from public.profiles where id='00000000-0000-0000-000b-000000000014';
  select reason into v_jr from public.account_moderation_actions where profile_id_snapshot='00000000-0000-0000-000b-000000000014';
  if v_pr <> 'Motif valide entouré d''espaces.' then raise exception 'ASSERT FAIL S14: profil reason=[%]', v_pr; end if;
  if v_jr <> 'Motif valide entouré d''espaces.' then raise exception 'ASSERT FAIL S14: journal reason=[%]', v_jr; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 15. Une transition réussie crée EXACTEMENT une action
-- ---------------------------------------------------------------------------
DO $$
declare v_cnt int;
begin
  insert into auth.users (id, email) values
    ('00000000-0000-0000-000a-000000000015','adm15@ex.test'),
    ('00000000-0000-0000-000b-000000000015','own15@ex.test');
  insert into public.profiles (id, intention) values ('00000000-0000-0000-000b-000000000015','mariage_serieux');
  perform public.admin_set_account_status(
    '00000000-0000-0000-000b-000000000015','active','suspended',
    'Une seule action doit être journalisée.','00000000-0000-0000-000a-000000000015');
  select count(*) into v_cnt from public.account_moderation_actions where profile_id_snapshot='00000000-0000-0000-000b-000000000015';
  if v_cnt <> 1 then raise exception 'ASSERT FAIL S15: journal_count=%', v_cnt; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 16. Une erreur ne laisse AUCUNE mise à jour ni action partielle
-- ---------------------------------------------------------------------------
DO $$
declare v_status text; v_meta_null boolean; v_cnt int;
begin
  insert into auth.users (id, email) values
    ('00000000-0000-0000-000a-000000000016','adm16@ex.test'),
    ('00000000-0000-0000-000b-000000000016','own16@ex.test');
  insert into public.profiles (id, intention) values ('00000000-0000-0000-000b-000000000016','mariage_serieux');
  begin
    perform public.admin_set_account_status(
      '00000000-0000-0000-000b-000000000016','active','suspended',
      'Motif valide mais signalement inexistant.','00000000-0000-0000-000a-000000000016',
      '00000000-0000-0000-0fff-000000000016');
  exception when others then null; -- REPORT_NOT_FOUND attendu
  end;
  select account_status::text, (suspended_at is null and suspended_by is null and suspension_reason is null)
    into v_status, v_meta_null from public.profiles where id='00000000-0000-0000-000b-000000000016';
  select count(*) into v_cnt from public.account_moderation_actions where profile_id_snapshot='00000000-0000-0000-000b-000000000016';
  if v_status <> 'active' or not v_meta_null or v_cnt <> 0 then
    raise exception 'ASSERT FAIL S16: modification partielle (status=%, meta_null=%, actions=%)', v_status, v_meta_null, v_cnt;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 17. UPDATE (contenu) du journal : ACCOUNT_MODERATION_ACTIONS_APPEND_ONLY
-- ---------------------------------------------------------------------------
DO $$
declare v_raised boolean := false; v_msg text;
begin
  insert into auth.users (id, email) values
    ('00000000-0000-0000-000a-000000000017','adm17@ex.test'),
    ('00000000-0000-0000-000b-000000000017','own17@ex.test');
  insert into public.profiles (id, intention) values ('00000000-0000-0000-000b-000000000017','mariage_serieux');
  perform public.admin_set_account_status(
    '00000000-0000-0000-000b-000000000017','active','suspended',
    'Action journalisée à protéger contre modification.','00000000-0000-0000-000a-000000000017');
  begin
    update public.account_moderation_actions set reason='altération' where profile_id_snapshot='00000000-0000-0000-000b-000000000017';
  exception when others then v_raised := true; v_msg := sqlerrm; end;
  if not v_raised or v_msg <> 'ACCOUNT_MODERATION_ACTIONS_APPEND_ONLY' then raise exception 'ASSERT FAIL S17: attendu APPEND_ONLY, obtenu %', coalesce(v_msg,'(succès)'); end if;
end $$;

-- ---------------------------------------------------------------------------
-- 18. DELETE du journal : ACCOUNT_MODERATION_ACTIONS_APPEND_ONLY
-- ---------------------------------------------------------------------------
DO $$
declare v_raised boolean := false; v_msg text;
begin
  insert into auth.users (id, email) values
    ('00000000-0000-0000-000a-000000000018','adm18@ex.test'),
    ('00000000-0000-0000-000b-000000000018','own18@ex.test');
  insert into public.profiles (id, intention) values ('00000000-0000-0000-000b-000000000018','mariage_serieux');
  perform public.admin_set_account_status(
    '00000000-0000-0000-000b-000000000018','active','suspended',
    'Action journalisée à protéger contre suppression.','00000000-0000-0000-000a-000000000018');
  begin
    delete from public.account_moderation_actions where profile_id_snapshot='00000000-0000-0000-000b-000000000018';
  exception when others then v_raised := true; v_msg := sqlerrm; end;
  if not v_raised or v_msg <> 'ACCOUNT_MODERATION_ACTIONS_APPEND_ONLY' then raise exception 'ASSERT FAIL S18: attendu APPEND_ONLY, obtenu %', coalesce(v_msg,'(succès)'); end if;
end $$;

-- ---------------------------------------------------------------------------
-- 19. `authenticated` ne peut PAS lire le journal : permission denied (42501)
-- ---------------------------------------------------------------------------
DO $$
declare v_raised boolean := false; v_state text; v_msg text; v_n int;
begin
  begin
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims','{"role":"authenticated"}', true);
    select count(*) into v_n from public.account_moderation_actions;
  exception when others then v_raised := true; v_state := sqlstate; v_msg := sqlerrm; end;
  if not v_raised or v_state <> '42501' or position('permission denied' in lower(v_msg)) = 0 then
    raise exception 'ASSERT FAIL S19: attendu permission denied 42501, obtenu % / %', coalesce(v_state,'-'), coalesce(v_msg,'(succès)');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 20. `authenticated` ne peut PAS exécuter la RPC : permission denied (42501)
-- ---------------------------------------------------------------------------
DO $$
declare v_raised boolean := false; v_state text; v_msg text;
begin
  begin
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims','{"role":"authenticated"}', true);
    perform public.admin_set_account_status(
      '00000000-0000-0000-000b-000000000020','active','suspended','Tentative d''appel par un membre.','00000000-0000-0000-000a-000000000020');
  exception when others then v_raised := true; v_state := sqlstate; v_msg := sqlerrm; end;
  if not v_raised or v_state <> '42501' or position('permission denied' in lower(v_msg)) = 0 then
    raise exception 'ASSERT FAIL S20: attendu permission denied 42501, obtenu % / %', coalesce(v_state,'-'), coalesce(v_msg,'(succès)');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 21. Un membre ne peut modifier NI account_status NI verification_status
--     (garde BEFORE UPDATE) : PROFILE_ADMIN_FIELDS_READ_ONLY
-- ---------------------------------------------------------------------------
DO $$
declare v_raised boolean; v_msg text;
begin
  -- 21a : account_status (profil suspendu -> membre tente de se réactiver)
  insert into auth.users (id, email) values ('00000000-0000-0000-000b-000000000021','own21@ex.test');
  insert into public.profiles (id, intention, account_status, suspended_at, suspension_reason)
    values ('00000000-0000-0000-000b-000000000021','mariage_serieux','suspended', now(),'Sanction en place, ne doit pas etre auto-levee.');
  v_raised := false;
  begin
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims','{"sub":"00000000-0000-0000-000b-000000000021","role":"authenticated"}', true);
    update public.profiles set account_status='active' where id='00000000-0000-0000-000b-000000000021';
  exception when others then v_raised := true; v_msg := sqlerrm; end;
  if not v_raised or v_msg <> 'PROFILE_ADMIN_FIELDS_READ_ONLY' then raise exception 'ASSERT FAIL S21a: attendu PROFILE_ADMIN_FIELDS_READ_ONLY, obtenu %', coalesce(v_msg,'(succès)'); end if;

  -- 21b : verification_status (membre tente de s'auto-approuver)
  insert into auth.users (id, email) values ('00000000-0000-0000-000c-000000000021','o21b@ex.test');
  insert into public.profiles (id, intention) values ('00000000-0000-0000-000c-000000000021','mariage_serieux');
  v_raised := false;
  begin
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims','{"sub":"00000000-0000-0000-000c-000000000021","role":"authenticated"}', true);
    update public.profiles set verification_status='approved' where id='00000000-0000-0000-000c-000000000021';
  exception when others then v_raised := true; v_msg := sqlerrm; end;
  if not v_raised or v_msg <> 'PROFILE_ADMIN_FIELDS_READ_ONLY' then raise exception 'ASSERT FAIL S21b: attendu PROFILE_ADMIN_FIELDS_READ_ONLY, obtenu %', coalesce(v_msg,'(succès)'); end if;
end $$;

-- ---------------------------------------------------------------------------
-- 22. Un membre ne peut fabriquer un état administratif à l'INSERT ; un INSERT
--     neutre reste autorisé (garde BEFORE INSERT).
-- ---------------------------------------------------------------------------
DO $$
declare v_raised boolean; v_msg text; v_status text; v_ver text;
begin
  -- 22a : INSERT 'suspended' fabriqué -> refus
  insert into auth.users (id, email) values ('00000000-0000-0000-000b-0000000022a1','o22a@ex.test');
  v_raised := false;
  begin
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims','{"sub":"00000000-0000-0000-000b-0000000022a1","role":"authenticated"}', true);
    insert into public.profiles (id, intention, account_status, suspended_at, suspension_reason)
      values ('00000000-0000-0000-000b-0000000022a1','mariage_serieux','suspended', now(),'Etat suspendu fabrique par le membre.');
  exception when others then v_raised := true; v_msg := sqlerrm; end;
  if not v_raised or v_msg <> 'PROFILE_ADMIN_FIELDS_READ_ONLY' then raise exception 'ASSERT FAIL S22a: attendu PROFILE_ADMIN_FIELDS_READ_ONLY, obtenu %', coalesce(v_msg,'(succès)'); end if;

  -- 22b : INSERT verification 'approved' fabriqué -> refus
  insert into auth.users (id, email) values ('00000000-0000-0000-000b-0000000022b1','o22b@ex.test');
  v_raised := false;
  begin
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims','{"sub":"00000000-0000-0000-000b-0000000022b1","role":"authenticated"}', true);
    insert into public.profiles (id, intention, verification_status)
      values ('00000000-0000-0000-000b-0000000022b1','mariage_serieux','approved');
  exception when others then v_raised := true; v_msg := sqlerrm; end;
  if not v_raised or v_msg <> 'PROFILE_ADMIN_FIELDS_READ_ONLY' then raise exception 'ASSERT FAIL S22b: attendu PROFILE_ADMIN_FIELDS_READ_ONLY, obtenu %', coalesce(v_msg,'(succès)'); end if;

  -- 22c : INSERT neutre (valeurs par défaut) -> AUTORISÉ
  insert into auth.users (id, email) values ('00000000-0000-0000-000b-0000000022c1','o22c@ex.test');
  begin
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims','{"sub":"00000000-0000-0000-000b-0000000022c1","role":"authenticated"}', true);
    insert into public.profiles (id, intention) values ('00000000-0000-0000-000b-0000000022c1','mariage_serieux');
    execute 'reset role';
    perform set_config('request.jwt.claims','', true);
  exception when others then
    execute 'reset role';
    raise exception 'ASSERT FAIL S22c: INSERT neutre refusé: %', sqlerrm;
  end;
  select account_status::text, verification_status::text into v_status, v_ver
    from public.profiles where id='00000000-0000-0000-000b-0000000022c1';
  if v_status <> 'active' or v_ver <> 'pending' then raise exception 'ASSERT FAIL S22c: état inattendu % / %', v_status, v_ver; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 23. Un membre ne peut supprimer directement son profil : permission denied
-- ---------------------------------------------------------------------------
DO $$
declare v_raised boolean := false; v_state text; v_msg text;
begin
  insert into auth.users (id, email) values ('00000000-0000-0000-000b-000000000023','own23@ex.test');
  insert into public.profiles (id, intention) values ('00000000-0000-0000-000b-000000000023','mariage_serieux');
  begin
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims','{"sub":"00000000-0000-0000-000b-000000000023","role":"authenticated"}', true);
    delete from public.profiles where id='00000000-0000-0000-000b-000000000023';
  exception when others then v_raised := true; v_state := sqlstate; v_msg := sqlerrm; end;
  if not v_raised or v_state <> '42501' or position('permission denied' in lower(v_msg)) = 0 then
    raise exception 'ASSERT FAIL S23: attendu permission denied 42501, obtenu % / %', coalesce(v_state,'-'), coalesce(v_msg,'(succès)');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 24. Suppression de l'ACTEUR admin (cascade) : actor_id -> NULL, snapshots
--     conservés, suspended_by -> NULL, profil toujours suspendu.
-- ---------------------------------------------------------------------------
DO $$
declare v_actor uuid; v_email text; v_by uuid; v_status text;
begin
  insert into auth.users (id, email) values
    ('00000000-0000-0000-000a-000000000024','adm24@ex.test'),
    ('00000000-0000-0000-000b-000000000024','own24@ex.test');
  insert into public.profiles (id, intention) values ('00000000-0000-0000-000b-000000000024','mariage_serieux');
  perform public.admin_set_account_status(
    '00000000-0000-0000-000b-000000000024','active','suspended',
    'Sanction dont l''acteur sera ensuite supprimé.','00000000-0000-0000-000a-000000000024');
  delete from auth.users where id='00000000-0000-0000-000a-000000000024';
  select actor_id, actor_email_snapshot into v_actor, v_email
    from public.account_moderation_actions where profile_id_snapshot='00000000-0000-0000-000b-000000000024';
  select suspended_by, account_status::text into v_by, v_status
    from public.profiles where id='00000000-0000-0000-000b-000000000024';
  if v_actor is not null then raise exception 'ASSERT FAIL S24: actor_id non NULL'; end if;
  if v_email <> 'adm24@ex.test' then raise exception 'ASSERT FAIL S24: email snapshot perdu (%)', v_email; end if;
  if v_by is not null then raise exception 'ASSERT FAIL S24: suspended_by non NULL'; end if;
  if v_status <> 'suspended' then raise exception 'ASSERT FAIL S24: statut % (attendu suspended)', v_status; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 25. Suppression admin du PROFIL (cascade) : journal.profile_id -> NULL,
--     profile_id_snapshot conservé, ligne toujours présente.
-- ---------------------------------------------------------------------------
DO $$
declare v_pid uuid; v_cnt int; v_reason text;
begin
  insert into auth.users (id, email) values
    ('00000000-0000-0000-000a-000000000025','adm25@ex.test'),
    ('00000000-0000-0000-000b-000000000025','own25@ex.test');
  insert into public.profiles (id, intention) values ('00000000-0000-0000-000b-000000000025','mariage_serieux');
  perform public.admin_set_account_status(
    '00000000-0000-0000-000b-000000000025','active','suspended',
    'Sanction dont le profil sera ensuite supprimé côté admin.','00000000-0000-0000-000a-000000000025');
  delete from public.profiles where id='00000000-0000-0000-000b-000000000025';
  select count(*) into v_cnt
    from public.account_moderation_actions where profile_id_snapshot='00000000-0000-0000-000b-000000000025';
  if v_cnt <> 1 then raise exception 'ASSERT FAIL S25: ligne journal perdue (count=%)', v_cnt; end if;
  select profile_id, reason into v_pid, v_reason
    from public.account_moderation_actions where profile_id_snapshot='00000000-0000-0000-000b-000000000025';
  if v_pid is not null then raise exception 'ASSERT FAIL S25: profile_id non NULL'; end if;
  if v_reason is null then raise exception 'ASSERT FAIL S25: reason perdue'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 26. Suppression du SIGNALEMENT lié (cascade) : report_id -> NULL, ligne
--     toujours présente, toutes les autres colonnes inchangées.
-- ---------------------------------------------------------------------------
DO $$
declare
  v_pid0 uuid; v_snap0 uuid; v_actor0 uuid; v_email0 text; v_prev0 text; v_new0 text; v_reason0 text; v_created0 timestamptz;
  v_report uuid; v_pid uuid; v_snap uuid; v_actor uuid; v_email text; v_prev text; v_new text; v_reason text; v_created timestamptz; v_cnt int;
begin
  insert into auth.users (id, email) values
    ('00000000-0000-0000-000a-000000000026','adm26@ex.test'),
    ('00000000-0000-0000-000b-000000000026','own26@ex.test');
  insert into public.profiles (id, intention) values ('00000000-0000-0000-000b-000000000026','mariage_serieux');
  insert into public.safety_reports (id, reported_user_id, reason, message_content_snapshot, message_created_at_snapshot, status)
    values ('00000000-0000-0000-000d-000000000026','00000000-0000-0000-000b-000000000026','harassment','msg',now(),'resolved');
  perform public.admin_set_account_status(
    '00000000-0000-0000-000b-000000000026','active','suspended',
    'Suspension liée à un signalement qui sera supprimé.','00000000-0000-0000-000a-000000000026',
    '00000000-0000-0000-000d-000000000026');

  select profile_id, profile_id_snapshot, actor_id, actor_email_snapshot, previous_status::text, new_status::text, reason, created_at
    into v_pid0, v_snap0, v_actor0, v_email0, v_prev0, v_new0, v_reason0, v_created0
    from public.account_moderation_actions where profile_id_snapshot='00000000-0000-0000-000b-000000000026';

  delete from public.safety_reports where id='00000000-0000-0000-000d-000000000026';

  select count(*) into v_cnt from public.account_moderation_actions where profile_id_snapshot='00000000-0000-0000-000b-000000000026';
  select report_id, profile_id, profile_id_snapshot, actor_id, actor_email_snapshot, previous_status::text, new_status::text, reason, created_at
    into v_report, v_pid, v_snap, v_actor, v_email, v_prev, v_new, v_reason, v_created
    from public.account_moderation_actions where profile_id_snapshot='00000000-0000-0000-000b-000000000026';

  if v_cnt <> 1 then raise exception 'ASSERT FAIL S26: ligne journal absente (count=%)', v_cnt; end if;
  if v_report is not null then raise exception 'ASSERT FAIL S26: report_id non NULL'; end if;
  if v_pid is distinct from v_pid0 then raise exception 'ASSERT FAIL S26: profile_id modifié'; end if;
  if v_snap is distinct from v_snap0 then raise exception 'ASSERT FAIL S26: profile_id_snapshot modifié'; end if;
  if v_actor is distinct from v_actor0 then raise exception 'ASSERT FAIL S26: actor_id modifié'; end if;
  if v_email is distinct from v_email0 then raise exception 'ASSERT FAIL S26: actor_email_snapshot modifié'; end if;
  if v_prev is distinct from v_prev0 or v_new is distinct from v_new0 then raise exception 'ASSERT FAIL S26: statuts modifiés'; end if;
  if v_reason is distinct from v_reason0 then raise exception 'ASSERT FAIL S26: raison modifiée'; end if;
  if v_created is distinct from v_created0 then raise exception 'ASSERT FAIL S26: created_at modifié'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 27. Mutations DIRECTES interdites (pg_trigger_depth() = 1) : chaque tentative
--     doit lever ACCOUNT_MODERATION_ACTIONS_APPEND_ONLY. La ligne reste
--     ensuite byte-logiquement inchangée.
-- ---------------------------------------------------------------------------
DO $$
declare
  v_raised boolean; v_msg text;
  -- identifiants
  a1  uuid := '00000000-0000-0000-000a-000000000027'; -- acteur 1
  a2  uuid := '00000000-0000-0000-00aa-000000000027'; -- acteur 2
  m1  uuid := '00000000-0000-0000-000b-000000000027'; -- membre 1 (journal j1, report NULL)
  m2  uuid := '00000000-0000-0000-00bb-000000000027'; -- membre 2 (journal j2, report non NULL)
  r1  uuid := '00000000-0000-0000-000d-000000000027'; -- signalement de j2
  r2  uuid := '00000000-0000-0000-00dd-000000000027'; -- signalement de rechange
  -- empreinte j1
  j1_actor uuid; j1_profile uuid; j1_report uuid; j1_snap uuid;
  j2_report uuid;
begin
  insert into auth.users (id, email) values
    (a1,'adm27@ex.test'), (a2,'adm27b@ex.test'), (m1,'own27@ex.test'), (m2,'own27b@ex.test');
  insert into public.profiles (id, intention) values (m1,'mariage_serieux'), (m2,'mariage_serieux');
  insert into public.safety_reports (id, reported_user_id, reason, message_content_snapshot, message_created_at_snapshot, status)
    values (r1, m2,'spam','msg',now(),'resolved'), (r2, m2,'spam','msg',now(),'resolved');

  -- j1 (report NULL) et j2 (report = r1)
  perform public.admin_set_account_status(m1,'active','suspended','Journal j1 sans signalement (tests directs).', a1);
  perform public.admin_set_account_status(m2,'active','suspended','Journal j2 avec signalement (tests directs).', a1, r1);

  -- Helper local : chaque UPDATE direct doit lever APPEND_ONLY.
  -- 27.1 : actor_id non-NULL -> NULL (direct)
  v_raised := false;
  begin update public.account_moderation_actions set actor_id = null where profile_id_snapshot = m1;
  exception when others then v_raised := true; v_msg := sqlerrm; end;
  if not v_raised or v_msg <> 'ACCOUNT_MODERATION_ACTIONS_APPEND_ONLY' then raise exception 'ASSERT FAIL S27.1 (actor_id->NULL direct): %', coalesce(v_msg,'(succès)'); end if;

  -- 27.2 : profile_id non-NULL -> NULL (direct)
  v_raised := false;
  begin update public.account_moderation_actions set profile_id = null where profile_id_snapshot = m1;
  exception when others then v_raised := true; v_msg := sqlerrm; end;
  if not v_raised or v_msg <> 'ACCOUNT_MODERATION_ACTIONS_APPEND_ONLY' then raise exception 'ASSERT FAIL S27.2 (profile_id->NULL direct): %', coalesce(v_msg,'(succès)'); end if;

  -- 27.3 : report_id non-NULL -> NULL (direct) sur j2
  v_raised := false;
  begin update public.account_moderation_actions set report_id = null where profile_id_snapshot = m2;
  exception when others then v_raised := true; v_msg := sqlerrm; end;
  if not v_raised or v_msg <> 'ACCOUNT_MODERATION_ACTIONS_APPEND_ONLY' then raise exception 'ASSERT FAIL S27.3 (report_id->NULL direct): %', coalesce(v_msg,'(succès)'); end if;

  -- 27.4 : actor_id UUID_A -> UUID_B
  v_raised := false;
  begin update public.account_moderation_actions set actor_id = a2 where profile_id_snapshot = m1;
  exception when others then v_raised := true; v_msg := sqlerrm; end;
  if not v_raised or v_msg <> 'ACCOUNT_MODERATION_ACTIONS_APPEND_ONLY' then raise exception 'ASSERT FAIL S27.4 (actor_id A->B): %', coalesce(v_msg,'(succès)'); end if;

  -- 27.5 : profile_id UUID_A -> UUID_B
  v_raised := false;
  begin update public.account_moderation_actions set profile_id = m2 where profile_id_snapshot = m1;
  exception when others then v_raised := true; v_msg := sqlerrm; end;
  if not v_raised or v_msg <> 'ACCOUNT_MODERATION_ACTIONS_APPEND_ONLY' then raise exception 'ASSERT FAIL S27.5 (profile_id A->B): %', coalesce(v_msg,'(succès)'); end if;

  -- 27.6 : report_id UUID_A -> UUID_B sur j2
  v_raised := false;
  begin update public.account_moderation_actions set report_id = r2 where profile_id_snapshot = m2;
  exception when others then v_raised := true; v_msg := sqlerrm; end;
  if not v_raised or v_msg <> 'ACCOUNT_MODERATION_ACTIONS_APPEND_ONLY' then raise exception 'ASSERT FAIL S27.6 (report_id A->B): %', coalesce(v_msg,'(succès)'); end if;

  -- 27.7 : report_id NULL -> UUID sur j1
  v_raised := false;
  begin update public.account_moderation_actions set report_id = r1 where profile_id_snapshot = m1;
  exception when others then v_raised := true; v_msg := sqlerrm; end;
  if not v_raised or v_msg <> 'ACCOUNT_MODERATION_ACTIONS_APPEND_ONLY' then raise exception 'ASSERT FAIL S27.7 (report_id NULL->UUID): %', coalesce(v_msg,'(succès)'); end if;

  -- 27.8 : FK (actor_id->NULL) + colonne métier (reason) simultanément
  v_raised := false;
  begin update public.account_moderation_actions set actor_id = null, reason = 'altération' where profile_id_snapshot = m1;
  exception when others then v_raised := true; v_msg := sqlerrm; end;
  if not v_raised or v_msg <> 'ACCOUNT_MODERATION_ACTIONS_APPEND_ONLY' then raise exception 'ASSERT FAIL S27.8 (FK+reason): %', coalesce(v_msg,'(succès)'); end if;

  -- 27.9 : modification de profile_id_snapshot (colonne d'audit)
  v_raised := false;
  begin update public.account_moderation_actions set profile_id_snapshot = m2 where profile_id_snapshot = m1;
  exception when others then v_raised := true; v_msg := sqlerrm; end;
  if not v_raised or v_msg <> 'ACCOUNT_MODERATION_ACTIONS_APPEND_ONLY' then raise exception 'ASSERT FAIL S27.9 (profile_id_snapshot): %', coalesce(v_msg,'(succès)'); end if;

  -- Byte-logiquement inchangé : j1 et j2 conservent leurs valeurs d'origine.
  select actor_id, profile_id, report_id, profile_id_snapshot into j1_actor, j1_profile, j1_report, j1_snap
    from public.account_moderation_actions where profile_id_snapshot = m1;
  select report_id into j2_report from public.account_moderation_actions where profile_id_snapshot = m2;
  if j1_actor is distinct from a1 or j1_profile is distinct from m1 or j1_report is not null or j1_snap is distinct from m1 then
    raise exception 'ASSERT FAIL S27: j1 altéré (actor=%, profile=%, report=%, snap=%)', j1_actor, j1_profile, j1_report, j1_snap;
  end if;
  if j2_report is distinct from r1 then raise exception 'ASSERT FAIL S27: j2.report_id altéré (%)', j2_report; end if;
end $$;

-- Marqueur : atteint UNIQUEMENT si les 27 scénarios ont passé leurs assertions
-- (toute assertion en échec aurait levé ASSERT FAIL et interrompu la suite).
SELECT 'L3F-C3A: 27/27 scenarios OK' as verdict;

ROLLBACK;

-- =============================================================================
-- FIN — ROLLBACK global : aucune donnée conservée. Un déroulé complet sans
-- erreur signifie que les 27 scénarios ont passé leurs assertions.
-- =============================================================================
