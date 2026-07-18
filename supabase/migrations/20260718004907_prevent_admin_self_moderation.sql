-- =============================================================================
-- Durcissement — interdiction de l'AUTO-MODÉRATION dans admin_set_account_status.
--
-- Reliquat de sécurité identifié lors de l'audit de réconciliation de la
-- PR #32 : la RPC L3F-C3A permettait à un acteur de cibler SON PROPRE profil
-- (auto-suspension active→suspended ET auto-réactivation suspended→active).
-- Cette migration remplace la fonction par la MÊME définition, augmentée d'une
-- SEULE règle métier autoritative :
--
--     p_actor_id = p_profile_id  →  SELF_MODERATION_FORBIDDEN (SQLSTATE 42501)
--
-- placée APRÈS la vérification de l'acteur (étape 8) et AVANT la validation du
-- signalement, l'UPDATE du profil et l'écriture du journal. L'invariant devient
-- indépendant de tout appelant privilégié (pas seulement de la Server Action).
--
-- AUCUNE autre modification : signature, type de retour, SECURITY DEFINER,
-- search_path = '', validations, verrou FOR UPDATE, concurrence optimiste,
-- matrice active↔suspended, signalement optionnel, UPDATE atomique, journal
-- append-only et privilèges (EXECUTE service_role uniquement) sont préservés à
-- l'identique de 20260704010000_create_account_moderation_backend.sql (jamais
-- modifiée). Aucune donnée existante n'est modifiée.
-- =============================================================================

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

  -- 8bis. AUTO-MODÉRATION INTERDITE : un administrateur ne peut modifier le
  --       statut de SON PROPRE compte, quelle que soit la transition
  --       (auto-suspension ET auto-réactivation). Invariant garanti EN BASE.
  if p_actor_id = p_profile_id then
    raise exception 'SELF_MODERATION_FORBIDDEN' using errcode = '42501';
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

-- Privilèges : réaffirmés à l'identique (CREATE OR REPLACE préserve les ACL,
-- mais on les fixe explicitement pour rendre la migration auto-porteuse).
revoke all on function public.admin_set_account_status(uuid, text, text, text, uuid, uuid) from public;
revoke all on function public.admin_set_account_status(uuid, text, text, text, uuid, uuid) from anon;
revoke all on function public.admin_set_account_status(uuid, text, text, text, uuid, uuid) from authenticated;
grant execute on function public.admin_set_account_status(uuid, text, text, text, uuid, uuid) to service_role;
