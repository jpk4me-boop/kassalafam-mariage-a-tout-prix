-- =============================================================================
-- KASSALAFAM — MARIAGE À TOUT PRIX
-- Migration : champs matrimoniaux étendus du profil (wizard d'onboarding L3-*)
-- Date      : 2026-07-07
--
-- Objet     : enrichir public.profiles des informations saisies dans le wizard
--             de création de profil, TOUTES facultatives (nullable) :
--               - profession               : métier (texte libre)
--               - education_level          : niveau d'études (valeurs contrôlées)
--               - height_cm                : taille en centimètres
--               - origin_country           : pays d'origine
--               - region                   : région / zone de résidence
--               - marriage_goals           : objectifs de mariage (2 à 3 choix)
--               - desired_partner_traits   : qualités recherchées (2 à 3 choix)
--               - polygamy_preference      : positionnement polygamie
--               - children_intent          : projet d'enfants
--
--             `country` / `city` existants restent le pays / la ville de
--             RÉSIDENCE (aucun residence_country n'est ajouté). `partner_expectations`
--             reste le texte libre complémentaire. `intention` reste 'mariage_serieux'.
--
-- Choix     : - Colonnes `text` (+ `smallint` pour la taille, `text[]` pour les
--   d'impl.     deux listes) contraintes par des CHECK — AUCUN nouveau type enum
--               PostgreSQL (souplesse d'évolution des valeurs sans ALTER TYPE).
--             - L'unicité et l'appartenance au domaine d'une liste ne sont pas
--               exprimables par un CHECK inline (sous-requête interdite) : on
--               s'appuie sur une petite fonction IMMUTABLE de validation
--               `public.profiles_valid_choice_set(text[], text[], int, int)`.
--               Ce n'est PAS un enum : les valeurs autorisées restent passées en
--               argument par chaque contrainte, donc lisibles et modifiables.
--
-- Sécurité  : - Migration ADDITIVE et NON destructive : uniquement des ADD COLUMN
--               IF NOT EXISTS (nullable, sans default) + des CHECK autorisant NULL.
--             - AUCUN profil existant cassé : toutes les nouvelles colonnes sont
--               NULL pour les profils historiques → chaque CHECK est satisfait par
--               sa branche « ... is null ».
--             - Aucune donnée modifiée. Aucune colonne supprimée/renommée.
--             - Aucune policy RLS modifiée : profiles_select/insert/update/delete_own
--               couvrent déjà, au niveau ligne, ces nouvelles colonnes (le membre
--               écrit sa propre ligne). Aucun GRANT nouveau : le GRANT SELECT/
--               INSERT/UPDATE à `authenticated` posé par la migration acquisition
--               s'applique à la table entière.
--             - Aucun trigger de garde modifié : les gardes existantes
--               (acquisition_*, verification_*, account_*) ne s'intéressent qu'à
--               LEURS colonnes ; ces nouveaux champs sont librement éditables par
--               le membre, comme first_name / bio / city.
--             - Idempotente : ADD COLUMN IF NOT EXISTS ; CREATE OR REPLACE FUNCTION ;
--               contraintes protégées par DROP CONSTRAINT IF EXISTS puis ADD.
--
-- ⚠️ À NE PAS appliquer automatiquement : attendre le GO explicite.
--    Ne PAS exécuter `supabase db push` ni toucher la base Production.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Colonnes (toutes nullable, additives, SANS default) ---------------------
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists profession             text,
  add column if not exists education_level        text,
  add column if not exists height_cm              smallint,
  add column if not exists origin_country         text,
  add column if not exists region                 text,
  add column if not exists marriage_goals         text[],
  add column if not exists desired_partner_traits text[],
  add column if not exists polygamy_preference    text,
  add column if not exists children_intent        text;

-- ---------------------------------------------------------------------------
-- 2. Fonction IMMUTABLE de validation d'une liste de choix -------------------
--    Renvoie true SSI `p_vals` :
--      - est non NULL ;
--      - a une cardinalité comprise entre p_min et p_max (inclus) ;
--      - ne contient aucun élément NULL ;
--      - est un sous-ensemble de `p_allowed` (toutes ses valeurs sont permises) ;
--      - ne contient aucun doublon (unicité).
--    coalesce(..., false) garantit un retour FALSE (jamais NULL) : indispensable
--    car un CHECK considère NULL comme satisfait — on ne veut pas de faux positif.
--    Pure (aucun accès table) → IMMUTABLE ; search_path verrouillé + identifiants
--    qualifiés (convention du dépôt). Le domaine autorisé reste fourni par chaque
--    contrainte : ce n'est donc pas un enum figé.
-- ---------------------------------------------------------------------------
create or replace function public.profiles_valid_choice_set(
  p_vals    text[],
  p_allowed text[],
  p_min     integer,
  p_max     integer
) returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce((
        p_vals is not null
    and pg_catalog.cardinality(p_vals) between p_min and p_max
    and not exists (
          select 1 from pg_catalog.unnest(p_vals) as e where e is null
        )
    and p_vals <@ p_allowed
    and pg_catalog.cardinality(p_vals)
        = (select pg_catalog.count(distinct e) from pg_catalog.unnest(p_vals) as e)
  ), false);
$$;

-- ---------------------------------------------------------------------------
-- 3. Contraintes de domaine (NULL toujours permis) ---------------------------
--    Pattern DROP IF EXISTS + ADD → pleinement idempotent. Les colonnes étant
--    neuves et NULL pour tous les profils, la (re)validation est triviale.
-- ---------------------------------------------------------------------------

-- 3.1 profession : si renseignée, non vide après trim, 2 à 100 caractères.
alter table public.profiles drop constraint if exists profiles_profession_chk;
alter table public.profiles add constraint profiles_profession_chk
  check (
    profession is null
    or char_length(btrim(profession)) between 2 and 100
  );

-- 3.2 education_level : valeurs contrôlées.
alter table public.profiles drop constraint if exists profiles_education_level_chk;
alter table public.profiles add constraint profiles_education_level_chk
  check (
    education_level is null
    or education_level in (
      'secondary', 'high_school', 'bachelor', 'master',
      'doctorate', 'vocational', 'other'
    )
  );

-- 3.3 height_cm : plage physiologique plausible.
alter table public.profiles drop constraint if exists profiles_height_cm_chk;
alter table public.profiles add constraint profiles_height_cm_chk
  check (
    height_cm is null
    or height_cm between 120 and 230
  );

-- 3.4 origin_country : si renseigné, non vide après trim, ≤ 100 caractères.
alter table public.profiles drop constraint if exists profiles_origin_country_chk;
alter table public.profiles add constraint profiles_origin_country_chk
  check (
    origin_country is null
    or (btrim(origin_country) <> '' and char_length(btrim(origin_country)) <= 100)
  );

-- 3.5 region : si renseignée, non vide après trim, ≤ 120 caractères.
alter table public.profiles drop constraint if exists profiles_region_chk;
alter table public.profiles add constraint profiles_region_chk
  check (
    region is null
    or (btrim(region) <> '' and char_length(btrim(region)) <= 120)
  );

-- 3.6 marriage_goals : 2 à 3 valeurs UNIQUES parmi le domaine autorisé.
alter table public.profiles drop constraint if exists profiles_marriage_goals_chk;
alter table public.profiles add constraint profiles_marriage_goals_chk
  check (
    marriage_goals is null
    or public.profiles_valid_choice_set(
         marriage_goals,
         array[
           'build_family', 'stable_home', 'life_partner',
           'grow_together', 'mutual_support', 'serenity'
         ]::text[],
         2, 3
       )
  );

-- 3.7 desired_partner_traits : 2 à 3 valeurs UNIQUES parmi le domaine autorisé.
alter table public.profiles drop constraint if exists profiles_desired_partner_traits_chk;
alter table public.profiles add constraint profiles_desired_partner_traits_chk
  check (
    desired_partner_traits is null
    or public.profiles_valid_choice_set(
         desired_partner_traits,
         array[
           'kindness', 'sincerity', 'ambition', 'family_oriented',
           'cultured', 'sense_of_humor', 'calm_mature'
         ]::text[],
         2, 3
       )
  );

-- 3.8 polygamy_preference : positionnement contrôlé.
alter table public.profiles drop constraint if exists profiles_polygamy_preference_chk;
alter table public.profiles add constraint profiles_polygamy_preference_chk
  check (
    polygamy_preference is null
    or polygamy_preference in ('yes', 'no', 'discuss')
  );

-- 3.9 children_intent : projet d'enfants contrôlé.
alter table public.profiles drop constraint if exists profiles_children_intent_chk;
alter table public.profiles add constraint profiles_children_intent_chk
  check (
    children_intent is null
    or children_intent in (
      'wants_children', 'does_not_want_children', 'has_children', 'discuss'
    )
  );
