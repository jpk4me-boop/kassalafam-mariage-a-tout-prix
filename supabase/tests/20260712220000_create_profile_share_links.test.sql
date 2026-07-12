-- =============================================================================
-- Suite pgTAP — Backend des liens de partage publics (PR2 partage de profils)
-- Cibles : table public.profile_share_links (structure, contraintes, RLS,
--          privilèges) et RPC service_role create/revoke/resolve_profile_share_
--          link + admin_list_profile_share_links + profile_is_shareable.
--
-- Exécution : npx supabase test db  (stack local Docker — labo VPS).
--
-- Principe : TRANSACTION UNIQUE (begin … rollback), même convention que la
-- suite PR1 : helpers SECURITY INVOKER capturant résultat/exception dans des
-- GUC de session (`test.*`), bascules de rôle applicatif (anon/authenticated/
-- service_role), assertions pgTAP jouées en postgres, données 100 % fictives.
--
-- UUID de travail (constants) :
--   ADM = 00000000-0000-0000-0000-00000000ad01  (admin auth.users SANS profil)
--   P1  = 00000000-0000-0000-0000-0000000000a1  (profil publiable + consentement)
--   P2  = 00000000-0000-0000-0000-0000000000b1  (profil publiable SANS consentement)
--   P3  = 00000000-0000-0000-0000-0000000000c1  (vérification pending + consentement)
--   ABS = 00000000-0000-0000-0000-0000000000e1  (profil inexistant)
-- =============================================================================

begin;

create extension if not exists pgtap with schema extensions;

set search_path = extensions, public, pg_catalog;

-- ---------------------------------------------------------------------------
-- Helpers (SECURITY INVOKER : héritent du rôle courant). Détruits au ROLLBACK.
-- ---------------------------------------------------------------------------

-- Exécute un SQL arbitraire ; capture succès ('') ou exception.
create function public._psl_cap(p_sql text)
returns void language plpgsql as $$
begin
  execute p_sql;
  perform set_config('test.state', '', true);
  perform set_config('test.err', '', true);
exception when others then
  perform set_config('test.state', sqlstate, true);
  perform set_config('test.err', sqlerrm, true);
end; $$;

-- Exécute create_profile_share_link ; capture (link_id, token, prefix,
-- expires) ou l'exception.
create function public._psl_cap_create(
  p_profile uuid, p_actor uuid, p_expires timestamptz default null)
returns void language plpgsql as $$
declare v_id uuid; v_token text; v_prefix text; v_exp timestamptz;
begin
  select link_id, token, token_prefix, expires_at
    into v_id, v_token, v_prefix, v_exp
    from public.create_profile_share_link(p_profile, p_actor, p_expires);
  perform set_config('test.link_id', coalesce(v_id::text, ''), true);
  perform set_config('test.token', coalesce(v_token, ''), true);
  perform set_config('test.prefix', coalesce(v_prefix, ''), true);
  perform set_config('test.expires', coalesce(v_exp::text, ''), true);
  perform set_config('test.state', '', true);
  perform set_config('test.err', '', true);
exception when others then
  perform set_config('test.link_id', '', true);
  perform set_config('test.token', '', true);
  perform set_config('test.prefix', '', true);
  perform set_config('test.expires', '', true);
  perform set_config('test.state', sqlstate, true);
  perform set_config('test.err', sqlerrm, true);
end; $$;

-- Exécute revoke_profile_share_link ; capture le booléen ou l'exception.
create function public._psl_cap_revoke(
  p_link uuid, p_actor uuid, p_reason text default null)
returns void language plpgsql as $$
declare v boolean;
begin
  v := public.revoke_profile_share_link(p_link, p_actor, p_reason);
  perform set_config('test.revoked', coalesce(v::text, ''), true);
  perform set_config('test.state', '', true);
  perform set_config('test.err', '', true);
exception when others then
  perform set_config('test.revoked', '', true);
  perform set_config('test.state', sqlstate, true);
  perform set_config('test.err', sqlerrm, true);
end; $$;

-- Compte les lignes renvoyées par resolve_profile_share_link(p_token).
create function public._psl_resolve_count(p_token text)
returns int language plpgsql as $$
declare n int;
begin
  select count(*) into n from public.resolve_profile_share_link(p_token);
  return n;
end; $$;

-- Bascule l'identité JWT applicative (pour les tests de refus).
create function public._psl_as(p_uid text)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end; $$;

-- ---------------------------------------------------------------------------
-- Fixtures (créées en postgres, avant tout changement de rôle).
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000ad01', 'admin@ex.test'),
  ('00000000-0000-0000-0000-0000000000a1', 'p1@ex.test'),
  ('00000000-0000-0000-0000-0000000000b1', 'p2@ex.test'),
  ('00000000-0000-0000-0000-0000000000c1', 'p3@ex.test');
-- ADM (…ad01) : admin auth.users SANS ligne profiles (cas réel allowlist env).

insert into public.profiles
  (id, first_name, verification_status, onboarding_completed_at) values
  ('00000000-0000-0000-0000-0000000000a1', 'Publiable P1', 'approved', now()),
  ('00000000-0000-0000-0000-0000000000b1', 'Sans consentement P2', 'approved', now()),
  ('00000000-0000-0000-0000-0000000000c1', 'Non vérifié P3', 'pending', now());

insert into public.profile_share_consents (profile_id, policy_version, consent_text)
values
  ('00000000-0000-0000-0000-0000000000a1', '2026-07-v1', 'consentement fictif P1'),
  ('00000000-0000-0000-0000-0000000000c1', '2026-07-v1', 'consentement fictif P3');

-- ===========================================================================
select plan(84);
-- ===========================================================================


-- ###########################################################################
-- SECTION 1 — STRUCTURE, RLS, PRIVILÈGES (T1..T36)
-- ###########################################################################

-- T1..T2 : table + colonnes exactes
select has_table('public', 'profile_share_links', 'table profile_share_links présente');
select columns_are('public', 'profile_share_links',
  array['id','profile_id','token_hash','token_prefix','created_by',
        'created_at','expires_at','revoked_at','revoked_by','revocation_reason'],
  'colonnes attendues exactes');

-- T3 : RLS activée
select is(
  (select relrowsecurity from pg_class where oid = 'public.profile_share_links'::regclass),
  true, 'RLS activée sur profile_share_links');

-- T4 : AUCUNE policy (aucun accès client, même en lecture)
select is(
  (select count(*)::int from pg_policies
     where schemaname='public' and tablename='profile_share_links'),
  0, 'aucune policy : aucun accès direct anon/authenticated');

-- T5 : index unique partiel « un lien non révoqué par profil »
select ok(
  (select indexdef ilike '%unique%' and indexdef ilike '%revoked_at is null%'
     from pg_indexes
     where schemaname='public' and tablename='profile_share_links'
       and indexname='profile_share_links_one_unrevoked'),
  'index unique partiel one_unrevoked (profile_id WHERE revoked_at IS NULL)');

-- T6 : clé primaire
select has_pk('public', 'profile_share_links', 'clé primaire présente');

-- T7 : FK profile_id -> profiles ON DELETE CASCADE
select ok(
  (select pg_get_constraintdef(oid) ilike '%references profiles(id) on delete cascade%'
     from pg_constraint
     where conrelid='public.profile_share_links'::regclass
       and conname='profile_share_links_profile_id_fkey'),
  'FK profile_id -> profiles(id) ON DELETE CASCADE');

-- T8..T9 : contraintes de cohérence
select ok(
  exists (select 1 from pg_constraint
    where conrelid='public.profile_share_links'::regclass
      and conname='profile_share_links_expires_after_created'),
  'contrainte expires_at > created_at présente');
select ok(
  exists (select 1 from pg_constraint
    where conrelid='public.profile_share_links'::regclass
      and conname='profile_share_links_revoked_coherence'),
  'contrainte revoked_at IS NULL = revoked_by IS NULL présente');

-- T10..T14 : les 5 fonctions sont SECURITY DEFINER
select is((select prosecdef from pg_proc where oid =
  'public.create_profile_share_link(uuid,uuid,timestamptz)'::regprocedure),
  true, 'create_profile_share_link est SECURITY DEFINER');
select is((select prosecdef from pg_proc where oid =
  'public.revoke_profile_share_link(uuid,uuid,text)'::regprocedure),
  true, 'revoke_profile_share_link est SECURITY DEFINER');
select is((select prosecdef from pg_proc where oid =
  'public.resolve_profile_share_link(text)'::regprocedure),
  true, 'resolve_profile_share_link est SECURITY DEFINER');
select is((select prosecdef from pg_proc where oid =
  'public.admin_list_profile_share_links(uuid)'::regprocedure),
  true, 'admin_list_profile_share_links est SECURITY DEFINER');
select is((select prosecdef from pg_proc where oid =
  'public.profile_is_shareable(uuid)'::regprocedure),
  true, 'profile_is_shareable est SECURITY DEFINER');

-- T15..T19 : search_path verrouillé sur les 5 fonctions
select ok((select proconfig::text like '%search_path=%' from pg_proc where oid =
  'public.create_profile_share_link(uuid,uuid,timestamptz)'::regprocedure),
  'create : search_path explicitement fixé');
select ok((select proconfig::text like '%search_path=%' from pg_proc where oid =
  'public.revoke_profile_share_link(uuid,uuid,text)'::regprocedure),
  'revoke : search_path explicitement fixé');
select ok((select proconfig::text like '%search_path=%' from pg_proc where oid =
  'public.resolve_profile_share_link(text)'::regprocedure),
  'resolve : search_path explicitement fixé');
select ok((select proconfig::text like '%search_path=%' from pg_proc where oid =
  'public.admin_list_profile_share_links(uuid)'::regprocedure),
  'admin_list : search_path explicitement fixé');
select ok((select proconfig::text like '%search_path=%' from pg_proc where oid =
  'public.profile_is_shareable(uuid)'::regprocedure),
  'profile_is_shareable : search_path explicitement fixé');

-- T20..T31 : EXECUTE réservé à service_role sur les 4 RPC exposées
select is(has_function_privilege('service_role',
  'public.create_profile_share_link(uuid,uuid,timestamptz)', 'EXECUTE'),
  true,  'service_role peut exécuter create');
select is(has_function_privilege('anon',
  'public.create_profile_share_link(uuid,uuid,timestamptz)', 'EXECUTE'),
  false, 'anon ne peut pas exécuter create');
select is(has_function_privilege('authenticated',
  'public.create_profile_share_link(uuid,uuid,timestamptz)', 'EXECUTE'),
  false, 'authenticated ne peut pas exécuter create');
select is(has_function_privilege('service_role',
  'public.revoke_profile_share_link(uuid,uuid,text)', 'EXECUTE'),
  true,  'service_role peut exécuter revoke');
select is(has_function_privilege('anon',
  'public.revoke_profile_share_link(uuid,uuid,text)', 'EXECUTE'),
  false, 'anon ne peut pas exécuter revoke');
select is(has_function_privilege('authenticated',
  'public.revoke_profile_share_link(uuid,uuid,text)', 'EXECUTE'),
  false, 'authenticated ne peut pas exécuter revoke');
select is(has_function_privilege('service_role',
  'public.resolve_profile_share_link(text)', 'EXECUTE'),
  true,  'service_role peut exécuter resolve');
select is(has_function_privilege('anon',
  'public.resolve_profile_share_link(text)', 'EXECUTE'),
  false, 'anon ne peut pas exécuter resolve');
select is(has_function_privilege('authenticated',
  'public.resolve_profile_share_link(text)', 'EXECUTE'),
  false, 'authenticated ne peut pas exécuter resolve');
select is(has_function_privilege('service_role',
  'public.admin_list_profile_share_links(uuid)', 'EXECUTE'),
  true,  'service_role peut exécuter admin_list');
select is(has_function_privilege('anon',
  'public.admin_list_profile_share_links(uuid)', 'EXECUTE'),
  false, 'anon ne peut pas exécuter admin_list');
select is(has_function_privilege('authenticated',
  'public.admin_list_profile_share_links(uuid)', 'EXECUTE'),
  false, 'authenticated ne peut pas exécuter admin_list');

-- T32..T36 : privilèges de table
select is(has_table_privilege('anon', 'public.profile_share_links', 'SELECT'),
  false, 'anon ne peut pas lire la table');
select is(has_table_privilege('authenticated', 'public.profile_share_links', 'SELECT'),
  false, 'authenticated ne peut pas lire la table');
select is(
  has_table_privilege('authenticated', 'public.profile_share_links', 'INSERT')
  or has_table_privilege('authenticated', 'public.profile_share_links', 'UPDATE')
  or has_table_privilege('authenticated', 'public.profile_share_links', 'DELETE'),
  false, 'authenticated n''a AUCUN privilège d''écriture directe');
select is(has_table_privilege('service_role', 'public.profile_share_links', 'SELECT'),
  true, 'service_role garde la lecture serveur (diagnostic)');
select is(
  has_table_privilege('service_role', 'public.profile_share_links', 'INSERT')
  or has_table_privilege('service_role', 'public.profile_share_links', 'UPDATE')
  or has_table_privilege('service_role', 'public.profile_share_links', 'DELETE'),
  false, 'service_role n''écrit JAMAIS directement (RPC uniquement)');


-- ###########################################################################
-- SECTION 2 — CRÉATION (T37..T55)
-- ###########################################################################

-- T37 : acteur inconnu refusé
select public._psl_cap_create('00000000-0000-0000-0000-0000000000a1',
  '99999999-9999-9999-9999-999999999999');
select is(current_setting('test.err', true), 'ACTOR_NOT_FOUND',
  'création : acteur inconnu refusé (ACTOR_NOT_FOUND)');

-- T38 : profil inexistant refusé
select public._psl_cap_create('00000000-0000-0000-0000-0000000000e1',
  '00000000-0000-0000-0000-00000000ad01');
select is(current_setting('test.err', true), 'PROFILE_NOT_FOUND',
  'création : profil inexistant refusé (PROFILE_NOT_FOUND)');

-- T39 : sans consentement actif refusé (P2)
select public._psl_cap_create('00000000-0000-0000-0000-0000000000b1',
  '00000000-0000-0000-0000-00000000ad01');
select is(current_setting('test.err', true), 'CONSENT_REQUIRED',
  'création : refusée sans consentement actif (CONSENT_REQUIRED)');

-- T40 : profil non publiable refusé (P3 : pending, consentement présent)
select public._psl_cap_create('00000000-0000-0000-0000-0000000000c1',
  '00000000-0000-0000-0000-00000000ad01');
select is(current_setting('test.err', true), 'PROFILE_NOT_PUBLISHABLE',
  'création : profil non vérifié refusé (PROFILE_NOT_PUBLISHABLE)');

-- T41 : expiration trop proche (< 1 h) refusée — couvre aussi le passé
select public._psl_cap_create('00000000-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-00000000ad01', now() + interval '5 minutes');
select is(current_setting('test.err', true), 'EXPIRY_TOO_SHORT',
  'création : expiration < 1 heure refusée (EXPIRY_TOO_SHORT)');

-- T42 : expiration au-delà de 30 jours refusée
select public._psl_cap_create('00000000-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-00000000ad01', now() + interval '60 days');
select is(current_setting('test.err', true), 'EXPIRY_TOO_LONG',
  'création : expiration > 30 jours refusée (EXPIRY_TOO_LONG)');

-- T43 : création nominale P1 — exécutée EN service_role (rôle applicatif réel)
set local role service_role;
select public._psl_cap_create('00000000-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-00000000ad01');
reset role;
select is(current_setting('test.state', true), '',
  'P1 : création réussie sous service_role');

-- T44 : jeton URL-safe de 43 caractères (32 octets base64 sans padding)
select matches(current_setting('test.token', true), '^[A-Za-z0-9_-]{43}$',
  'jeton : 43 caractères base64 URL-safe');

-- T45 : le jeton ne contient pas l''UUID du profil (ni avec ni sans tirets)
select ok(
  position('00000000-0000-0000-0000-0000000000a1' in current_setting('test.token', true)) = 0
  and position(replace('00000000-0000-0000-0000-0000000000a1', '-', '')
      in current_setting('test.token', true)) = 0,
  'jeton : aucun UUID de profil incorporé');

-- T46 : préfixe = 8 premiers caractères du jeton
select is(current_setting('test.prefix', true),
  left(current_setting('test.token', true), 8),
  'préfixe = left(jeton, 8) — insuffisant pour reconstruire (8/43)');

-- T47 : seul le hash SHA-256 est stocké (correspond au jeton retourné)
select is(
  (select l.token_hash from public.profile_share_links l
     where l.id = current_setting('test.link_id', true)::uuid),
  extensions.digest(current_setting('test.token', true), 'sha256'),
  'hash SHA-256 du jeton stocké, conforme');

-- T48 : une seule ligne, non révoquée
select is(
  (select count(*)::int from public.profile_share_links
     where profile_id = '00000000-0000-0000-0000-0000000000a1'
       and revoked_at is null),
  1, 'P1 : exactement un lien non révoqué');

-- T49 : le jeton en clair n''apparaît dans AUCUNE colonne texte de la ligne
select ok(
  (select l.token_prefix <> current_setting('test.token', true)
      and char_length(l.token_prefix) = 8
      and coalesce(l.revocation_reason, '')
          not like '%' || current_setting('test.token', true) || '%'
     from public.profile_share_links l
     where l.id = current_setting('test.link_id', true)::uuid),
  'jeton en clair absent de la table');

-- T50 : expiration par défaut ≈ 7 jours
select ok(
  current_setting('test.expires', true)::timestamptz
    between now() + interval '6 days 23 hours'
        and now() + interval '7 days 1 hour',
  'expiration par défaut : 7 jours');

-- T51 : un lien VALIDE existe déjà → LINK_ALREADY_ACTIVE
select public._psl_cap_create('00000000-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-00000000ad01');
select is(current_setting('test.err', true), 'LINK_ALREADY_ACTIVE',
  'création : refusée tant qu''un lien valide existe (LINK_ALREADY_ACTIVE)');

-- T52 : toujours une seule ligne après le refus
select is(
  (select count(*)::int from public.profile_share_links
     where profile_id = '00000000-0000-0000-0000-0000000000a1'),
  1, 'P1 : aucun doublon créé par le refus');

-- Mémorise le lien 1 puis le rend EXPIRÉ (manipulation directe postgres,
-- uniquement possible en test : aucun rôle applicatif ne peut le faire).
select set_config('test.link1',
  (select id::text from public.profile_share_links
     where profile_id = '00000000-0000-0000-0000-0000000000a1'), true);
update public.profile_share_links
  set created_at = now() - interval '10 days',
      expires_at = now() - interval '3 days'
  where id = current_setting('test.link1', true)::uuid;

-- T53 : rotation automatique — un lien expiré non révoqué est remplacé
select public._psl_cap_create('00000000-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-00000000ad01');
select is(current_setting('test.state', true), '',
  'rotation : création acceptée par-dessus un lien expiré');

-- T54 : 2 lignes au total, UNE seule non révoquée (index partiel respecté)
select ok(
  (select count(*) = 2 and count(*) filter (where revoked_at is null) = 1
     from public.profile_share_links
     where profile_id = '00000000-0000-0000-0000-0000000000a1'),
  'rotation : 2 liens au total, un seul non révoqué');

-- T55 : l''ancien lien a été révoqué par la rotation, attribuée à l''acteur
select ok(
  (select l.revoked_at is not null
      and l.revoked_by = '00000000-0000-0000-0000-00000000ad01'
      and l.revocation_reason like 'Rotation automatique%'
     from public.profile_share_links l
     where l.id = current_setting('test.link1', true)::uuid),
  'rotation : ancien lien révoqué, motif de rotation journalisé');


-- ###########################################################################
-- SECTION 3 — RÉSOLUTION (T56..T66)
-- ###########################################################################

-- Le jeton courant (lien 2, valide) sert de référence.
select set_config('test.token2', current_setting('test.token', true), true);
select set_config('test.link2', current_setting('test.link_id', true), true);

-- T56 : jeton valide résolu → 1 ligne, bon lien, bon profil
select ok(
  (select count(*) = 1
      and bool_and(r.link_id = current_setting('test.link2', true)::uuid)
      and bool_and(r.profile_id = '00000000-0000-0000-0000-0000000000a1')
     from public.resolve_profile_share_link(
       current_setting('test.token2', true)) r),
  'résolution : jeton valide → contexte minimal correct');

-- T57 : jeton inconnu bien formé → zéro ligne (aucune fuite de cause)
select is(public._psl_resolve_count(
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'), 0,
  'résolution : jeton inconnu refusé (0 ligne)');

-- T58 : jeton ALTÉRÉ (dernier caractère changé) → zéro ligne
select is(public._psl_resolve_count(
  left(current_setting('test.token2', true), 42)
  || case when right(current_setting('test.token2', true), 1) = 'A'
          then 'B' else 'A' end), 0,
  'résolution : jeton altéré refusé (0 ligne)');

-- T59 : jeton malformé (longueur/alphabet) → zéro ligne, sans erreur
select is(public._psl_resolve_count('pas-un-jeton!'), 0,
  'résolution : jeton malformé refusé (0 ligne)');

-- T60 : le RETRAIT du consentement invalide immédiatement le lien
update public.profile_share_consents
  set withdrawn_at = now(),
      withdrawn_by = '00000000-0000-0000-0000-0000000000a1'
  where profile_id = '00000000-0000-0000-0000-0000000000a1';
select is(public._psl_resolve_count(current_setting('test.token2', true)), 0,
  'résolution : consentement retiré → lien immédiatement invalide');

-- T61 : consentement rétabli → le lien redevient résoluble (contrôle vivant)
update public.profile_share_consents
  set withdrawn_at = null, withdrawn_by = null
  where profile_id = '00000000-0000-0000-0000-0000000000a1';
select is(public._psl_resolve_count(current_setting('test.token2', true)), 1,
  'résolution : conditions revérifiées à CHAQUE appel');

-- T62 : SUSPENSION du compte → lien invalide
update public.profiles
  set account_status = 'suspended',
      suspended_at = now(),
      suspended_by = '00000000-0000-0000-0000-00000000ad01',
      suspension_reason = 'Suspension fictive de test PR2.'
  where id = '00000000-0000-0000-0000-0000000000a1';
select is(public._psl_resolve_count(current_setting('test.token2', true)), 0,
  'résolution : compte suspendu → lien invalide');

-- T63 : réactivation → lien de nouveau valide
update public.profiles
  set account_status = 'active',
      suspended_at = null, suspended_by = null, suspension_reason = null
  where id = '00000000-0000-0000-0000-0000000000a1';
select is(public._psl_resolve_count(current_setting('test.token2', true)), 1,
  'résolution : compte réactivé → lien de nouveau valide');

-- T64 : vérification retirée (pending) → lien invalide ; puis restauration
update public.profiles set verification_status = 'pending'
  where id = '00000000-0000-0000-0000-0000000000a1';
select is(public._psl_resolve_count(current_setting('test.token2', true)), 0,
  'résolution : profil plus vérifié → lien invalide');
update public.profiles set verification_status = 'approved'
  where id = '00000000-0000-0000-0000-0000000000a1';

-- T65 : lien EXPIRÉ → zéro ligne
update public.profile_share_links
  set created_at = now() - interval '10 days',
      expires_at = now() - interval '1 hour'
  where id = current_setting('test.link2', true)::uuid;
select is(public._psl_resolve_count(current_setting('test.token2', true)), 0,
  'résolution : lien expiré refusé (0 ligne)');

-- T66 : la résolution ne renvoie QUE le contexte serveur minimal prévu
select is(
  pg_get_function_result('public.resolve_profile_share_link(text)'::regprocedure),
  'TABLE(link_id uuid, profile_id uuid, expires_at timestamp with time zone)',
  'résolution : colonnes limitées à link_id/profile_id/expires_at');


-- ###########################################################################
-- SECTION 4 — RÉVOCATION (T67..T74)
-- ###########################################################################

-- Nouveau lien 3 (rotation par-dessus le lien 2 expiré).
select public._psl_cap_create('00000000-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-00000000ad01');
select set_config('test.link3', current_setting('test.link_id', true), true);
select set_config('test.token3', current_setting('test.token', true), true);

-- T67 : révocation réussie (true)
select public._psl_cap_revoke(current_setting('test.link3', true)::uuid,
  '00000000-0000-0000-0000-00000000ad01', 'Révocation fictive de test.');
select is(current_setting('test.revoked', true), 'true',
  'révocation : premier appel → true');

-- T68 : ligne CONSERVÉE, revoked_at/by/motif renseignés
select ok(
  (select l.revoked_at is not null
      and l.revoked_by = '00000000-0000-0000-0000-00000000ad01'
      and l.revocation_reason = 'Révocation fictive de test.'
     from public.profile_share_links l
     where l.id = current_setting('test.link3', true)::uuid),
  'révocation : historique conservé, acteur et motif renseignés');

-- T69 : revoked_at >= created_at
select ok(
  (select l.revoked_at >= l.created_at from public.profile_share_links l
     where l.id = current_setting('test.link3', true)::uuid),
  'révocation : revoked_at cohérent avec created_at');

-- T70 : le jeton révoqué ne se résout plus
select is(public._psl_resolve_count(current_setting('test.token3', true)), 0,
  'résolution : lien révoqué refusé (0 ligne)');

-- Mémorise l'horodatage du premier retrait pour le test d'idempotence.
select set_config('test.revoked_at3',
  (select revoked_at::text from public.profile_share_links
     where id = current_setting('test.link3', true)::uuid), true);

-- T71 : seconde révocation idempotente (false, aucune erreur)
select public._psl_cap_revoke(current_setting('test.link3', true)::uuid,
  '00000000-0000-0000-0000-00000000ad01');
select is(current_setting('test.revoked', true), 'false',
  'révocation : second appel → false (idempotent)');

-- T72 : l'horodatage du PREMIER retrait est inchangé
select is(
  (select revoked_at::text from public.profile_share_links
     where id = current_setting('test.link3', true)::uuid),
  current_setting('test.revoked_at3', true),
  'révocation : revoked_at d''origine conservé');

-- T73 : lien inconnu → LINK_NOT_FOUND
select public._psl_cap_revoke('99999999-9999-9999-9999-999999999999',
  '00000000-0000-0000-0000-00000000ad01');
select is(current_setting('test.err', true), 'LINK_NOT_FOUND',
  'révocation : lien inconnu refusé (LINK_NOT_FOUND)');

-- T74 : AUCUNE suppression : les 3 liens de P1 existent toujours
select is(
  (select count(*)::int from public.profile_share_links
     where profile_id = '00000000-0000-0000-0000-0000000000a1'),
  3, 'aucune ligne supprimée : 3 liens historiques conservés');


-- ###########################################################################
-- SECTION 5 — LISTE ADMIN (T75..T78)
-- ###########################################################################

-- T75 : nouveau lien 4 (tous les précédents sont révoqués) → succès
select public._psl_cap_create('00000000-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-00000000ad01');
select is(current_setting('test.state', true), '',
  'lien 4 créé (précédents tous révoqués)');

-- T76 : la liste renvoie les 4 liens de P1
select is(
  (select count(*)::int from public.admin_list_profile_share_links(
     '00000000-0000-0000-0000-0000000000a1')),
  4, 'liste admin : 4 liens historiques pour P1');

-- T77 : statuts calculés — 3 révoqués + 1 actif
select ok(
  (select count(*) filter (where status = 'revoked') = 3
      and count(*) filter (where status = 'active') = 1
     from public.admin_list_profile_share_links(
       '00000000-0000-0000-0000-0000000000a1')),
  'liste admin : statuts revoked/active corrects');

-- T78 : la liste n'expose JAMAIS le hash ni le jeton
select ok(
  pg_get_function_result(
    'public.admin_list_profile_share_links(uuid)'::regprocedure)
    !~ 'token_hash'
  and pg_get_function_result(
    'public.admin_list_profile_share_links(uuid)'::regprocedure)
    !~ '(^|, )token ',
  'liste admin : ni token_hash ni jeton dans le résultat');


-- ###########################################################################
-- SECTION 6 — ISOLATION FONCTIONNELLE anon / authenticated (T79..T84)
-- ###########################################################################

-- T79 : lecture de la table refusée sous anon
set local role anon;
select public._psl_cap('select count(*) from public.profile_share_links');
reset role;
select is(current_setting('test.state', true), '42501',
  'anon : lecture de la table refusée (42501)');

-- T80 : lecture de la table refusée sous authenticated (même son propre profil)
set local role authenticated;
select public._psl_as('00000000-0000-0000-0000-0000000000a1');
select public._psl_cap('select count(*) from public.profile_share_links');
reset role;
select is(current_setting('test.state', true), '42501',
  'authenticated : lecture de la table refusée (42501)');

-- T81 : création refusée sous anon
set local role anon;
select public._psl_cap(
  'select * from public.create_profile_share_link('
  || '''00000000-0000-0000-0000-0000000000a1'', '
  || '''00000000-0000-0000-0000-00000000ad01'')');
reset role;
select is(current_setting('test.state', true), '42501',
  'anon : create refusé (42501)');

-- T82 : création refusée sous authenticated (un membre ne crée JAMAIS de lien)
set local role authenticated;
select public._psl_as('00000000-0000-0000-0000-0000000000a1');
select public._psl_cap(
  'select * from public.create_profile_share_link('
  || '''00000000-0000-0000-0000-0000000000a1'', '
  || '''00000000-0000-0000-0000-0000000000a1'')');
reset role;
select is(current_setting('test.state', true), '42501',
  'authenticated : create refusé (42501)');

-- T83 : résolution refusée sous authenticated (réservée au serveur)
set local role authenticated;
select public._psl_as('00000000-0000-0000-0000-0000000000a1');
select public._psl_cap(
  'select * from public.resolve_profile_share_link('
  || quote_literal(current_setting('test.token3', true)) || ')');
reset role;
select is(current_setting('test.state', true), '42501',
  'authenticated : resolve refusé (42501)');

-- T84 : révocation refusée sous authenticated
set local role authenticated;
select public._psl_as('00000000-0000-0000-0000-0000000000a1');
select public._psl_cap(
  'select public.revoke_profile_share_link('
  || quote_literal(current_setting('test.link3', true)) || '::uuid, '
  || '''00000000-0000-0000-0000-0000000000a1'')');
reset role;
select is(current_setting('test.state', true), '42501',
  'authenticated : revoke refusé (42501)');


-- ===========================================================================
select * from finish();
rollback;
