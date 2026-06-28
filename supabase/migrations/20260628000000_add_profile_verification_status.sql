-- =============================================================================
-- KASSALAFAM — MARIAGE À TOUT PRIX
-- Migration : statut de vérification admin des profils (L3-A)
-- Date      : 2026-06-28
--
-- Objet     : permettre à un back-office admin de valider / refuser un profil,
--             SANS qu'un membre puisse modifier lui-même son propre statut.
--
-- Sécurité  : - RLS existante conservée (un membre ne voit/modifie que sa ligne).
--             - Le statut de vérification est verrouillé en écriture pour tout
--               utilisateur authentifié (front) via un trigger BEFORE UPDATE.
--             - Seul un appel sans session (service_role, côté serveur sécurisé)
--               peut écrire ces champs. AUCUN service_role côté front.
--             - À ne PAS appliquer automatiquement : attendre le GO explicite.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Type énuméré du statut de vérification
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'profile_verification_status'
  ) then
    create type public.profile_verification_status
      as enum ('pending', 'approved', 'rejected');
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Colonnes ajoutées à public.profiles
--    - verification_status        : statut courant (défaut 'pending')
--    - verification_reviewed_at   : horodatage de la décision admin
--    - verification_reviewed_by   : admin auteur de la décision (auth.users)
--    - verification_rejection_reason : motif en cas de refus
--    Toutes idempotentes (add column if not exists).
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists verification_status
    public.profile_verification_status not null default 'pending';

alter table public.profiles
  add column if not exists verification_reviewed_at timestamptz;

alter table public.profiles
  add column if not exists verification_reviewed_by uuid
    references auth.users (id) on delete set null;

alter table public.profiles
  add column if not exists verification_rejection_reason text;

alter table public.profiles
  drop constraint if exists profiles_rejection_reason_len;
alter table public.profiles
  add constraint profiles_rejection_reason_len
    check (
      verification_rejection_reason is null
      or char_length(verification_rejection_reason) <= 500
    );

-- Index partiel utile au back-office : lister rapidement les profils à traiter.
create index if not exists profiles_verification_pending_idx
  on public.profiles (verification_status)
  where verification_status = 'pending';

-- -----------------------------------------------------------------------------
-- 3. Verrou d'écriture : un membre ne peut JAMAIS changer son statut lui-même
--
--    La policy RLS "profiles_update_own" autorise un membre à mettre à jour sa
--    propre ligne (nécessaire pour prénom, bio, etc.). Sans garde-fou, il
--    pourrait donc se passer en 'approved'. Ce trigger bloque toute tentative
--    de modification des champs de vérification dès qu'une session utilisateur
--    est présente (auth.uid() non nul).
--
--    Un appel service_role (back-office serveur) a auth.uid() = NULL : il passe.
--    Les migrations (rôle postgres) ont aussi auth.uid() = NULL : elles passent.
-- -----------------------------------------------------------------------------
create or replace function public.guard_profile_verification()
returns trigger
language plpgsql
as $$
begin
  -- auth.uid() est NULL hors session utilisateur (service_role / postgres).
  if auth.uid() is not null then
    if new.verification_status        is distinct from old.verification_status
       or new.verification_reviewed_at  is distinct from old.verification_reviewed_at
       or new.verification_reviewed_by  is distinct from old.verification_reviewed_by
       or new.verification_rejection_reason
            is distinct from old.verification_rejection_reason
    then
      raise exception
        'verification fields are read-only for members (admin review only)'
        using errcode = '42501'; -- insufficient_privilege
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_guard_verification on public.profiles;
create trigger trg_profiles_guard_verification
  before update on public.profiles
  for each row execute function public.guard_profile_verification();

-- =============================================================================
-- Notes :
--  * INSERT non impacté : un nouveau profil prend le défaut 'pending'.
--  * Les upsert front (ON CONFLICT ... UPDATE) ne touchent pas ces colonnes :
--    OLD = NEW sur les champs de vérification → aucune exception levée.
--  * Le trigger set_updated_at existant reste indépendant et inchangé.
-- =============================================================================
