-- =============================================================================
-- KASSALAFAM — MARIAGE À TOUT PRIX
-- Migration : backend sécurisé des liens de partage publics (PR2 partage)
-- Date      : 2026-07-12
--
-- Objet     : créer public.profile_share_links, le cycle de vie SERVEUR des
--             liens de partage limité d'un profil (création admin, expiration,
--             révocation, résolution par jeton). Cette PR ne crée AUCUNE route
--             publique, AUCUNE page et AUCUNE interface : uniquement la table
--             et les fonctions service_role que la PR3 (page publique) et la
--             PR4 (UI admin) consommeront côté serveur.
--
-- Modèle    : - le jeton public (32 octets aléatoires pgcrypto, base64 URL-safe,
--               43 caractères) n'est JAMAIS stocké : seul son hash SHA-256
--               (bytea UNIQUE) et un préfixe non secret de 8 caractères
--               (identification administrative) sont conservés ;
--             - le jeton en clair n'est retourné qu'UNE SEULE fois, par
--               create_profile_share_link ;
--             - la révocation renseigne revoked_at/revoked_by(/motif) sans
--               JAMAIS supprimer la ligne (historique durable) ;
--             - au plus UN lien NON RÉVOQUÉ par profil (index unique partiel
--               sur revoked_at IS NULL — PostgreSQL n'autorise pas de condition
--               d'index sur now(), l'expiration est donc tranchée à la lecture
--               et par rotation : si le lien non révoqué est EXPIRÉ,
--               create_profile_share_link le révoque d'abord (rotation
--               automatique journalisée) puis crée le suivant ; s'il est encore
--               VALIDE, la création est refusée (LINK_ALREADY_ACTIVE) et
--               l'admin doit révoquer explicitement) ;
--             - durée de vie : 7 jours par défaut, bornée entre 1 heure et
--               30 jours maximum ;
--             - created_by / revoked_by identifient l'admin (auth.users),
--               validés PAR LES FONCTIONS mais volontairement SANS FK — même
--               convention que profile_share_consents.withdrawn_by (PR1) :
--               une FK NOT NULL vers auth.users bloquerait la suppression RGPD
--               du compte de l'acteur, et l'UUID reste la trace d'audit
--               minimale qui survit à cette suppression.
--
-- Sécurité  : - RLS activée : AUCUNE policy → aucun accès direct anon ou
--               authenticated, en lecture comme en écriture ;
--             - privilèges de table entièrement révoqués pour public/anon/
--               authenticated ; service_role reçoit SELECT seul (diagnostic) —
--               toutes les ÉCRITURES passent par les fonctions SECURITY
--               DEFINER (propriétaire postgres) ;
--             - 4 fonctions SECURITY DEFINER, search_path = '', EXECUTE réservé
--               à service_role (jamais anon/authenticated) : le navigateur ne
--               peut NI créer, NI révoquer, NI résoudre un lien ;
--             - resolve_profile_share_link renvoie ZÉRO ligne pour TOUT jeton
--               invalide (inconnu, altéré, expiré, révoqué, consentement
--               retiré, profil non publiable) : aucune distinction de cause
--               n'est révélée ; elle ne renvoie AUCUNE donnée de présentation
--               (ni prénom, ni ville, ni photo…) — uniquement le contexte
--               serveur minimal (link_id, profile_id, expires_at) pour la PR3 ;
--             - un profil n'est « publiable » que si : compte actif,
--               vérification approuvée, onboarding terminé
--               (onboarding_completed_at) ET consentement PR1 actif — revérifié
--               à CHAQUE résolution, donc le retrait du consentement ou une
--               suspension invalide immédiatement le lien ;
--             - journal d'administration : la table est ELLE-MÊME l'audit
--               durable (created_*/revoked_* jamais supprimés). L'intégration
--               au journal unifié admin_audit_log est REPORTÉE à la PR4 : son
--               CHECK action_type, la RPC admin_list_audit_events et les
--               libellés UI devraient être étendus ensemble — hors périmètre
--               backend (documenté, sans affaiblissement de sécurité) ;
--             - migration additive : aucune table existante modifiée, aucune
--               policy existante touchée, aucune donnée écrite.
--
-- ⚠️ À NE PAS appliquer automatiquement : attendre le GO explicite.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Table public.profile_share_links ----------------------------------------
-- ---------------------------------------------------------------------------
create table if not exists public.profile_share_links (
  id                uuid primary key default gen_random_uuid(),
  profile_id        uuid not null references public.profiles (id) on delete cascade,
  -- SHA-256 du jeton public. Le jeton en clair n'existe nulle part en base.
  token_hash        bytea not null,
  -- 8 premiers caractères du jeton : identification administrative uniquement
  -- (43 caractères au total → le préfixe ne suffit jamais à le reconstruire).
  token_prefix      text not null,
  created_by        uuid not null,
  created_at        timestamptz not null default now(),
  expires_at        timestamptz not null,
  revoked_at        timestamptz,
  revoked_by        uuid,
  revocation_reason text,

  constraint profile_share_links_token_hash_unique unique (token_hash),

  -- Le hash SHA-256 fait exactement 32 octets ; le préfixe exactement 8 car.
  constraint profile_share_links_token_hash_len
    check (octet_length(token_hash) = 32),
  constraint profile_share_links_token_prefix_len
    check (char_length(token_prefix) = 8),

  -- Un lien naît toujours avec une expiration future.
  constraint profile_share_links_expires_after_created
    check (expires_at > created_at),

  -- Cohérence de révocation : horodatage et auteur vont ensemble, jamais
  -- antérieure à la création, motif uniquement sur un lien révoqué (1..500).
  constraint profile_share_links_revoked_coherence
    check ((revoked_at is null) = (revoked_by is null)),
  constraint profile_share_links_revoked_after_created
    check (revoked_at is null or revoked_at >= created_at),
  constraint profile_share_links_revocation_reason_valid
    check (
      revocation_reason is null
      or (revoked_at is not null
          and char_length(btrim(revocation_reason)) between 1 and 500)
    )
);

-- Au plus UN lien non révoqué par profil (l'expiration, dépendante de now(),
-- ne peut pas entrer dans la condition d'un index : elle est gérée par la
-- rotation de create_profile_share_link et revérifiée à chaque résolution).
create unique index if not exists profile_share_links_one_unrevoked
  on public.profile_share_links (profile_id)
  where revoked_at is null;

-- Historique d'un profil (fiche admin PR4).
create index if not exists profile_share_links_profile_idx
  on public.profile_share_links (profile_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. RLS + privilèges : AUCUN accès client -----------------------------------
--    RLS activée sans aucune policy → anon/authenticated ne voient rien même
--    si un privilège réapparaissait. Privilèges révoqués en profondeur ;
--    service_role garde SELECT seul (lecture de diagnostic serveur) — toutes
--    les écritures passent par les fonctions SECURITY DEFINER ci-dessous.
-- ---------------------------------------------------------------------------
alter table public.profile_share_links enable row level security;

revoke all on table public.profile_share_links from public;
revoke all on table public.profile_share_links from anon;
revoke all on table public.profile_share_links from authenticated;
revoke all on table public.profile_share_links from service_role;
grant select on table public.profile_share_links to service_role;

-- ---------------------------------------------------------------------------
-- 3. Publiabilité d'un profil (helper interne, non exposé) -------------------
--    Règle UNIQUE réutilisée par création et résolution : compte actif,
--    vérification approuvée, onboarding terminé, consentement PR1 actif.
-- ---------------------------------------------------------------------------
create or replace function public.profile_is_shareable(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_profile_id
      and p.account_status = 'active'
      and p.verification_status = 'approved'
      and p.onboarding_completed_at is not null
  )
  and exists (
    select 1
    from public.profile_share_consents c
    where c.profile_id = p_profile_id
      and c.withdrawn_at is null
  );
$$;

revoke all on function public.profile_is_shareable(uuid) from public;
revoke all on function public.profile_is_shareable(uuid) from anon;
revoke all on function public.profile_is_shareable(uuid) from authenticated;
grant execute on function public.profile_is_shareable(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 4. create_profile_share_link (service_role only) ---------------------------
--    UNIQUE chemin de création. p_actor_id provient TOUJOURS d'une session
--    admin validée côté serveur (requireAdmin/resolveAdminActor) — jamais du
--    navigateur. Erreurs métier STABLES (convention admin_set_account_status).
--    Retourne le jeton EN CLAIR une seule fois.
-- ---------------------------------------------------------------------------
create or replace function public.create_profile_share_link(
  p_profile_id uuid,
  p_actor_id uuid,
  p_expires_at timestamptz default null
)
returns table (
  link_id uuid,
  token text,
  token_prefix text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expires  timestamptz := coalesce(p_expires_at, now() + interval '7 days');
  v_existing public.profile_share_links%rowtype;
  v_token    text;
  v_row      public.profile_share_links%rowtype;
begin
  -- 1. Acteur admin : doit exister dans auth.users (identité côté serveur).
  if p_actor_id is null
     or not exists (select 1 from auth.users u where u.id = p_actor_id) then
    raise exception 'ACTOR_NOT_FOUND' using errcode = '22023';
  end if;

  -- 2. Bornes d'expiration : minimum 1 heure, maximum 30 jours.
  if v_expires < now() + interval '1 hour' then
    raise exception 'EXPIRY_TOO_SHORT' using errcode = '22023';
  end if;
  if v_expires > now() + interval '30 days' then
    raise exception 'EXPIRY_TOO_LONG' using errcode = '22023';
  end if;

  -- 3. Verrou du profil : sérialise les créations concurrentes pour un même
  --    profil (l'index unique partiel reste le filet final).
  perform 1 from public.profiles p where p.id = p_profile_id for update;
  if not found then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- 4. Publiabilité : actif + approuvé + onboarding terminé + consentement.
  --    Le consentement est distingué pour un message admin actionnable.
  if not exists (
    select 1 from public.profile_share_consents c
    where c.profile_id = p_profile_id and c.withdrawn_at is null
  ) then
    raise exception 'CONSENT_REQUIRED' using errcode = '22023';
  end if;
  if not public.profile_is_shareable(p_profile_id) then
    raise exception 'PROFILE_NOT_PUBLISHABLE' using errcode = '22023';
  end if;

  -- 5. Lien non révoqué existant : refus s'il est encore valide (révocation
  --    explicite exigée) ; rotation automatique journalisée s'il est expiré.
  select * into v_existing
    from public.profile_share_links l
    where l.profile_id = p_profile_id and l.revoked_at is null
    for update;

  if found then
    if v_existing.expires_at > now() then
      raise exception 'LINK_ALREADY_ACTIVE' using errcode = '22023';
    end if;
    update public.profile_share_links
      set revoked_at = now(),
          revoked_by = p_actor_id,
          revocation_reason = 'Rotation automatique : lien expiré remplacé.'
      where id = v_existing.id;
  end if;

  -- 6. Jeton : 32 octets aléatoires cryptographiques (pgcrypto), encodés en
  --    base64 URL-safe (43 caractères, alphabet A-Za-z0-9_-). Aucun UUID,
  --    aucune donnée personnelle, non séquentiel.
  v_token := replace(replace(rtrim(
    encode(extensions.gen_random_bytes(32), 'base64'), '='), '+', '-'), '/', '_');

  -- 7. Stockage : hash SHA-256 + préfixe non secret uniquement.
  insert into public.profile_share_links
    (profile_id, token_hash, token_prefix, created_by, expires_at)
  values
    (p_profile_id, extensions.digest(v_token, 'sha256'), left(v_token, 8),
     p_actor_id, v_expires)
  returning * into v_row;

  -- 8. Le jeton en clair n'est retourné qu'ICI, une seule fois.
  return query select v_row.id, v_token, v_row.token_prefix, v_row.expires_at;
end;
$$;

revoke all on function public.create_profile_share_link(uuid, uuid, timestamptz) from public;
revoke all on function public.create_profile_share_link(uuid, uuid, timestamptz) from anon;
revoke all on function public.create_profile_share_link(uuid, uuid, timestamptz) from authenticated;
grant execute on function public.create_profile_share_link(uuid, uuid, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- 5. revoke_profile_share_link (service_role only) ---------------------------
--    UNIQUE chemin de révocation. Idempotente : true si le lien vient d'être
--    révoqué, false s'il l'était déjà (revoked_at/by d'origine conservés).
--    Ne supprime JAMAIS la ligne, ne réactive JAMAIS un lien.
-- ---------------------------------------------------------------------------
create or replace function public.revoke_profile_share_link(
  p_link_id uuid,
  p_actor_id uuid,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link   public.profile_share_links%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if p_actor_id is null
     or not exists (select 1 from auth.users u where u.id = p_actor_id) then
    raise exception 'ACTOR_NOT_FOUND' using errcode = '22023';
  end if;

  if v_reason is not null and char_length(v_reason) > 500 then
    raise exception 'REASON_LENGTH_INVALID' using errcode = '22023';
  end if;

  select * into v_link
    from public.profile_share_links l
    where l.id = p_link_id
    for update;

  if not found then
    raise exception 'LINK_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Déjà révoqué : idempotent, l'historique d'origine reste intact.
  if v_link.revoked_at is not null then
    return false;
  end if;

  update public.profile_share_links
    set revoked_at = now(),
        revoked_by = p_actor_id,
        revocation_reason = v_reason
    where id = p_link_id;

  return true;
end;
$$;

revoke all on function public.revoke_profile_share_link(uuid, uuid, text) from public;
revoke all on function public.revoke_profile_share_link(uuid, uuid, text) from anon;
revoke all on function public.revoke_profile_share_link(uuid, uuid, text) from authenticated;
grant execute on function public.revoke_profile_share_link(uuid, uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 6. resolve_profile_share_link (service_role only) --------------------------
--    Résolution SERVEUR d'un jeton public (page publique PR3). ZÉRO ligne pour
--    TOUT jeton invalide — inconnu, altéré, expiré, révoqué, consentement
--    retiré, profil non publiable — sans distinction de cause (aucune fuite).
--    Ne renvoie AUCUNE donnée de présentation : contexte serveur minimal.
-- ---------------------------------------------------------------------------
create or replace function public.resolve_profile_share_link(p_token text)
returns table (
  link_id uuid,
  profile_id uuid,
  expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- Forme attendue stricte : 43 caractères base64 URL-safe. Tout écart est
  -- rejeté sans requête (même réponse vide que pour un jeton inconnu).
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then
    return;
  end if;

  return query
    select l.id, l.profile_id, l.expires_at
    from public.profile_share_links l
    where l.token_hash = extensions.digest(p_token, 'sha256')
      and l.revoked_at is null
      and l.expires_at > now()
      and public.profile_is_shareable(l.profile_id);
end;
$$;

revoke all on function public.resolve_profile_share_link(text) from public;
revoke all on function public.resolve_profile_share_link(text) from anon;
revoke all on function public.resolve_profile_share_link(text) from authenticated;
grant execute on function public.resolve_profile_share_link(text) to service_role;

-- ---------------------------------------------------------------------------
-- 7. admin_list_profile_share_links (service_role only) ----------------------
--    Métadonnées pour la future fiche admin (PR4) : JAMAIS le jeton ni le hash
--    complet — uniquement préfixe, dates, statut calculé et acteurs.
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_profile_share_links(
  p_profile_id uuid default null
)
returns table (
  link_id uuid,
  profile_id uuid,
  token_prefix text,
  created_by uuid,
  created_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid,
  revocation_reason text,
  status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    l.id,
    l.profile_id,
    l.token_prefix,
    l.created_by,
    l.created_at,
    l.expires_at,
    l.revoked_at,
    l.revoked_by,
    l.revocation_reason,
    case
      when l.revoked_at is not null then 'revoked'
      when l.expires_at <= now() then 'expired'
      else 'active'
    end as status
  from public.profile_share_links l
  where p_profile_id is null or l.profile_id = p_profile_id
  order by l.created_at desc;
$$;

revoke all on function public.admin_list_profile_share_links(uuid) from public;
revoke all on function public.admin_list_profile_share_links(uuid) from anon;
revoke all on function public.admin_list_profile_share_links(uuid) from authenticated;
grant execute on function public.admin_list_profile_share_links(uuid) to service_role;
