-- =============================================================================
-- KASSALAFAM — MARIAGE À TOUT PRIX
-- L3F-C3A — Backend transactionnel de MODÉRATION DES COMPTES (suspension).
--           Additif, backend only. Aucune UI, aucun effet d'enforcement ici
--           (découverte / intérêts / messagerie / photos NON touchés — C3B–C3D).
-- Date : 2026-07-04
--
-- CONTENU
--   A. Enum public.account_status ('active' | 'suspended') — INDÉPENDANT de
--      profile_verification_status ('paused' n'est PAS réutilisé).
--   B. État courant de sanction sur public.profiles (+ contraintes de cohérence).
--   C. Garde UNIQUE des champs administratifs (verification_* + account_*),
--      couvrant BEFORE INSERT ET BEFORE UPDATE. Remplace l'ancienne garde
--      trg_profiles_guard_verification (UPDATE seul).
--   D. Fermeture du contournement suppression/réinsertion : retrait du DELETE
--      membre (policy + privilèges anon/authenticated révoqués).
--   E. Journal APPEND-ONLY public.account_moderation_actions (distinct de
--      safety_report_actions) + immuabilité + privilèges service_role only.
--   F. RPC transactionnelle public.admin_set_account_status (service_role only).
--
-- PÉRIMÈTRE / NON-RÉGRESSION
--   N'ajoute AUCUN contrôle de suspension dans discover_candidates,
--   express_interest, respond_to_interest, send_message/can_send_message,
--   list_my_relationships, block/unblock, report_message, photos : ces effets
--   sont livrés en C3B–C3D. Aucune donnée applicative créée.
--
-- IDEMPOTENCE : do $$ if not exists (enum), add column if not exists,
--   drop constraint if exists / add constraint, create table if not exists,
--   create or replace function, drop trigger if exists / create trigger,
--   create index if not exists, drop policy if exists, revoke/grant idempotents.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- A. ENUM public.account_status — sanction de compte, distincte de la
--    vérification de profil. Deux concepts orthogonaux.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'account_status') then
    create type public.account_status as enum ('active', 'suspended');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- B. ÉTAT COURANT sur public.profiles
--    account_status par défaut 'active' (toutes les lignes existantes le
--    deviennent). suspended_by peut passer NULL si l'admin est supprimé
--    (FK ON DELETE SET NULL) : NON exigé par la contrainte permanente.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists account_status public.account_status not null default 'active';

alter table public.profiles
  add column if not exists suspended_at timestamptz;

alter table public.profiles
  add column if not exists suspended_by uuid references auth.users (id) on delete set null;

alter table public.profiles
  add column if not exists suspension_reason text;

-- Cohérence « profil actif » : aucune métadonnée de suspension.
alter table public.profiles
  drop constraint if exists profiles_account_active_meta;
alter table public.profiles
  add constraint profiles_account_active_meta check (
    account_status <> 'active'::public.account_status
    or (
      suspended_at is null
      and suspended_by is null
      and suspension_reason is null
    )
  );

-- Cohérence « profil suspendu » : date + raison obligatoires, raison 10..2000
-- après btrim. suspended_by volontairement NON exigé (FK peut devenir NULL).
alter table public.profiles
  drop constraint if exists profiles_account_suspended_meta;
alter table public.profiles
  add constraint profiles_account_suspended_meta check (
    account_status <> 'suspended'::public.account_status
    or (
      suspended_at is not null
      and suspension_reason is not null
      and char_length(btrim(suspension_reason)) between 10 and 2000
    )
  );

-- Index PARTIEL : ne cible que les comptes suspendus (minorité) ; n'indexe pas
-- la valeur majoritaire 'active'. Trié par date de suspension décroissante.
create index if not exists profiles_account_suspended_idx
  on public.profiles (suspended_at desc)
  where account_status = 'suspended'::public.account_status;

-- ---------------------------------------------------------------------------
-- C. GARDE UNIQUE des champs administratifs — BEFORE INSERT OR UPDATE.
--    Remplace l'ancienne garde (UPDATE seul) : on DROP le trigger et la
--    fonction existants pour éviter tout doublon, puis on installe une garde
--    unique couvrant AUSSI l'INSERT (fermeture du chemin de fabrication d'état).
--
--    auth.uid() IS NULL (service_role / postgres) => bypass complet.
--    À l'INSERT : un membre ne peut créer sa ligne qu'avec les valeurs
--      neutres (verification_status='pending', account_status='active', toutes
--      les métadonnées administratives NULL).
--    À l'UPDATE : un membre ne peut modifier aucun champ administratif.
--    Message d'erreur stable, sans donnée sensible.
-- ---------------------------------------------------------------------------
drop trigger if exists trg_profiles_guard_verification on public.profiles;
drop function if exists public.guard_profile_verification();

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
  then
    raise exception 'PROFILE_ADMIN_FIELDS_READ_ONLY' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_profiles_admin_fields() from public;
revoke all on function public.guard_profiles_admin_fields() from anon;
revoke all on function public.guard_profiles_admin_fields() from authenticated;

drop trigger if exists trg_profiles_guard_admin_fields on public.profiles;
create trigger trg_profiles_guard_admin_fields
  before insert or update on public.profiles
  for each row execute function public.guard_profiles_admin_fields();

-- ---------------------------------------------------------------------------
-- D. FERMER LE CONTOURNEMENT suppression/réinsertion.
--    Un membre ne doit plus pouvoir supprimer sa ligne profiles (puis la
--    recréer 'active'/'approved' pour effacer une sanction). On retire la
--    policy DELETE membre ET on révoque le privilège DELETE à anon/authenticated
--    (défense en profondeur). service_role conserve DELETE (flux admin).
--    Aucun flux de suppression de compte n'est créé ici.
-- ---------------------------------------------------------------------------
drop policy if exists "profiles_delete_own" on public.profiles;
revoke delete on table public.profiles from anon;
revoke delete on table public.profiles from authenticated;

-- ---------------------------------------------------------------------------
-- E. JOURNAL APPEND-ONLY public.account_moderation_actions
--    DISTINCT de safety_report_actions. Une ligne par transition de compte.
--
--    CONFIDENTIALITÉ : on NE stocke PAS l'email du membre sanctionné ; son UUID
--    (profile_id_snapshot) est la référence d'audit minimale. profile_id (FK)
--    peut passer NULL si le profil est supprimé côté admin ; profile_id_snapshot
--    conserve alors la trace. L'email de l'ACTEUR admin est capturé côté serveur
--    (comme L3F-C2A). report_id lie la sanction à un signalement d'origine.
-- ---------------------------------------------------------------------------
create table if not exists public.account_moderation_actions (
  id                    uuid primary key default gen_random_uuid(),
  profile_id            uuid references public.profiles (id) on delete set null,
  profile_id_snapshot   uuid not null,
  actor_id              uuid references auth.users (id) on delete set null,
  actor_email_snapshot  text,
  report_id             uuid references public.safety_reports (id) on delete set null,
  previous_status       public.account_status not null,
  new_status            public.account_status not null,
  reason                text not null,
  created_at            timestamptz not null default now(),
  constraint account_moderation_actions_status_distinct check (
    previous_status <> new_status
  ),
  constraint account_moderation_actions_transition_valid check (
    (previous_status = 'active'::public.account_status
       and new_status = 'suspended'::public.account_status)
    or (previous_status = 'suspended'::public.account_status
       and new_status = 'active'::public.account_status)
  ),
  -- Raison obligatoire, 10..2000 après normalisation btrim.
  constraint account_moderation_actions_reason_len check (
    char_length(btrim(reason)) between 10 and 2000
  )
);

-- Historique d'un compte (du plus récent au plus ancien).
create index if not exists account_moderation_actions_profile_idx
  on public.account_moderation_actions (profile_id_snapshot, created_at desc);

-- Sanctions rattachées à un signalement (partiel : seulement report_id non NULL).
create index if not exists account_moderation_actions_report_idx
  on public.account_moderation_actions (report_id, created_at desc)
  where report_id is not null;

-- ---------------------------------------------------------------------------
-- E.bis  RLS + PRIVILÈGES (append-only, service_role uniquement).
--    RLS activée, AUCUNE policy => aucun accès direct anon/authenticated.
--    Révocation totale puis SELECT + INSERT au seul service_role (jamais
--    UPDATE/DELETE : append-only, y compris pour lui). La RPC SECURITY DEFINER
--    insère en tant que propriétaire (l'INSERT ne déclenche pas l'anti-mutation).
-- ---------------------------------------------------------------------------
alter table public.account_moderation_actions enable row level security;

revoke all on table public.account_moderation_actions from public;
revoke all on table public.account_moderation_actions from anon;
revoke all on table public.account_moderation_actions from authenticated;
revoke all on table public.account_moderation_actions from service_role;
grant select, insert on table public.account_moderation_actions to service_role;

-- Immuabilité : append-only. Refuse tout DELETE et toute modification d'un fait
-- enregistré. AUTORISE UNIQUEMENT la mise à NULL des colonnes FK par un CASCADE
-- ON DELETE SET NULL (actor_id / profile_id / report_id) : sans cette exception,
-- supprimer un acteur admin, un profil (via profiles.id -> auth.users
-- ON DELETE CASCADE) ou un signalement rendrait les comptes à historique de
-- modération indésupprimables.
--
-- DISTINCTION cascade vs requête directe : un cascade FK s'exécute DEPUIS le
-- trigger d'intégrité référentielle, donc à pg_trigger_depth() > 1. Une requête
-- UPDATE directe (même service_role / propriétaire) est à pg_trigger_depth() = 1
-- et reste REFUSÉE. Conditions CUMULATIVES d'acceptation :
--   * TG_OP = 'UPDATE' (le DELETE est déjà refusé plus haut) ;
--   * pg_trigger_depth() > 1 (cascade, pas requête directe) ;
--   * toutes les colonnes métier IDENTIQUES (IS NOT DISTINCT FROM) ;
--   * chaque FK est soit inchangée, soit une transition non-NULL -> NULL
--     (jamais NULL -> valeur, jamais UUID_A -> UUID_B) ;
--   * au moins une FK passe réellement de non-NULL vers NULL.
-- Tout le reste lève l'erreur stable ACCOUNT_MODERATION_ACTIONS_APPEND_ONLY.
create or replace function public.account_moderation_actions_no_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'ACCOUNT_MODERATION_ACTIONS_APPEND_ONLY' using errcode = '42501';
  end if;

  if pg_trigger_depth() > 1
     and new.id                   is not distinct from old.id
     and new.profile_id_snapshot  is not distinct from old.profile_id_snapshot
     and new.actor_email_snapshot is not distinct from old.actor_email_snapshot
     and new.previous_status      is not distinct from old.previous_status
     and new.new_status           is not distinct from old.new_status
     and new.reason               is not distinct from old.reason
     and new.created_at           is not distinct from old.created_at
     -- Chaque FK : inchangée OU transition non-NULL -> NULL uniquement.
     and (
       new.actor_id is not distinct from old.actor_id
       or (old.actor_id is not null and new.actor_id is null)
     )
     and (
       new.profile_id is not distinct from old.profile_id
       or (old.profile_id is not null and new.profile_id is null)
     )
     and (
       new.report_id is not distinct from old.report_id
       or (old.report_id is not null and new.report_id is null)
     )
     -- Au moins une FK réellement mise à NULL (sinon rien à autoriser).
     and (
          (old.actor_id   is not null and new.actor_id   is null)
       or (old.profile_id is not null and new.profile_id is null)
       or (old.report_id  is not null and new.report_id  is null)
     )
  then
    return new;  -- cascade SET NULL légitime
  end if;

  raise exception 'ACCOUNT_MODERATION_ACTIONS_APPEND_ONLY' using errcode = '42501';
end;
$$;

revoke all on function public.account_moderation_actions_no_mutation() from public;
revoke all on function public.account_moderation_actions_no_mutation() from anon;
revoke all on function public.account_moderation_actions_no_mutation() from authenticated;

drop trigger if exists trg_account_moderation_actions_append_only
  on public.account_moderation_actions;
create trigger trg_account_moderation_actions_append_only
  before update or delete on public.account_moderation_actions
  for each row execute function public.account_moderation_actions_no_mutation();

-- ---------------------------------------------------------------------------
-- F. RPC TRANSACTIONNELLE admin_set_account_status
--    Effectue, dans UNE transaction : validation -> verrou (FOR UPDATE) ->
--    concurrence optimiste -> matrice -> acteur -> (signalement) -> UPDATE
--    profiles -> INSERT journal -> RETURN du profil.
--
--    - p_expected_status : état vu par l'admin (garde de concurrence).
--    - p_actor_id : provient de requireAdmin() côté serveur ; son email est relu
--      ICI depuis auth.users (jamais transmis par le client).
--    - p_report_id (option) : si fourni, le signalement doit exister ET viser
--      p_profile_id (reported_user_id = p_profile_id).
--    - Raison OBLIGATOIRE (10..2000) pour LES DEUX transitions ; la raison de
--      réactivation est conservée dans le JOURNAL (les colonnes profil sont
--      remises à NULL). Erreurs métier STABLES, sans donnée sensible.
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_account_status(
  p_profile_id uuid,
  p_expected_status text,
  p_new_status text,
  p_reason text,
  p_actor_id uuid,
  p_report_id uuid default null
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile     public.profiles%rowtype;
  v_prev        public.account_status;
  v_reason      text;
  v_actor_email text;
  v_reported    uuid;
begin
  -- 1. Validation des paramètres de statut.
  if p_new_status not in ('active', 'suspended') then
    raise exception 'INVALID_ACCOUNT_STATUS' using errcode = '22023';
  end if;
  if p_expected_status not in ('active', 'suspended') then
    raise exception 'INVALID_ACCOUNT_STATUS' using errcode = '22023';
  end if;

  -- 2. Normalisation de la raison.
  v_reason := btrim(coalesce(p_reason, ''));

  -- 3. Raison obligatoire (10..2000) pour LES DEUX transitions.
  if v_reason = '' then
    raise exception 'REASON_REQUIRED' using errcode = '22023';
  end if;
  if char_length(v_reason) < 10 or char_length(v_reason) > 2000 then
    raise exception 'REASON_LENGTH_INVALID' using errcode = '22023';
  end if;

  -- 4. Verrou + lecture du profil (sérialise les décisions concurrentes).
  select * into v_profile
    from public.profiles
    where id = p_profile_id
    for update;

  if not found then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_prev := v_profile.account_status;

  -- 5. Concurrence optimiste : l'état réel doit être celui vu par l'admin.
  if v_prev::text is distinct from p_expected_status then
    raise exception 'ACCOUNT_STATUS_CONFLICT' using errcode = '40001';
  end if;

  -- 6. Pas de transition vers le statut courant.
  if p_new_status = v_prev::text then
    raise exception 'INVALID_ACCOUNT_TRANSITION' using errcode = '22023';
  end if;

  -- 7. Matrice autorisée : active <-> suspended uniquement.
  if not (
       (v_prev = 'active'::public.account_status    and p_new_status = 'suspended')
    or (v_prev = 'suspended'::public.account_status and p_new_status = 'active')
  ) then
    raise exception 'INVALID_ACCOUNT_TRANSITION' using errcode = '22023';
  end if;

  -- 8. Acteur : doit exister dans auth.users. Email relu côté serveur.
  select u.email into v_actor_email
    from auth.users u
    where u.id = p_actor_id;

  if not found then
    raise exception 'ACTOR_NOT_FOUND' using errcode = '22023';
  end if;

  -- 9. Signalement optionnel : doit exister ET viser ce profil.
  if p_report_id is not null then
    select sr.reported_user_id into v_reported
      from public.safety_reports sr
      where sr.id = p_report_id;

    if not found then
      raise exception 'REPORT_NOT_FOUND' using errcode = '22023';
    end if;

    if v_reported is distinct from p_profile_id then
      raise exception 'REPORT_PROFILE_MISMATCH' using errcode = '22023';
    end if;
  end if;

  -- 10. Mise à jour atomique de l'état courant du profil.
  if p_new_status = 'suspended' then
    update public.profiles
      set account_status    = 'suspended'::public.account_status,
          suspended_at      = now(),
          suspended_by      = p_actor_id,
          suspension_reason = v_reason
      where id = p_profile_id
      returning * into v_profile;
  else
    update public.profiles
      set account_status    = 'active'::public.account_status,
          suspended_at      = null,
          suspended_by      = null,
          suspension_reason = null
      where id = p_profile_id
      returning * into v_profile;
  end if;

  -- 11. Journal append-only (même transaction) — exactement une ligne.
  insert into public.account_moderation_actions (
    profile_id, profile_id_snapshot, actor_id, actor_email_snapshot,
    report_id, previous_status, new_status, reason
  )
  values (
    p_profile_id, p_profile_id, p_actor_id, v_actor_email,
    p_report_id, v_prev, p_new_status::public.account_status, v_reason
  );

  -- 12. Retour du profil mis à jour.
  return v_profile;
end;
$$;

revoke all on function public.admin_set_account_status(uuid, text, text, text, uuid, uuid) from public;
revoke all on function public.admin_set_account_status(uuid, text, text, text, uuid, uuid) from anon;
revoke all on function public.admin_set_account_status(uuid, text, text, text, uuid, uuid) from authenticated;
grant execute on function public.admin_set_account_status(uuid, text, text, text, uuid, uuid) to service_role;
