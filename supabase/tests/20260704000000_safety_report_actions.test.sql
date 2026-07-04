-- =============================================================================
-- L3F-C2A — Scénarios de test SQL pour admin_transition_safety_report /
--           safety_report_actions.
--
-- NON EXÉCUTÉ automatiquement : ce fichier ne fait PAS partie des migrations
-- (dossier supabase/tests, hors supabase/migrations). Il documente des
-- scénarios à jouer MANUELLEMENT, chacun enveloppé dans BEGIN ... ROLLBACK afin
-- de ne CONSERVER AUCUNE donnée réelle dans la base.
--
-- Pré-requis pour exécuter un scénario : la migration
-- 20260704000000_create_safety_report_actions.sql doit être appliquée sur une
-- base jetable (branche Supabase de préférence). Remplacer <ADMIN_UUID> par un
-- id présent dans auth.users, et <OTHER_UUID> par un autre id auth.users.
--
-- Convention d'exécution : chaque bloc est indépendant. Le ROLLBACK final
-- annule l'insertion temporaire du signalement de test et de son journal.
-- =============================================================================

-- Fixture réutilisable (dans CHAQUE bloc) : insérer un signalement 'open'.
-- Les colonnes NOT NULL sans FK obligatoire sont renseignées a minima ; les FK
-- nullables (reporter_id, reported_user_id, match_id, message_id) sont laissées
-- NULL pour ne dépendre d'aucune autre donnée.
--
--   insert into public.safety_reports (
--     reason, message_content_snapshot, message_created_at_snapshot, status
--   ) values ('spam', 'contenu de test', now(), 'open')
--   returning id;   -- => :report_id

-- ---------------------------------------------------------------------------
-- 1. open -> reviewing SANS note : SUCCÈS
-- ---------------------------------------------------------------------------
BEGIN;
  WITH r AS (
    INSERT INTO public.safety_reports (reason, message_content_snapshot, message_created_at_snapshot, status)
    VALUES ('spam', 'msg', now(), 'open') RETURNING id
  )
  SELECT public.admin_transition_safety_report(
    (SELECT id FROM r), 'open', 'reviewing', NULL, '<ADMIN_UUID>'::uuid
  );
  -- Attendu : ligne renvoyée avec status='reviewing', reviewed_by=<ADMIN_UUID>,
  --           reviewed_at renseigné ; 1 ligne journal (previous='open',
  --           new='reviewing', note NULL, actor_email_snapshot renseigné).
ROLLBACK;

-- ---------------------------------------------------------------------------
-- 2. open -> resolved SANS note : ERREUR NOTE_REQUIRED
-- ---------------------------------------------------------------------------
BEGIN;
  WITH r AS (
    INSERT INTO public.safety_reports (reason, message_content_snapshot, message_created_at_snapshot, status)
    VALUES ('spam', 'msg', now(), 'open') RETURNING id
  )
  SELECT public.admin_transition_safety_report(
    (SELECT id FROM r), 'open', 'resolved', NULL, '<ADMIN_UUID>'::uuid
  );  -- Attendu : ERREUR 'NOTE_REQUIRED'
ROLLBACK;

-- ---------------------------------------------------------------------------
-- 3. Note terminale < 10 caractères : ERREUR NOTE_LENGTH_INVALID
-- ---------------------------------------------------------------------------
BEGIN;
  WITH r AS (
    INSERT INTO public.safety_reports (reason, message_content_snapshot, message_created_at_snapshot, status)
    VALUES ('spam', 'msg', now(), 'open') RETURNING id
  )
  SELECT public.admin_transition_safety_report(
    (SELECT id FROM r), 'open', 'resolved', '  court  ', '<ADMIN_UUID>'::uuid
  );  -- Attendu : ERREUR 'NOTE_LENGTH_INVALID' (btrim('  court  ')='court' -> 5)
ROLLBACK;

-- ---------------------------------------------------------------------------
-- 4. open -> resolved AVEC note valide : SUCCÈS (mise à jour + journal atomiques)
-- ---------------------------------------------------------------------------
BEGIN;
  WITH r AS (
    INSERT INTO public.safety_reports (reason, message_content_snapshot, message_created_at_snapshot, status)
    VALUES ('spam', 'msg', now(), 'open') RETURNING id
  )
  SELECT public.admin_transition_safety_report(
    (SELECT id FROM r), 'open', 'resolved', 'Signalement fondé, message supprimé côté produit.', '<ADMIN_UUID>'::uuid
  );
  -- Attendu : status='resolved', resolution_note posée, reviewed_by/at posés ;
  --           1 ligne journal (previous='open', new='resolved', note = texte).
ROLLBACK;

-- ---------------------------------------------------------------------------
-- 5. reviewing -> dismissed : SUCCÈS
-- ---------------------------------------------------------------------------
BEGIN;
  WITH r AS (
    INSERT INTO public.safety_reports (reason, message_content_snapshot, message_created_at_snapshot, status)
    VALUES ('spam', 'msg', now(), 'reviewing') RETURNING id
  )
  SELECT public.admin_transition_safety_report(
    (SELECT id FROM r), 'reviewing', 'dismissed', 'Aucune infraction constatée après revue.', '<ADMIN_UUID>'::uuid
  );  -- Attendu : status='dismissed' + journal.
ROLLBACK;

-- ---------------------------------------------------------------------------
-- 6. Transition depuis un statut terminal (resolved) : REFUS
-- ---------------------------------------------------------------------------
BEGIN;
  WITH r AS (
    INSERT INTO public.safety_reports (reason, message_content_snapshot, message_created_at_snapshot, status)
    VALUES ('spam', 'msg', now(), 'resolved') RETURNING id
  )
  SELECT public.admin_transition_safety_report(
    (SELECT id FROM r), 'resolved', 'dismissed', 'note suffisamment longue pour passer', '<ADMIN_UUID>'::uuid
  );  -- Attendu : ERREUR 'REPORT_ALREADY_FINAL'
ROLLBACK;

-- ---------------------------------------------------------------------------
-- 7. Transition vers le statut courant : REFUS
-- ---------------------------------------------------------------------------
BEGIN;
  WITH r AS (
    INSERT INTO public.safety_reports (reason, message_content_snapshot, message_created_at_snapshot, status)
    VALUES ('spam', 'msg', now(), 'reviewing') RETURNING id
  )
  SELECT public.admin_transition_safety_report(
    (SELECT id FROM r), 'reviewing', 'reviewing', NULL, '<ADMIN_UUID>'::uuid
  );  -- Attendu : ERREUR 'INVALID_REPORT_TRANSITION'
ROLLBACK;

-- ---------------------------------------------------------------------------
-- 8. p_expected_status obsolète (statut réel différent) : REPORT_STATUS_CONFLICT
-- ---------------------------------------------------------------------------
BEGIN;
  WITH r AS (
    INSERT INTO public.safety_reports (reason, message_content_snapshot, message_created_at_snapshot, status)
    VALUES ('spam', 'msg', now(), 'reviewing') RETURNING id
  )
  SELECT public.admin_transition_safety_report(
    (SELECT id FROM r), 'open', 'resolved', 'note suffisamment longue pour passer', '<ADMIN_UUID>'::uuid
  );  -- Attendu : ERREUR 'REPORT_STATUS_CONFLICT' (réel='reviewing', attendu='open')
ROLLBACK;

-- ---------------------------------------------------------------------------
-- 9. Acteur absent de auth.users : ERREUR ACTOR_NOT_FOUND
-- ---------------------------------------------------------------------------
BEGIN;
  WITH r AS (
    INSERT INTO public.safety_reports (reason, message_content_snapshot, message_created_at_snapshot, status)
    VALUES ('spam', 'msg', now(), 'open') RETURNING id
  )
  SELECT public.admin_transition_safety_report(
    (SELECT id FROM r), 'open', 'reviewing', NULL, '00000000-0000-0000-0000-000000000000'::uuid
  );  -- Attendu : ERREUR 'ACTOR_NOT_FOUND'
ROLLBACK;

-- ---------------------------------------------------------------------------
-- 10. UPDATE direct du journal : REFUS (trigger append-only)
-- ---------------------------------------------------------------------------
BEGIN;
  WITH r AS (
    INSERT INTO public.safety_reports (reason, message_content_snapshot, message_created_at_snapshot, status)
    VALUES ('spam', 'msg', now(), 'open') RETURNING id
  ), t AS (
    SELECT public.admin_transition_safety_report((SELECT id FROM r), 'open', 'reviewing', NULL, '<ADMIN_UUID>'::uuid)
  )
  UPDATE public.safety_report_actions SET note = 'altération' WHERE true;
  -- Attendu : ERREUR 'SAFETY_REPORT_ACTIONS_APPEND_ONLY'
ROLLBACK;

-- ---------------------------------------------------------------------------
-- 11. DELETE direct du journal : REFUS (trigger append-only)
-- ---------------------------------------------------------------------------
BEGIN;
  WITH r AS (
    INSERT INTO public.safety_reports (reason, message_content_snapshot, message_created_at_snapshot, status)
    VALUES ('spam', 'msg', now(), 'open') RETURNING id
  ), t AS (
    SELECT public.admin_transition_safety_report((SELECT id FROM r), 'open', 'reviewing', NULL, '<ADMIN_UUID>'::uuid)
  )
  DELETE FROM public.safety_report_actions WHERE true;
  -- Attendu : ERREUR 'SAFETY_REPORT_ACTIONS_APPEND_ONLY'
ROLLBACK;

-- ---------------------------------------------------------------------------
-- 12. Rôle authenticated : ni lecture de la table, ni exécution de la fonction.
--     À jouer en usurpant le rôle applicatif :
-- ---------------------------------------------------------------------------
BEGIN;
  SET LOCAL role authenticated;
  -- Attendu : ERREUR permission denied
  SELECT count(*) FROM public.safety_report_actions;
ROLLBACK;

BEGIN;
  SET LOCAL role authenticated;
  -- Attendu : ERREUR permission denied for function admin_transition_safety_report
  SELECT public.admin_transition_safety_report(
    gen_random_uuid(), 'open', 'reviewing', NULL, gen_random_uuid()
  );
ROLLBACK;

-- Note concurrence (à jouer sur deux sessions) : session A ouvre une transaction
-- et appelle la fonction (verrou FOR UPDATE) ; session B appelle en parallèle
-- avec le même p_expected_status. B attend le COMMIT de A puis relit un statut
-- devenu terminal/différent -> REPORT_ALREADY_FINAL ou REPORT_STATUS_CONFLICT.
-- Aucune double transition, aucun journal en double.
