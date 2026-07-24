-- =============================================================================
-- H2 — Durcissement des default privileges des futurs objets relationnels
-- =============================================================================
--
-- Contexte :
--   Supabase accordait historiquement, via les default privileges du rôle
--   `postgres`, tous les privilèges de table et de séquence à `anon` et
--   `authenticated` pour les nouveaux objets créés dans le schéma `public`.
--   H1 a réduit les droits de cinq tables sensibles déjà existantes ; H2 évite
--   que ce risque soit réintroduit automatiquement lors d'une future migration.
--
-- Périmètre volontairement limité :
--   - futurs TABLES et SEQUENCES créés par le propriétaire applicatif `postgres`
--     dans le schéma `public` ;
--   - aucun objet existant modifié ;
--   - aucun default privilege de FUNCTION modifié ;
--   - aucun schéma interne Supabase (`auth`, `storage`, `realtime`, etc.) touché ;
--   - aucun privilège du rôle `supabase_admin` modifié : l'audit Production
--     confirme qu'aucun objet applicatif de `public` n'est détenu par ce rôle et
--     que `postgres` ne peut pas modifier ses default privileges sans élévation.
--
-- État cible pour les futurs objets relationnels de `public` :
--   PUBLIC          : aucun privilège direct
--   anon            : aucun privilège direct
--   authenticated   : aucun privilège direct par défaut
--   service_role    : tous les privilèges
--   postgres        : propriétaire, privilèges implicites complets
--
-- Toute future table destinée à l'API membre devra donc déclarer explicitement
-- ses GRANT minimaux dans sa propre migration, après activation de RLS et création
-- des policies. Ce comportement est intentionnel et fail-closed.
--
-- Idempotence : ALTER DEFAULT PRIVILEGES + REVOKE/GRANT sont rejouables.
-- =============================================================================

-- Futures tables créées par les migrations applicatives dans public.
alter default privileges for role postgres in schema public
  revoke all privileges on tables from public, anon, authenticated;

alter default privileges for role postgres in schema public
  grant all privileges on tables to service_role;

-- Futures séquences explicites ou générées par SERIAL/IDENTITY.
alter default privileges for role postgres in schema public
  revoke all privileges on sequences from public, anon, authenticated;

alter default privileges for role postgres in schema public
  grant all privileges on sequences to service_role;
