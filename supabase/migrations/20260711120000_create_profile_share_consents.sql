-- =============================================================================
-- KASSALAFAM — MARIAGE À TOUT PRIX
-- Migration : consentement du membre au partage public limité (PR1 partage)
-- Date      : 2026-07-11
--
-- Objet     : créer public.profile_share_consents, l'historique HORODATÉ des
--             autorisations données par un membre pour la publication d'une
--             présentation limitée de son profil (future fonctionnalité de
--             partage par l'administrateur). Cette PR ne crée AUCUN lien
--             public : uniquement le consentement, préalable non contournable.
--
-- Modèle    : - une ligne par consentement donné ; le retrait NE SUPPRIME PAS
--               la ligne (withdrawn_at/withdrawn_by), l'historique est conservé ;
--             - au plus UN consentement ACTIF par profil (index unique partiel
--               sur withdrawn_at IS NULL) ; re-consentir après retrait crée une
--               NOUVELLE ligne ;
--             - le texte et la version du consentement sont définis CÔTÉ
--               SERVEUR (constantes de la RPC) — jamais fournis par le client.
--
-- Sécurité  : - RLS activée : le membre authentifié ne LIT que ses propres
--               lignes ; AUCUNE policy INSERT/UPDATE/DELETE → toute écriture
--               directe cliente est refusée ;
--             - privilèges de table réduits à SELECT pour authenticated,
--               RIEN pour anon : même sans RLS, aucune écriture directe n'est
--               possible ;
--             - écritures EXCLUSIVEMENT via deux RPC SECURITY DEFINER
--               (search_path verrouillé, identité = auth.uid(), jamais de
--               profile_id fourni par le client) ;
--             - migration additive : aucune colonne ajoutée à profiles,
--               aucune policy existante modifiée, aucune donnée touchée.
--
-- ⚠️ À NE PAS appliquer automatiquement : attendre le GO explicite.
--    Ne PAS exécuter `supabase db push` ni toucher la base Production.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Table public.profile_share_consents --------------------------------------
-- ---------------------------------------------------------------------------
create table if not exists public.profile_share_consents (
  id             uuid primary key default gen_random_uuid(),
  profile_id     uuid not null references public.profiles(id) on delete cascade,
  policy_version text not null,
  consent_text   text not null,
  consented_at   timestamptz not null default now(),
  withdrawn_at   timestamptz,
  withdrawn_by   uuid,
  created_at     timestamptz not null default now(),

  -- Un retrait ne peut pas précéder le consentement qu'il retire.
  constraint profile_share_consents_withdrawn_after_consent
    check (withdrawn_at is null or withdrawn_at >= consented_at),

  -- Cohérence retrait : horodatage et auteur du retrait vont ensemble.
  constraint profile_share_consents_withdrawn_coherence
    check ((withdrawn_at is null) = (withdrawn_by is null))
);

-- Au plus UN consentement actif par profil. L'historique (lignes retirées)
-- peut contenir plusieurs lignes pour le même profil.
create unique index if not exists profile_share_consents_one_active
  on public.profile_share_consents (profile_id)
  where withdrawn_at is null;

-- Lecture de l'historique d'un profil (et jointures futures des liens).
create index if not exists profile_share_consents_profile_idx
  on public.profile_share_consents (profile_id, consented_at desc);

-- ---------------------------------------------------------------------------
-- 2. RLS : lecture de SES lignes uniquement ; aucune écriture directe ---------
--    Pas de policy INSERT/UPDATE/DELETE : RLS refuse par défaut ces commandes.
-- ---------------------------------------------------------------------------
alter table public.profile_share_consents enable row level security;

drop policy if exists profile_share_consents_select_own
  on public.profile_share_consents;
create policy profile_share_consents_select_own
  on public.profile_share_consents
  for select
  to authenticated
  using (profile_id = (select auth.uid()));

-- Privilèges de table minimaux : SELECT seul pour authenticated (la RLS
-- restreint ensuite aux lignes du membre). Aucun droit pour anon. Aucune
-- écriture directe possible pour un rôle client, quel que soit l'état RLS.
revoke all on table public.profile_share_consents from public;
revoke all on table public.profile_share_consents from anon;
revoke all on table public.profile_share_consents from authenticated;
grant select on table public.profile_share_consents to authenticated;

-- ---------------------------------------------------------------------------
-- 3. RPC public.grant_my_profile_share_consent() ------------------------------
--    UNIQUE chemin de création d'un consentement. Idempotente : si un
--    consentement ACTIF existe déjà, le retourne sans créer de doublon.
--    Texte + version DÉFINIS ICI, côté serveur — le client n'envoie rien.
--    Retour : la ligne active (créée ou existante) + indicateur de réutilisation.
-- ---------------------------------------------------------------------------
create or replace function public.grant_my_profile_share_consent()
returns table (
  consent_id uuid,
  policy_version text,
  consented_at timestamptz,
  was_already_active boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  -- Version et texte OFFICIELS du consentement — source de vérité serveur.
  v_version constant text := '2026-07-v1';
  v_text    constant text :=
    'J’autorise KASSALAFAM à publier et partager une présentation limitée de mon profil à des fins de mise en relation matrimoniale.';
  v_row  public.profile_share_consents%rowtype;
begin
  -- 1. Authentification obligatoire.
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- 2. Le profil du membre doit exister ; son verrou sérialise les appels
  --    concurrents du même membre (aucun doublon possible en course, en plus
  --    de l'index unique partiel qui reste le filet de sécurité final).
  perform 1 from public.profiles where id = v_uid for update;
  if not found then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;

  -- 3. Consentement déjà actif : on le retourne tel quel (idempotence).
  select * into v_row
    from public.profile_share_consents c
    where c.profile_id = v_uid
      and c.withdrawn_at is null;

  if found then
    return query
      select v_row.id, v_row.policy_version, v_row.consented_at, true;
    return;
  end if;

  -- 4. Nouveau consentement (nouvelle ligne : l'historique reste intact).
  insert into public.profile_share_consents (profile_id, policy_version, consent_text)
  values (v_uid, v_version, v_text)
  returning * into v_row;

  return query
    select v_row.id, v_row.policy_version, v_row.consented_at, false;
end;
$$;

revoke all on function public.grant_my_profile_share_consent() from public;
revoke all on function public.grant_my_profile_share_consent() from anon;
grant execute on function public.grant_my_profile_share_consent() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. RPC public.withdraw_my_profile_share_consent() ---------------------------
--    UNIQUE chemin de retrait. Idempotente : sans consentement actif, ne fait
--    rien et retourne false. Ne supprime JAMAIS de ligne. Ne touche à aucune
--    autre table (les liens de partage n'existent pas encore — la révocation
--    en cascade des liens sera ajoutée par la PR backend des liens).
--    Retour : true si un consentement actif vient d'être retiré.
-- ---------------------------------------------------------------------------
create or replace function public.withdraw_my_profile_share_consent()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_count integer;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  update public.profile_share_consents
    set withdrawn_at = now(),
        withdrawn_by = v_uid
    where profile_id = v_uid
      and withdrawn_at is null;

  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

revoke all on function public.withdraw_my_profile_share_consent() from public;
revoke all on function public.withdraw_my_profile_share_consent() from anon;
grant execute on function public.withdraw_my_profile_share_consent() to authenticated;
