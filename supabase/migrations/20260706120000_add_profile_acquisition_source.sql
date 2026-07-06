-- =============================================================================
-- KASSALAFAM — MARIAGE À TOUT PRIX
-- Migration : source d'acquisition « Comment nous as-tu découverts ? » (onboarding)
-- Date      : 2026-07-06
--
-- Objet     : enregistrer, UNE SEULE FOIS (write-once), le canal par lequel le
--             membre a découvert la plateforme, afin d'alimenter ultérieurement
--             les statistiques d'acquisition en back-office.
--               - acquisition_source              : canal (valeurs contrôlées)
--               - acquisition_source_other        : précision libre si « other »
--               - acquisition_source_recorded_at  : horodatage de l'enregistrement
--
-- Valeurs internes autorisées pour acquisition_source :
--               - tiktok
--               - instagram
--               - facebook
--               - youtube
--               - whatsapp_recommendation
--               - google
--               - other
--
-- Sécurité  : - Migration ADDITIVE et NON destructive.
--             - Les trois colonnes sont NULLABLE, SANS valeur par défaut →
--               aucun profil existant cassé, aucune réponse imposée ni déduite.
--             - Aucune donnée modifiée. Aucune colonne supprimée/renommée.
--             - Aucune policy RLS existante modifiée ni supprimée : les policies
--               profiles_insert_own / profiles_update_own restent nécessaires à
--               l'édition normale du profil (le membre écrit sa propre ligne).
--               MAIS elles autoriseraient un UPDATE/INSERT DIRECT des colonnes
--               d'acquisition → contournement de la RPC. On ferme ce trou par un
--               TRIGGER de garde dédié (section 7) : seule la RPC write-once
--               `record_acquisition_source` peut poser la première réponse, et
--               celle-ci devient IMMUABLE.
--             - Aucun trigger de vérification / modération / administration
--               modifié (guard_profiles_admin_fields intact). La garde ajoutée
--               ici est INDÉPENDANTE et n'agit QUE sur les colonnes acquisition_*.
--             - Idempotente : ADD COLUMN IF NOT EXISTS + contraintes protégées
--               par DROP CONSTRAINT IF EXISTS puis ADD CONSTRAINT.
--
-- Immuabilité : la contrainte de cohérence + la RPC garantissent qu'une réponse,
--             une fois enregistrée (recorded_at renseigné), reste STABLE : la RPC
--             refuse d'écraser une première réponse (fiabilité des statistiques).
--
-- ⚠️ À NE PAS appliquer automatiquement : attendre le GO explicite.
--    Ne PAS exécuter `supabase db push` ni toucher la base Production.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Colonnes (nullable, additives, SANS default) ----------------------------
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists acquisition_source text;

alter table public.profiles
  add column if not exists acquisition_source_other text;

alter table public.profiles
  add column if not exists acquisition_source_recorded_at timestamptz;

-- ---------------------------------------------------------------------------
-- 2. Contrainte de domaine sur acquisition_source ----------------------------
--    NULL reste permis (aucune réponse enregistrée).
-- ---------------------------------------------------------------------------
alter table public.profiles
  drop constraint if exists profiles_acquisition_source_check;
alter table public.profiles
  add constraint profiles_acquisition_source_check
  check (
    acquisition_source is null
    or acquisition_source in (
      'tiktok',
      'instagram',
      'facebook',
      'youtube',
      'whatsapp_recommendation',
      'google',
      'other'
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Contrainte conditionnelle sur acquisition_source_other ------------------
--    - lorsque acquisition_source = 'other' : précision OBLIGATOIRE, non vide
--      après btrim, longueur (trim) ≤ 120 ;
--    - sinon (source NULL ou autre valeur) : la précision DOIT être NULL.
--    Un CASE couvre proprement le cas NULL (les anciens profils passent : les
--    deux colonnes sont NULL → branche `else` satisfaite).
-- ---------------------------------------------------------------------------
alter table public.profiles
  drop constraint if exists profiles_acquisition_source_other_check;
alter table public.profiles
  add constraint profiles_acquisition_source_other_check
  check (
    case
      when acquisition_source = 'other' then
        acquisition_source_other is not null
        and btrim(acquisition_source_other) <> ''
        and char_length(btrim(acquisition_source_other)) <= 120
      else
        acquisition_source_other is null
    end
  );

-- ---------------------------------------------------------------------------
-- 4. Cohérence source ⇔ horodatage -------------------------------------------
--    acquisition_source_recorded_at est renseigné SI ET SEULEMENT SI une source
--    est enregistrée. Empêche un horodatage orphelin ou une source sans trace
--    temporelle. Anciens profils (les deux NULL) : satisfaits.
-- ---------------------------------------------------------------------------
alter table public.profiles
  drop constraint if exists profiles_acquisition_recorded_coherence;
alter table public.profiles
  add constraint profiles_acquisition_recorded_coherence
  check (
    (acquisition_source is null and acquisition_source_recorded_at is null)
    or
    (acquisition_source is not null and acquisition_source_recorded_at is not null)
  );

-- ---------------------------------------------------------------------------
-- 5. RPC write-once public.record_acquisition_source -------------------------
--    UNIQUE chemin d'écriture applicatif. Enregistre la source du membre
--    AUTHENTIFIÉ (auth.uid()) une seule fois ; ne l'écrase JAMAIS ensuite.
--
--    Retour (text) explicite pour le front :
--      - 'recorded'         : première réponse enregistrée à l'instant ;
--      - 'already_recorded' : une réponse DIFFÉRENTE existait déjà (conservée) ;
--      - 'unchanged'        : réponse identique déjà enregistrée (idempotent).
--
--    Sécurité :
--      - SECURITY DEFINER + search_path verrouillé (convention du dépôt : '')
--        avec identifiants pleinement qualifiés (auth.uid(), public.profiles) ;
--      - n'accepte JAMAIS d'user_id en paramètre ; l'identité vient d'auth.uid() ;
--      - REVOKE ALL + GRANT EXECUTE à `authenticated` uniquement ;
--      - conserve la RLS et les triggers de garde existants :
--          · INSERT minimal (id + colonnes d'acquisition) → verification_status
--            et account_status prennent leurs DÉFAUTS neutres ('pending' /
--            'active'), métadonnées admin NULL → garde admin satisfaite ;
--          · UPDATE ne touche que les colonnes d'acquisition → aucun champ
--            administratif modifié → garde admin satisfaite.
--
--    Note schéma : un INSERT « minimal » ne posant que `id` + les colonnes
--    d'acquisition est valide — toutes les autres colonnes NOT NULL de
--    public.profiles possèdent un DEFAULT (intention, blur_photos, is_premium,
--    verification_status, account_status, created_at, updated_at). Aucun
--    contournement de contrainte n'est nécessaire.
-- ---------------------------------------------------------------------------
create or replace function public.record_acquisition_source(
  p_source text,
  p_other text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_other text;
  v_existing_source text;
  v_existing_other  text;
  v_existing_at     timestamptz;
begin
  -- 1. Authentification obligatoire.
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- 2. Source connue.
  if p_source not in (
    'tiktok', 'instagram', 'facebook', 'youtube',
    'whatsapp_recommendation', 'google', 'other'
  ) then
    raise exception 'invalid acquisition source' using errcode = '22023';
  end if;

  -- 3. Normalisation + validation de la précision « other ».
  if p_source = 'other' then
    v_other := btrim(p_other);
    if v_other is null or v_other = '' then
      raise exception 'acquisition detail required for source other'
        using errcode = '22023';
    end if;
    if char_length(v_other) > 120 then
      raise exception 'acquisition detail too long' using errcode = '22023';
    end if;
  else
    -- Précision interdite pour toute source autre que « other ».
    if p_other is not null and btrim(p_other) <> '' then
      raise exception 'acquisition detail not allowed for this source'
        using errcode = '22023';
    end if;
    v_other := null;
  end if;

  -- 4. Verrou de la ligne du membre (si elle existe).
  select acquisition_source, acquisition_source_other, acquisition_source_recorded_at
    into v_existing_source, v_existing_other, v_existing_at
    from public.profiles
    where id = v_uid
    for update;

  -- 4a. Profil inexistant : création minimale porteuse de la réponse.
  if not found then
    begin
      insert into public.profiles (
        id, acquisition_source, acquisition_source_other, acquisition_source_recorded_at
      )
      values (v_uid, p_source, v_other, now());
      return 'recorded';
    exception when unique_violation then
      -- Course concurrente : la ligne vient d'être créée ailleurs ; on relit.
      select acquisition_source, acquisition_source_other, acquisition_source_recorded_at
        into v_existing_source, v_existing_other, v_existing_at
        from public.profiles
        where id = v_uid
        for update;
    end;
  end if;

  -- 5. Réponse déjà enregistrée : JAMAIS d'écrasement.
  if v_existing_at is not null then
    if v_existing_source is not distinct from p_source
       and v_existing_other is not distinct from v_other then
      return 'unchanged';
    end if;
    return 'already_recorded';
  end if;

  -- 6. Ligne existante sans réponse encore enregistrée : on enregistre.
  update public.profiles
    set acquisition_source = p_source,
        acquisition_source_other = v_other,
        acquisition_source_recorded_at = now()
    where id = v_uid;

  return 'recorded';
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Droits d'exécution : réservés aux membres authentifiés.
-- ---------------------------------------------------------------------------
revoke all on function public.record_acquisition_source(text, text) from public;
revoke all on function public.record_acquisition_source(text, text) from anon;
grant execute on function public.record_acquisition_source(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. GARDE D'IMMUTABILITÉ des colonnes d'acquisition — BEFORE INSERT OR UPDATE.
--
--    POURQUOI : les policies RLS profiles_insert_own / profiles_update_own
--    autorisent un membre à écrire sa propre ligne (nécessaire pour prénom, bio,
--    ville…). Sans garde, il pourrait donc poser ou écraser acquisition_* en
--    DIRECT (UPDATE/INSERT), court-circuitant la RPC write-once et faussant les
--    statistiques. Ce trigger interdit toute écriture directe de ces colonnes.
--
--    CHEMIN AUTORISÉ, sans coder « postgres » en dur :
--      - appel PostgREST direct (rôle applicatif) : current_user = rôle client
--        (authenticated / anon / service_role) ;
--      - à l'intérieur de la RPC SECURITY DEFINER : current_user = PROPRIÉTAIRE
--        réel de la fonction.
--    On lit donc le propriétaire réel de
--    public.record_acquisition_source(text, text) dans pg_catalog.pg_proc et on
--    le compare à current_user. La garde est SECURITY INVOKER (défaut) : elle
--    conserve le rôle effectif courant (celui du propriétaire pendant la RPC).
--
--    PORTÉE MINIMALE : la garde n'agit QUE si une colonne d'acquisition change
--    réellement. Les éditions ordinaires du profil et les RPC administratives
--    (verification_* / account_*) ne touchent pas ces colonnes → elles passent
--    intégralement sans entrave.
--
--    IMMUTABILITÉ EN PROFONDEUR : même exécutée sous le propriétaire de la RPC,
--    une écriture n'est acceptée que si OLD.acquisition_source_recorded_at IS
--    NULL (première réponse). Toute modification ultérieure est refusée — même
--    une future régression de la RPC ne pourra pas écraser la première réponse.
-- ---------------------------------------------------------------------------
create or replace function public.guard_profile_acquisition_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_is_rpc boolean;
begin
  -- Exécution sous le propriétaire réel de la RPC write-once ? (chemin autorisé)
  v_is_rpc := exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_roles r on r.oid = p.proowner
    where p.oid = 'public.record_acquisition_source(text, text)'::pg_catalog.regprocedure
      and r.rolname = current_user
  );

  if tg_op = 'INSERT' then
    -- Aucune donnée d'acquisition → création ordinaire / legacy → autorisée.
    if new.acquisition_source is null
       and new.acquisition_source_other is null
       and new.acquisition_source_recorded_at is null then
      return new;
    end if;

    -- Données d'acquisition présentes dès l'INSERT : réservé à la RPC.
    if not v_is_rpc then
      raise exception 'ACQUISITION_FIELDS_READ_ONLY' using errcode = '42501';
    end if;

    -- Première écriture valide (défense en profondeur ; le CHECK couvre aussi).
    if new.acquisition_source is null
       or new.acquisition_source_recorded_at is null then
      raise exception 'ACQUISITION_FIRST_WRITE_INVALID' using errcode = '42501';
    end if;
    if new.acquisition_source = 'other' then
      if new.acquisition_source_other is null
         or pg_catalog.btrim(new.acquisition_source_other) = '' then
        raise exception 'ACQUISITION_FIRST_WRITE_INVALID' using errcode = '42501';
      end if;
    elsif new.acquisition_source_other is not null then
      raise exception 'ACQUISITION_FIRST_WRITE_INVALID' using errcode = '42501';
    end if;

    return new;
  end if;

  -- tg_op = 'UPDATE'
  -- Colonnes d'acquisition strictement inchangées → édition ordinaire / RPC
  -- admin → autorisée sans condition.
  if new.acquisition_source is not distinct from old.acquisition_source
     and new.acquisition_source_other is not distinct from old.acquisition_source_other
     and new.acquisition_source_recorded_at
           is not distinct from old.acquisition_source_recorded_at then
    return new;
  end if;

  -- Au moins une colonne d'acquisition change → chemin RPC obligatoire.
  if not v_is_rpc then
    raise exception 'ACQUISITION_FIELDS_READ_ONLY' using errcode = '42501';
  end if;

  -- Immutabilité : plus aucune modification une fois la réponse enregistrée,
  -- même sous le propriétaire de la RPC (backstop anti-régression).
  if old.acquisition_source_recorded_at is not null then
    raise exception 'ACQUISITION_ALREADY_RECORDED' using errcode = '42501';
  end if;

  -- Première écriture valide.
  if new.acquisition_source is null
     or new.acquisition_source_recorded_at is null then
    raise exception 'ACQUISITION_FIRST_WRITE_INVALID' using errcode = '42501';
  end if;
  if new.acquisition_source = 'other' then
    if new.acquisition_source_other is null
       or pg_catalog.btrim(new.acquisition_source_other) = '' then
      raise exception 'ACQUISITION_FIRST_WRITE_INVALID' using errcode = '42501';
    end if;
  elsif new.acquisition_source_other is not null then
    raise exception 'ACQUISITION_FIRST_WRITE_INVALID' using errcode = '42501';
  end if;

  return new;
end;
$$;

-- La fonction de garde n'est JAMAIS une API métier : révoquée de tous les rôles.
-- Un trigger s'exécute sans que le rôle déclencheur ait besoin d'EXECUTE dessus.
revoke all on function public.guard_profile_acquisition_fields() from public;
revoke all on function public.guard_profile_acquisition_fields() from anon;
revoke all on function public.guard_profile_acquisition_fields() from authenticated;

drop trigger if exists trg_profiles_guard_acquisition_fields on public.profiles;
create trigger trg_profiles_guard_acquisition_fields
  before insert or update on public.profiles
  for each row execute function public.guard_profile_acquisition_fields();
