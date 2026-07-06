-- =============================================================================
-- Onboarding « Comment nous as-tu découverts ? » — Scénarios de test SQL.
-- Cibles : public.record_acquisition_source (RPC write-once), les contraintes
-- acquisition_* et le trigger de garde trg_profiles_guard_acquisition_fields.
--
-- NON EXÉCUTÉ automatiquement : hors supabase/migrations. Scénarios à jouer
-- MANUELLEMENT sur une base JETABLE (branche Supabase), JAMAIS en Production.
-- Chaque bloc est indépendant et enveloppé dans BEGIN ... ROLLBACK : aucune
-- donnée réelle conservée.
--
-- Simulation d'identité : on insère l'utilisateur dans auth.users (contexte
-- superuser = propriétaire de la RPC), puis on prend le rôle applicatif
-- `authenticated` en injectant le claim JWT `sub` (lu par auth.uid()).
--
-- Distinction du chemin autorisé (rappel) :
--   - direct PostgREST         → current_user = authenticated  → trigger BLOQUE ;
--   - RPC SECURITY DEFINER     → current_user = propriétaire RPC → trigger PASSE ;
--   - contexte superuser (ici) → current_user = propriétaire     → équivaut RPC.
--
-- UUID de travail :
--   A = 00000000-0000-0000-0000-0000000000a1
--   B = 00000000-0000-0000-0000-0000000000b1
-- =============================================================================


-- #############################################################################
-- PARTIE 1 — COMPORTEMENT DE LA RPC record_acquisition_source
-- #############################################################################

-- ---------------------------------------------------------------------------
-- 1. NON authentifié (aucun sub) : ERREUR 'not authenticated'
-- ---------------------------------------------------------------------------
BEGIN;
  set local role authenticated;
  set local request.jwt.claims = '{"role":"authenticated"}';  -- pas de sub
  select public.record_acquisition_source('instagram');  -- Attendu : ERREUR
ROLLBACK;

-- ---------------------------------------------------------------------------
-- 2. Source valide, profil inexistant : 'recorded' + création minimale
-- ---------------------------------------------------------------------------
BEGIN;
  insert into auth.users (id, email)
    values ('00000000-0000-0000-0000-0000000000a1', 'a1@ex.test');
  set local role authenticated;
  set local request.jwt.claims =
    '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
  select public.record_acquisition_source('instagram');  -- Attendu : 'recorded'
  -- Vérif : source='instagram', other NULL, recorded_at renseigné,
  --         verification_status='pending', account_status='active'.
  select acquisition_source, acquisition_source_other,
         acquisition_source_recorded_at is not null as recorded,
         verification_status, account_status
    from public.profiles where id = '00000000-0000-0000-0000-0000000000a1';
ROLLBACK;

-- ---------------------------------------------------------------------------
-- 3. Source INVALIDE : ERREUR 'invalid acquisition source'
-- ---------------------------------------------------------------------------
BEGIN;
  insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'a1@ex.test');
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
  select public.record_acquisition_source('linkedin');  -- Attendu : ERREUR
ROLLBACK;

-- ---------------------------------------------------------------------------
-- 4. 'other' SANS précision : ERREUR 'acquisition detail required for source other'
-- ---------------------------------------------------------------------------
BEGIN;
  insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'a1@ex.test');
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
  select public.record_acquisition_source('other');  -- Attendu : ERREUR
ROLLBACK;

-- ---------------------------------------------------------------------------
-- 5. 'other' précision VIDE après trim : même ERREUR (detail required)
-- ---------------------------------------------------------------------------
BEGIN;
  insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'a1@ex.test');
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
  select public.record_acquisition_source('other', '   ');  -- Attendu : ERREUR
ROLLBACK;

-- ---------------------------------------------------------------------------
-- 6. 'other' précision > 120 : ERREUR 'acquisition detail too long'
-- ---------------------------------------------------------------------------
BEGIN;
  insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'a1@ex.test');
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
  select public.record_acquisition_source('other', repeat('x', 121));  -- Attendu : ERREUR
ROLLBACK;

-- ---------------------------------------------------------------------------
-- 7. Précision fournie pour source ≠ 'other' : ERREUR 'detail not allowed'
-- ---------------------------------------------------------------------------
BEGIN;
  insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'a1@ex.test');
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
  select public.record_acquisition_source('google', 'via un ami');  -- Attendu : ERREUR
ROLLBACK;

-- ---------------------------------------------------------------------------
-- 8. 'other' + précision valide : 'recorded', other = valeur trim
-- ---------------------------------------------------------------------------
BEGIN;
  insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'a1@ex.test');
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
  select public.record_acquisition_source('other', '  Podcast mariage  ');  -- Attendu : 'recorded'
  select acquisition_source, acquisition_source_other
    from public.profiles where id = '00000000-0000-0000-0000-0000000000a1';
  -- Attendu : 'other', 'Podcast mariage'
ROLLBACK;

-- ---------------------------------------------------------------------------
-- 9. RPC : deuxième réponse DIFFÉRENTE → 'already_recorded' (1re conservée)
-- ---------------------------------------------------------------------------
BEGIN;
  insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'a1@ex.test');
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
  select public.record_acquisition_source('tiktok');    -- 'recorded'
  select public.record_acquisition_source('facebook');  -- Attendu : 'already_recorded'
  select acquisition_source from public.profiles
    where id = '00000000-0000-0000-0000-0000000000a1';  -- Attendu : 'tiktok'
ROLLBACK;

-- ---------------------------------------------------------------------------
-- 10. RPC : deuxième réponse IDENTIQUE → 'unchanged' (idempotent, sans UPDATE)
-- ---------------------------------------------------------------------------
BEGIN;
  insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'a1@ex.test');
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
  select public.record_acquisition_source('youtube');   -- 'recorded'
  select public.record_acquisition_source('youtube');   -- Attendu : 'unchanged'
ROLLBACK;

-- ---------------------------------------------------------------------------
-- 11. RPC : première écriture RÉUSSIE malgré le trigger (profil préexistant
--     sans réponse) → 'recorded', champs ordinaires/admin intacts.
-- ---------------------------------------------------------------------------
BEGIN;
  insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'a1@ex.test');
  insert into public.profiles (id, first_name)
    values ('00000000-0000-0000-0000-0000000000a1', 'Aïcha');  -- superuser = OK
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
  select public.record_acquisition_source('google');  -- Attendu : 'recorded'
  select first_name, acquisition_source, verification_status, account_status
    from public.profiles where id = '00000000-0000-0000-0000-0000000000a1';
  -- Attendu : 'Aïcha', 'google', 'pending', 'active'
ROLLBACK;

-- ---------------------------------------------------------------------------
-- 12. RPC : aucun user_id en paramètre — A et B n'affectent QUE leur ligne.
-- ---------------------------------------------------------------------------
BEGIN;
  insert into auth.users (id, email) values
    ('00000000-0000-0000-0000-0000000000a1', 'a1@ex.test'),
    ('00000000-0000-0000-0000-0000000000b1', 'b1@ex.test');
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
  select public.record_acquisition_source('instagram');  -- A
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
  select public.record_acquisition_source('tiktok');     -- B
  reset role;
  select id, acquisition_source from public.profiles
    where id in ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000b1')
    order by id;  -- Attendu : A='instagram', B='tiktok'
ROLLBACK;


-- #############################################################################
-- PARTIE 2 — GARDE EN BASE : blocage des écritures DIRECTES (contournement RPC)
-- #############################################################################

-- ---------------------------------------------------------------------------
-- 13. Membre : UPDATE DIRECT des champs acquisition (aucune réponse préalable)
--     → ERREUR 'ACQUISITION_FIELDS_READ_ONLY'
-- ---------------------------------------------------------------------------
BEGIN;
  insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'a1@ex.test');
  insert into public.profiles (id) values ('00000000-0000-0000-0000-0000000000a1');  -- legacy (superuser)
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
  -- Attendu : ERREUR 'ACQUISITION_FIELDS_READ_ONLY'
  update public.profiles
    set acquisition_source = 'tiktok', acquisition_source_recorded_at = now()
    where id = '00000000-0000-0000-0000-0000000000a1';
ROLLBACK;

-- ---------------------------------------------------------------------------
-- 14. Membre : INSERT DIRECT d'un profil PORTANT des champs acquisition
--     → ERREUR 'ACQUISITION_FIELDS_READ_ONLY'
--     (source + recorded_at posés pour satisfaire les CHECK et isoler le trigger)
-- ---------------------------------------------------------------------------
BEGIN;
  insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'a1@ex.test');
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
  -- Attendu : ERREUR 'ACQUISITION_FIELDS_READ_ONLY'
  insert into public.profiles (id, acquisition_source, acquisition_source_recorded_at)
    values ('00000000-0000-0000-0000-0000000000a1', 'tiktok', now());
ROLLBACK;

-- ---------------------------------------------------------------------------
-- 15. Membre : édition ORDINAIRE (first_name, bio, city) TOUJOURS autorisée
--     (acquisition inchangée → trigger passe).
-- ---------------------------------------------------------------------------
BEGIN;
  insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'a1@ex.test');
  insert into public.profiles (id) values ('00000000-0000-0000-0000-0000000000a1');
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
  -- Attendu : SUCCÈS (1 ligne mise à jour)
  update public.profiles
    set first_name = 'Moussa', bio = 'Quelques mots.', city = 'Dakar'
    where id = '00000000-0000-0000-0000-0000000000a1';
  select first_name, city from public.profiles
    where id = '00000000-0000-0000-0000-0000000000a1';
ROLLBACK;

-- ---------------------------------------------------------------------------
-- 16. Membre ayant répondu : tentative d'EFFACER les trois champs → ERREUR
--     'ACQUISITION_FIELDS_READ_ONLY' (le changement est déjà interdit hors RPC)
-- ---------------------------------------------------------------------------
BEGIN;
  insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'a1@ex.test');
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
  select public.record_acquisition_source('tiktok');  -- réponse enregistrée
  -- Attendu : ERREUR 'ACQUISITION_FIELDS_READ_ONLY'
  update public.profiles
    set acquisition_source = null,
        acquisition_source_other = null,
        acquisition_source_recorded_at = null
    where id = '00000000-0000-0000-0000-0000000000a1';
ROLLBACK;

-- ---------------------------------------------------------------------------
-- 17. Membre ayant répondu : tentative de REMPLACER la source → ERREUR
-- ---------------------------------------------------------------------------
BEGIN;
  insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'a1@ex.test');
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
  select public.record_acquisition_source('tiktok');
  -- Attendu : ERREUR 'ACQUISITION_FIELDS_READ_ONLY'
  update public.profiles set acquisition_source = 'facebook'
    where id = '00000000-0000-0000-0000-0000000000a1';
ROLLBACK;

-- ---------------------------------------------------------------------------
-- 18. Membre : modifier UNIQUEMENT recorded_at → ERREUR
-- ---------------------------------------------------------------------------
BEGIN;
  insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'a1@ex.test');
  insert into public.profiles (id) values ('00000000-0000-0000-0000-0000000000a1');
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
  -- Attendu : ERREUR 'ACQUISITION_FIELDS_READ_ONLY'
  update public.profiles set acquisition_source_recorded_at = now()
    where id = '00000000-0000-0000-0000-0000000000a1';
ROLLBACK;

-- ---------------------------------------------------------------------------
-- 19. Membre : modifier UNIQUEMENT la précision 'other' → ERREUR
-- ---------------------------------------------------------------------------
BEGIN;
  insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'a1@ex.test');
  insert into public.profiles (id) values ('00000000-0000-0000-0000-0000000000a1');
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
  -- Attendu : ERREUR 'ACQUISITION_FIELDS_READ_ONLY'
  update public.profiles set acquisition_source_other = 'bidouille'
    where id = '00000000-0000-0000-0000-0000000000a1';
ROLLBACK;

-- ---------------------------------------------------------------------------
-- 20. Ancien profil (trois champs NULL) : édition normale TOUJOURS possible.
-- ---------------------------------------------------------------------------
BEGIN;
  insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'a1@ex.test');
  insert into public.profiles (id, first_name)
    values ('00000000-0000-0000-0000-0000000000a1', 'Legacy');  -- acquisition NULL
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
  -- Attendu : SUCCÈS
  update public.profiles set first_name = 'Legacy MAJ'
    where id = '00000000-0000-0000-0000-0000000000a1';
  select first_name, acquisition_source from public.profiles
    where id = '00000000-0000-0000-0000-0000000000a1';  -- 'Legacy MAJ', NULL
ROLLBACK;

-- ---------------------------------------------------------------------------
-- 21. INSERT minimal d'un profil SANS donnée acquisition : autorisé (membre).
-- ---------------------------------------------------------------------------
BEGIN;
  insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'a1@ex.test');
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
  -- Attendu : SUCCÈS (création ordinaire, acquisition NULL)
  insert into public.profiles (id, first_name)
    values ('00000000-0000-0000-0000-0000000000a1', 'Nouveau');
  select acquisition_source, acquisition_source_recorded_at
    from public.profiles where id = '00000000-0000-0000-0000-0000000000a1';  -- NULL, NULL
ROLLBACK;

-- ---------------------------------------------------------------------------
-- 22. Rôle anon : EXECUTE de la RPC refusé (droits révoqués).
-- ---------------------------------------------------------------------------
BEGIN;
  set local role anon;
  -- Attendu : ERREUR permission denied for function record_acquisition_source
  select public.record_acquisition_source('instagram');
ROLLBACK;
