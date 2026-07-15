-- =============================================================================
-- KASSALAFAM — MARIAGE À TOUT PRIX
-- Migration : C1a — verrouiller is_premium contre l'auto-promotion membre
-- Date      : 2026-07-15
--
-- Objet     : la colonne profiles.is_premium (boolean not null default false,
--             schéma cœur 20260627090018) était modifiable par le membre
--             lui-même : les policies RLS profiles_insert_own /
--             profiles_update_own couvrent TOUTES les colonnes de sa propre
--             ligne, et la garde guard_profiles_admin_fields (20260704010000)
--             ne surveillait pas is_premium. Un membre pouvait donc s'attribuer
--             Premium par un simple UPDATE/INSERT/upsert direct (PostgREST).
--
-- Correctif : is_premium rejoint les CHAMPS ADMINISTRATIFS protégés par la
--             garde unique guard_profiles_admin_fields (BEFORE INSERT OR
--             UPDATE) :
--               - INSERT authentifié : accepté uniquement avec la valeur par
--                 défaut false (explicite ou omise) ; true est refusé ;
--               - UPDATE authentifié : refusé dès que NEW.is_premium IS
--                 DISTINCT FROM OLD.is_premium (false→true ET true→false) ;
--               - upsert (INSERT … ON CONFLICT DO UPDATE) : couvert par les
--                 deux branches ci-dessus (le trigger BEFORE se déclenche sur
--                 chacune) ;
--               - service_role / postgres (auth.uid() IS NULL) : bypass
--                 EXISTANT conservé — les futurs flux serveur d'abonnement
--                 pourront écrire cette colonne.
--             Erreur stable inchangée : PROFILE_ADMIN_FIELDS_READ_ONLY,
--             errcode 42501 (même contrat que les autres champs admin).
--
-- Sécurité  : - CREATE OR REPLACE de la fonction de garde UNIQUEMENT : le
--               trigger trg_profiles_guard_admin_fields existant continue de
--               pointer dessus, AUCUN trigger recréé ;
--             - AUCUNE policy RLS modifiée, AUCUN privilège de table modifié,
--               AUCUN autre champ métier touché ;
--             - AUCUNE donnée modifiée (DDL pur, pas de DML) ;
--             - search_path verrouillé ('') et références qualifiées,
--               convention du dépôt conservée.
--
-- ⚠️ À NE PAS appliquer automatiquement : attendre le GO explicite.
--    Ne PAS exécuter `supabase db push` ni toucher la base Production.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Garde unique des champs administratifs — is_premium ajouté.
--    Corps repris à l'identique de 20260704010000, seules les deux conditions
--    is_premium sont ajoutées (INSERT et UPDATE).
-- ---------------------------------------------------------------------------
create or replace function public.guard_profiles_admin_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Hors session utilisateur (service_role / postgres) : rien à garder.
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.verification_status
         is distinct from 'pending'::public.profile_verification_status
       or new.verification_reviewed_at is not null
       or new.verification_reviewed_by is not null
       or new.verification_rejection_reason is not null
       or new.account_status is distinct from 'active'::public.account_status
       or new.suspended_at is not null
       or new.suspended_by is not null
       or new.suspension_reason is not null
       -- C1a : un membre ne crée sa ligne qu'avec la valeur neutre false
       -- (couvre aussi un NULL explicite, rejeté AVANT la contrainte NOT NULL).
       or new.is_premium is distinct from false
    then
      raise exception 'PROFILE_ADMIN_FIELDS_READ_ONLY' using errcode = '42501';
    end if;
    return new;
  end if;

  -- tg_op = 'UPDATE'
  if new.verification_status         is distinct from old.verification_status
     or new.verification_reviewed_at is distinct from old.verification_reviewed_at
     or new.verification_reviewed_by is distinct from old.verification_reviewed_by
     or new.verification_rejection_reason
          is distinct from old.verification_rejection_reason
     or new.account_status    is distinct from old.account_status
     or new.suspended_at      is distinct from old.suspended_at
     or new.suspended_by      is distinct from old.suspended_by
     or new.suspension_reason is distinct from old.suspension_reason
     -- C1a : is_premium est immuable pour le membre, dans LES DEUX SENS
     -- (false→true : auto-promotion ; true→false : altération d'un état posé
     -- par un flux serveur). Seul service_role (bypass ci-dessus) écrit ici.
     or new.is_premium is distinct from old.is_premium
  then
    raise exception 'PROFILE_ADMIN_FIELDS_READ_ONLY' using errcode = '42501';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Ré-affirmation des révocations (CREATE OR REPLACE conserve les privilèges
--    existants ; on les fige explicitement par défense en profondeur — la
--    fonction de garde n'est jamais une API métier, le trigger n'exige pas
--    EXECUTE du rôle déclencheur).
-- ---------------------------------------------------------------------------
revoke all on function public.guard_profiles_admin_fields() from public;
revoke all on function public.guard_profiles_admin_fields() from anon;
revoke all on function public.guard_profiles_admin_fields() from authenticated;
