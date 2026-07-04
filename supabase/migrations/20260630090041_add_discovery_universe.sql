-- =============================================================================
-- KASSALAFAM — MARIAGE À TOUT PRIX
-- Migration : univers de découverte (L3C-C)
-- Date      : 2026-06-30
--
-- Objet     : ajouter au profil membre une PRÉFÉRENCE VOLONTAIRE d'espace de
--             découverte (et non une religion déclarée publiquement) :
--               - discovery_universe : univers de découverte choisi par le membre
--
-- Valeurs internes autorisées :
--               - christian_marriage  (Rencontre / Mariage chrétien)
--               - islamic_marriage    (Rencontre / Mariage islamique)
--               - open_marriage       (Rencontre / Mariage pour tous)
--
-- Sécurité  : - Migration ADDITIVE et NON destructive.
--             - Colonne NULLABLE → aucun profil existant cassé, aucun choix
--               imposé ni déduit automatiquement.
--             - Aucune donnée modifiée. Aucune colonne supprimée/renommée.
--             - Aucune policy RLS modifiée : les policies *_own existantes
--               couvrent déjà cette nouvelle colonne ; le membre écrit
--               uniquement sa propre ligne (auth.uid() = id).
--             - Aucun trigger modifié. Champ librement éditable par le membre
--               (ce n'est pas un champ verification_*).
--             - Idempotente : ADD COLUMN IF NOT EXISTS + contrainte protégée
--               par un bloc DO contrôlant pg_constraint.
--
-- Confidentialité : cette préférence n'est PAS exposée aux autres membres dans
--             cette phase. Aucune lecture croisée de profils n'est introduite.
--
-- ⚠️ À NE PAS appliquer automatiquement : attendre le GO explicite.
-- =============================================================================

-- 1. Colonne (nullable, additive) --------------------------------------------
alter table public.profiles
  add column if not exists discovery_universe text;

-- 2. Contrainte de domaine sur discovery_universe ----------------------------
--    NULL reste permis (aucun univers choisi).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_discovery_universe_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_discovery_universe_check
      check (
        discovery_universe is null
        or discovery_universe in (
          'christian_marriage',
          'islamic_marriage',
          'open_marriage'
        )
      );
  end if;
end;
$$;
