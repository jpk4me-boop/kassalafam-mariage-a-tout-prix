-- =============================================================================
-- KASSALAFAM — MARIAGE À TOUT PRIX
-- Migration : champs d'onboarding matrimonial (L3-B)
-- Date      : 2026-06-29
--
-- Objet     : enrichir le profil membre avec deux champs essentiels pour un
--             onboarding matrimonial sérieux :
--               - marital_status        : situation matrimoniale
--               - partner_expectations  : attentes envers le futur conjoint
--
-- Sécurité  : - Migration ADDITIVE et NON destructive.
--             - Les deux colonnes sont NULLABLE → aucun profil existant cassé.
--             - Aucune donnée modifiée. Aucune colonne supprimée/renommée.
--             - Aucune policy RLS modifiée (les policies *_own existantes
--               couvrent déjà ces nouvelles colonnes).
--             - Aucun trigger modifié. Le trigger de garde de vérification
--               reste valable : ces colonnes sont librement éditables par le
--               membre, contrairement aux champs verification_*.
--             - Idempotente : ADD COLUMN IF NOT EXISTS + contraintes protégées
--               par des blocs DO contrôlant pg_constraint.
--
-- ⚠️ À NE PAS appliquer automatiquement : attendre le GO explicite.
-- =============================================================================

-- 1. Colonnes (nullable, additives) ------------------------------------------
alter table public.profiles
  add column if not exists marital_status text,
  add column if not exists partner_expectations text;

-- 2. Contrainte de domaine sur marital_status --------------------------------
--    Valeurs autorisées : celibataire / divorce / veuf / separe.
--    NULL reste permis (profil en cours de complétion).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_marital_status_chk'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_marital_status_chk
      check (
        marital_status is null
        or marital_status in ('celibataire', 'divorce', 'veuf', 'separe')
      );
  end if;
end;
$$;

-- 3. Contrainte de longueur sur partner_expectations -------------------------
--    Cohérente avec profiles_bio_len (≤ 2000 caractères). NULL permis.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_partner_expectations_len'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_partner_expectations_len
      check (
        partner_expectations is null
        or char_length(partner_expectations) <= 2000
      );
  end if;
end;
$$;
