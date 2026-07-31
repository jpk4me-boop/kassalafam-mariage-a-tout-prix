-- =============================================================================
-- KASSALAFAM — MARIAGE À TOUT PRIX
-- Peuplement initial du catalogue Premium (3 offres)
-- Date : 2026-07-31
--
-- ⚠️  À NE PAS appliquer automatiquement à Supabase Production.
--     Attendre un GO explicite séparé.
--
-- Contexte : le catalogue premium_plans (migration 20260719082823) est vide en
-- Production. Cette migration additive insère les trois offres de lancement.
--
-- Idempotence : clé naturelle UNIQUE (code, version)
-- (contrainte premium_plans_code_version_unique) → ON CONFLICT DO NOTHING.
--
-- Conformité aux CHECK du schéma (20260719082823_premium_catalog.sql:56-71) :
--   - code minuscule ^[a-z0-9][a-z0-9_]{1,49}$ ;
--   - version > 0 ; display_name 2-120 ; duration_days 1-3660 ;
--   - price_xaf > 0 ; currency = 'XAF' (seule devise supportée) ;
--   - available_from NOT NULL (posée à now()), available_until NULL = sans fin.
--
-- Note : le schéma ne prévoit AUCUNE colonne « mise en avant » ; la mise en
-- avant de l'offre 3 mois demandée côté produit devra être portée par l'UI
-- (aucune colonne n'est ajoutée ici pour rester strictement additif).
--
-- created_by est laissé NULL : insertion de migration, sans acteur humain.
-- =============================================================================

insert into public.premium_plans (
  code, version, display_name, duration_days, price_xaf, currency,
  available_from, available_until, created_by
) values
  ('premium_1_mois', 1, 'Premium 1 mois',  30,  2500, 'XAF', now(), null, null),
  ('premium_3_mois', 1, 'Premium 3 mois',  90,  6000, 'XAF', now(), null, null),
  ('premium_6_mois', 1, 'Premium 6 mois', 180, 10000, 'XAF', now(), null, null)
on conflict (code, version) do nothing;
