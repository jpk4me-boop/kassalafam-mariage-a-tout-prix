-- =============================================================================
-- H1 — Durcissement des privilèges API directs des tables sensibles
-- =============================================================================
-- Contexte : les grants historiques Supabase (default privileges) accordent
-- TOUS les privilèges de table à `anon` et `authenticated` sur les tables du
-- schéma public. RLS protège les lignes, mais la réduction explicite des
-- grants ajoute la défense en profondeur : un rôle sans privilège de table ne
-- peut même pas tenter l'opération.
--
-- Matrice cible (fondée sur l'audit applicatif du code au commit 3381d94) :
--
--   profiles             : authenticated = SELECT, INSERT, UPDATE
--                          (onboarding + upsert du profil propriétaire ;
--                           DELETE jamais utilisé — déjà révoqué en 20260704010000)
--   photos               : authenticated = SELECT, INSERT, UPDATE, DELETE
--                          (gestion des photos du propriétaire, y compris
--                           suppression réelle dans profile-photos.tsx)
--   matches              : authenticated = SELECT seul
--                          (lecture des relations dans discover-feed ; toutes
--                           les écritures passent par express_interest /
--                           respond_to_interest — SECURITY DEFINER)
--   messages             : authenticated = AUCUN privilège direct
--                          (table RPC-only : send_message,
--                           get_conversation_messages, mark_conversation_read,
--                           can_message — toutes SECURITY DEFINER ; le Realtime
--                           de la messagerie est un canal broadcast pur, sans
--                           réplication postgres_changes de la table)
--   member_notifications : authenticated = SELECT seul
--                          (panneau membre ; l'INSERT est réservé au
--                           service_role via les actions admin)
--
--   PUBLIC et anon       : AUCUN privilège direct sur les cinq tables.
--                          La future vitrine publique passera par des
--                          projections/routes serveur dédiées (service_role),
--                          jamais par un SELECT anon direct.
--
--   service_role, postgres (owner) : intacts — nécessaires au back-office,
--   aux pages admin et aux RPC SECURITY DEFINER.
--
-- Garanties :
--   - RLS reste ACTIVE sur les cinq tables ; aucune policy n'est modifiée.
--   - Aucun trigger, aucune fonction, aucune colonne, aucun index modifiés.
--   - Aucune donnée modifiée (aucun DML).
--   - Aucun default privilege modifié (risque documenté séparément).
--   - Aucun accès public créé pour la future vitrine.
--   - Idempotent : REVOKE/GRANT sont rejouables sans erreur.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) PUBLIC et anon : révocation systématique sur les cinq tables
-- -----------------------------------------------------------------------------

revoke all privileges on table public.profiles from public, anon;
revoke all privileges on table public.photos from public, anon;
revoke all privileges on table public.matches from public, anon;
revoke all privileges on table public.messages from public, anon;
revoke all privileges on table public.member_notifications from public, anon;

-- -----------------------------------------------------------------------------
-- 2) authenticated : remise à zéro puis ré-attribution du minimum prouvé
--    (pattern déterministe : l'état final ne dépend pas de l'état initial,
--    et couvre MAINTAIN — présent en PostgreSQL 17 — sans le nommer)
-- -----------------------------------------------------------------------------

-- profiles : parcours onboarding (INSERT via upsert), édition du profil
-- (UPDATE via upsert + update ciblés), lectures owner-only omniprésentes.
revoke all privileges on table public.profiles from authenticated;
grant select, insert, update on table public.profiles to authenticated;

-- photos : gestion complète des photos du propriétaire (galerie, principale,
-- suppression réelle) — RLS owner-only + garde suspension sur chaque policy.
revoke all privileges on table public.photos from authenticated;
grant select, insert, update, delete on table public.photos to authenticated;

-- matches : lecture directe des relations existantes (discover-feed) ;
-- écritures exclusivement via RPC SECURITY DEFINER (aucune policy INSERT ni
-- UPDATE n'existe : le grant d'écriture était donc inerte mais superflu).
revoke all privileges on table public.matches from authenticated;
grant select on table public.matches to authenticated;

-- messages : table RPC-only. La policy messages_select_accepted est conservée
-- (inchangée) mais aucun privilège direct n'est nécessaire au code applicatif.
revoke all privileges on table public.messages from authenticated;

-- member_notifications : lecture seule côté membre (source de vérité des
-- notifications internes) ; création réservée au service_role.
revoke all privileges on table public.member_notifications from authenticated;
grant select on table public.member_notifications to authenticated;
