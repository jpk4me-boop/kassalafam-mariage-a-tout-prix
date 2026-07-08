-- =============================================================================
-- Onboarding — marqueur de FIN EXPLICITE du parcours initial.
--
-- CONCEPTS (arbitrage produit) :
--   1. `onboarding_completed_at` = le membre a explicitement terminé et envoyé
--      son parcours initial (clic « Envoyer mon profil »). Utilisé par le
--      ROUTAGE (middleware + résolution de mode /onboarding).
--   2. La complétude DYNAMIQUE du profil (les données actuelles satisfont les
--      exigences produit) reste calculée côté app (`isProfileDataComplete`) et
--      pilote le bandeau « Profil incomplet » du dashboard. Un membre peut
--      redevenir « incomplet » via /profile sans que son onboarding rouvre.
--
-- CONTENU :
--   1. colonne additive `profiles.onboarding_completed_at timestamptz null` ;
--   2. prédicat interne `profile_meets_onboarding_requirements(profiles)` —
--      LA définition serveur des exigences, partagée par la RPC et le backfill ;
--   3. RPC `complete_member_onboarding()` (SECURITY DEFINER, auth.uid(),
--      idempotente) — seul chemin d'écriture du marqueur pour un membre ;
--   4. garde-trigger : aucune écriture directe du marqueur par le client
--      (même pattern que trg_profiles_guard_acquisition_fields) ;
--   5. backfill STRICT et idempotent des profils historiques réellement
--      complets (acquisition + tous champs requis + photo principale).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Colonne additive, nullable — rétrocompatible.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists onboarding_completed_at timestamptz;

comment on column public.profiles.onboarding_completed_at is
  'Fin EXPLICITE du parcours d''onboarding (clic « Envoyer mon profil »). '
  'Write-once via la RPC complete_member_onboarding() ; écriture directe '
  'rejetée par trg_profiles_guard_onboarding_completion. NULL = parcours '
  'initial non finalisé.';

-- ---------------------------------------------------------------------------
-- 2. Prédicat interne — exigences serveur du parcours (source de vérité
--    UNIQUE, utilisée par la RPC et le backfill ; miroir de
--    `computeStepCompletion` côté app, étapes 1 à 8) :
--      é1 acquisition ; é2 prénom + genre ; é3 naissance (18 ans révolus) ;
--      é4 situation ; é5 profession + études + taille ; é6 localisation (4) ;
--      é7 objectifs + qualités (2..3, CHECK en base) + polygamie + enfants
--         + bio + attentes (≤ 2000, CHECK en base) ; é8 photo principale.
--    Les bornes fines (choice sets valides, longueurs, taille 120..230) sont
--    déjà garanties par les CHECK existants pour toute valeur NON NULLE : le
--    prédicat vérifie la PRÉSENCE et les règles purement applicatives (18 ans).
-- ---------------------------------------------------------------------------
create or replace function public.profile_meets_onboarding_requirements(
  p_profile public.profiles
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select
    -- Étape 1 — acquisition (write-once déjà posée)
    p_profile.acquisition_source_recorded_at is not null
    -- Étape 2 — prénom + genre
    and coalesce(pg_catalog.btrim(p_profile.first_name), '') <> ''
    and p_profile.gender is not null
    -- Étape 3 — date de naissance, 18 ans révolus
    and p_profile.birth_date is not null
    and p_profile.birth_date <= (current_date - interval '18 years')::date
    -- Étape 4 — situation matrimoniale
    and p_profile.marital_status is not null
    -- Étape 5 — profession / études / taille
    and coalesce(pg_catalog.btrim(p_profile.profession), '') <> ''
    and p_profile.education_level is not null
    and p_profile.height_cm is not null
    -- Étape 6 — localisation
    and coalesce(pg_catalog.btrim(p_profile.country), '') <> ''
    and coalesce(pg_catalog.btrim(p_profile.city), '') <> ''
    and coalesce(pg_catalog.btrim(p_profile.origin_country), '') <> ''
    and coalesce(pg_catalog.btrim(p_profile.region), '') <> ''
    -- Étape 7 — projet matrimonial + présentation + attentes
    and coalesce(pg_catalog.array_length(p_profile.marriage_goals, 1), 0) >= 2
    and coalesce(pg_catalog.array_length(p_profile.desired_partner_traits, 1), 0) >= 2
    and p_profile.polygamy_preference is not null
    and p_profile.children_intent is not null
    and coalesce(pg_catalog.btrim(p_profile.bio), '') <> ''
    and coalesce(pg_catalog.btrim(p_profile.partner_expectations), '') <> ''
    -- Étape 8 — photo principale
    and exists (
      select 1
      from public.photos ph
      where ph.profile_id = p_profile.id
        and ph.is_primary
    );
$$;

-- Prédicat interne : jamais une API métier.
revoke all on function public.profile_meets_onboarding_requirements(public.profiles) from public;
revoke all on function public.profile_meets_onboarding_requirements(public.profiles) from anon;
revoke all on function public.profile_meets_onboarding_requirements(public.profiles) from authenticated;

-- ---------------------------------------------------------------------------
-- 3. RPC de finalisation — SEUL chemin d'écriture du marqueur pour un membre.
--    - auth.uid() obligatoire (aucun identifiant accepté du client) ;
--    - idempotente : un second appel renvoie le PREMIER horodatage, inchangé ;
--    - erreurs par champ (message stable ONBOARDING_INCOMPLETE_*) pour une
--      restitution client précise, puis prédicat en garde-fou final.
-- ---------------------------------------------------------------------------
create or replace function public.complete_member_onboarding()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_profile public.profiles%rowtype;
  v_now timestamptz;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'ONBOARDING_AUTH_REQUIRED' using errcode = '42501';
  end if;

  select * into v_profile
  from public.profiles
  where id = v_uid
  for update;

  if not found then
    raise exception 'ONBOARDING_PROFILE_MISSING';
  end if;

  -- Idempotence : déjà finalisé → renvoyer le premier horodatage, sans écrire.
  if v_profile.onboarding_completed_at is not null then
    return v_profile.onboarding_completed_at;
  end if;

  -- Erreurs par exigence (mêmes règles que le prédicat, messages stables).
  if v_profile.acquisition_source_recorded_at is null then
    raise exception 'ONBOARDING_INCOMPLETE_ACQUISITION';
  end if;
  if coalesce(pg_catalog.btrim(v_profile.first_name), '') = '' then
    raise exception 'ONBOARDING_INCOMPLETE_FIRST_NAME';
  end if;
  if v_profile.gender is null then
    raise exception 'ONBOARDING_INCOMPLETE_GENDER';
  end if;
  if v_profile.birth_date is null
     or v_profile.birth_date > (current_date - interval '18 years')::date then
    raise exception 'ONBOARDING_INCOMPLETE_BIRTH_DATE';
  end if;
  if v_profile.marital_status is null then
    raise exception 'ONBOARDING_INCOMPLETE_MARITAL_STATUS';
  end if;
  if coalesce(pg_catalog.btrim(v_profile.profession), '') = ''
     or v_profile.education_level is null
     or v_profile.height_cm is null then
    raise exception 'ONBOARDING_INCOMPLETE_PROFESSIONAL';
  end if;
  if coalesce(pg_catalog.btrim(v_profile.country), '') = ''
     or coalesce(pg_catalog.btrim(v_profile.city), '') = ''
     or coalesce(pg_catalog.btrim(v_profile.origin_country), '') = ''
     or coalesce(pg_catalog.btrim(v_profile.region), '') = '' then
    raise exception 'ONBOARDING_INCOMPLETE_LOCATION';
  end if;
  if coalesce(pg_catalog.array_length(v_profile.marriage_goals, 1), 0) < 2
     or coalesce(pg_catalog.array_length(v_profile.desired_partner_traits, 1), 0) < 2
     or v_profile.polygamy_preference is null
     or v_profile.children_intent is null then
    raise exception 'ONBOARDING_INCOMPLETE_MATRIMONIAL';
  end if;
  if coalesce(pg_catalog.btrim(v_profile.bio), '') = '' then
    raise exception 'ONBOARDING_INCOMPLETE_BIO';
  end if;
  if coalesce(pg_catalog.btrim(v_profile.partner_expectations), '') = '' then
    raise exception 'ONBOARDING_INCOMPLETE_PARTNER_EXPECTATIONS';
  end if;
  if not exists (
    select 1 from public.photos ph
    where ph.profile_id = v_uid and ph.is_primary
  ) then
    raise exception 'ONBOARDING_INCOMPLETE_PRIMARY_PHOTO';
  end if;

  -- Garde-fou final : la source de vérité partagée avec le backfill.
  if not public.profile_meets_onboarding_requirements(v_profile) then
    raise exception 'ONBOARDING_INCOMPLETE';
  end if;

  v_now := pg_catalog.now();

  update public.profiles
  set onboarding_completed_at = v_now
  where id = v_uid
    and onboarding_completed_at is null;

  return v_now;
end;
$$;

revoke all on function public.complete_member_onboarding() from public;
revoke all on function public.complete_member_onboarding() from anon;
grant execute on function public.complete_member_onboarding() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Garde : aucune écriture directe du marqueur par un client.
--    Même pattern que guard_profile_acquisition_fields : les policies RLS
--    profiles_insert_own / profiles_update_own permettent au membre d'écrire
--    sa ligne ; sans garde il poserait onboarding_completed_at lui-même via
--    upsert. Chemin autorisé = exécution sous le PROPRIÉTAIRE réel de la RPC
--    complete_member_onboarding() (ce qui couvre aussi la migration et le
--    backfill, exécutés par ce même rôle propriétaire). Portée minimale : la
--    garde n'agit que si la colonne change réellement. Write-once en
--    profondeur : un horodatage posé n'est plus jamais modifiable, même par
--    le propriétaire de la RPC (backstop anti-régression).
-- ---------------------------------------------------------------------------
create or replace function public.guard_profile_onboarding_completion()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_is_rpc boolean;
begin
  if tg_op = 'INSERT' then
    if new.onboarding_completed_at is null then
      return new; -- création ordinaire (wizard, /profile, legacy) — autorisée.
    end if;
  else
    if new.onboarding_completed_at is not distinct from old.onboarding_completed_at then
      return new; -- éditions ordinaires du profil — jamais entravées.
    end if;
  end if;

  v_is_rpc := exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_roles r on r.oid = p.proowner
    where p.oid = 'public.complete_member_onboarding()'::pg_catalog.regprocedure
      and r.rolname = current_user
  );

  if not v_is_rpc then
    raise exception 'ONBOARDING_COMPLETION_READ_ONLY' using errcode = '42501';
  end if;

  -- Write-once : jamais de modification d'un horodatage déjà posé.
  if tg_op = 'UPDATE' and old.onboarding_completed_at is not null then
    raise exception 'ONBOARDING_ALREADY_COMPLETED' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_profile_onboarding_completion() from public;
revoke all on function public.guard_profile_onboarding_completion() from anon;
revoke all on function public.guard_profile_onboarding_completion() from authenticated;

drop trigger if exists trg_profiles_guard_onboarding_completion on public.profiles;
create trigger trg_profiles_guard_onboarding_completion
  before insert or update on public.profiles
  for each row execute function public.guard_profile_onboarding_completion();

-- ---------------------------------------------------------------------------
-- 5. Backfill STRICT des profils historiques — mêmes exigences serveur que la
--    RPC (prédicat partagé), idempotent (ne remplace jamais un horodatage) et
--    ne marque AUCUN profil partiel. Encapsulé dans une fonction (revoquée de
--    tous les rôles applicatifs) pour être testable par pgTAP ; exécutée UNE
--    fois par la migration. Renvoie le nombre de profils marqués.
-- ---------------------------------------------------------------------------
create or replace function public.backfill_onboarding_completion()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.profiles p
  set onboarding_completed_at = pg_catalog.now()
  where p.onboarding_completed_at is null
    and public.profile_meets_onboarding_requirements(p);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.backfill_onboarding_completion() from public;
revoke all on function public.backfill_onboarding_completion() from anon;
revoke all on function public.backfill_onboarding_completion() from authenticated;

select public.backfill_onboarding_completion();
