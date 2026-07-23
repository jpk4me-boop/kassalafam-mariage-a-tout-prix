-- =============================================================================
-- KASSALAFAM — Hotfix — Restauration de la garde ACCOUNT_SUSPENDED
-- =============================================================================
-- La migration Premium 20260719083001_premium_source_of_truth.sql a recréé
-- guard_profiles_admin_fields() pour protéger is_premium mais a perdu le bloc
-- ACCOUNT_SUSPENDED livré par 20260719003000_enforce_suspended_account_restrictions.sql.
-- Cette migration restaure ce bloc en repartant de la définition Premium
-- courante, sans toucher au trigger, aux policies, aux RPC ni aux données.
--
-- Ordre des contrôles dans la branche UPDATE (contrat de sécurité) :
--   1. is_premium reste en lecture seule, y compris pour postgres/service_role
--      (seul l'UPDATE imbriqué du trigger Premium, pg_trigger_depth() > 1,
--      est accepté) ;
--   2. bypass des opérations privilégiées ordinaires (auth.uid() NULL) ;
--   3. une session membre suspendue ne peut modifier aucune colonne de son
--      profil (ACCOUNT_SUSPENDED) ;
--   4. verrouillage inchangé des champs administratifs.
create or replace function public.guard_profiles_admin_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.is_premium is distinct from false then
      raise exception 'PROFILE_ADMIN_FIELDS_READ_ONLY'
        using errcode = '42501';
    end if;

    if auth.uid() is null then
      return new;
    end if;

    if new.verification_status
         is distinct from 'pending'::public.profile_verification_status
       or new.verification_reviewed_at is not null
       or new.verification_reviewed_by is not null
       or new.verification_rejection_reason is not null
       or new.account_status is distinct from 'active'::public.account_status
       or new.suspended_at is not null
       or new.suspended_by is not null
       or new.suspension_reason is not null
    then
      raise exception 'PROFILE_ADMIN_FIELDS_READ_ONLY'
        using errcode = '42501';
    end if;

    return new;
  end if;

  if new.is_premium is distinct from old.is_premium
     and pg_trigger_depth() <= 1
  then
    raise exception 'PROFILE_ADMIN_FIELDS_READ_ONLY'
      using errcode = '42501';
  end if;

  if auth.uid() is null then
    return new;
  end if;

  -- Une session membre suspendue ne peut modifier aucune colonne de son profil.
  if old.account_status = 'suspended'::public.account_status then
    raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501';
  end if;

  if new.verification_status
       is distinct from old.verification_status
     or new.verification_reviewed_at
       is distinct from old.verification_reviewed_at
     or new.verification_reviewed_by
       is distinct from old.verification_reviewed_by
     or new.verification_rejection_reason
       is distinct from old.verification_rejection_reason
     or new.account_status
       is distinct from old.account_status
     or new.suspended_at
       is distinct from old.suspended_at
     or new.suspended_by
       is distinct from old.suspended_by
     or new.suspension_reason
       is distinct from old.suspension_reason
     or new.is_premium
       is distinct from old.is_premium
  then
    raise exception 'PROFILE_ADMIN_FIELDS_READ_ONLY'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_profiles_admin_fields()
  from public, anon, authenticated, service_role;
