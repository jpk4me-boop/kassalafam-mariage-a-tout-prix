-- =============================================================================
-- KASSALAFAM — MARIAGE À TOUT PRIX
-- Migration : pseudo affiché du membre (§5.4 — décision actée)
-- Date      : 2026-08-03
--
-- Objet     : le pseudo remplace le prénom PARTOUT où un autre membre ou le
--             public voit le profil (une application partielle ferait fuiter
--             le vrai prénom). Tant que le pseudo est NULL, le prénom reste
--             affiché (repli DOUX — aucun profil historique n'est dégradé).
--
--             1. Colonne `profiles.pseudo` : facultative, NON unique,
--                librement modifiable (hors verrou d'identité), CHECK 2..30
--                après trim.
--             2. Remplacement de l'expression du nom affiché dans les QUATRE
--                fonctions qui projettent `first_name` vers d'autres membres
--                ou le public — reproduites À L'IDENTIQUE de leurs définitions
--                courantes (pg_get_functiondef relevé le 03/08), signatures et
--                noms de colonnes de sortie CONSERVÉS (zéro changement client) :
--                  - discover_candidates            (découverte)
--                  - list_my_relationships          (relations → messagerie,
--                                                    favoris, visiteurs)
--                  - get_public_candidate_showcase  (vitrine, fiche)
--                  - list_public_candidate_showcases(vitrine, liste)
--                Expression : coalesce(nullif(btrim(pseudo), ''), first_name).
--
--             Les RPC de résolution /p et /promo ne renvoient que des IDs :
--             la projection du nom y est faite côté code serveur
--             (public-profile-share.ts, public-profile-promotion.ts) — mêmes
--             repli et livraison dans la même PR.
--
--             L'ADMINISTRATION continue de voir le vrai prénom et le vrai nom
--             (fiche membre, listes, relance) : aucune fonction admin touchée.
--
-- Sécurité  : - Migration ADDITIVE et NON destructive. AUCUNE reprise de
--               données, AUCUN backfill.
--             - Aucune policy RLS modifiée : les policies *_own couvrent la
--               nouvelle colonne (écriture owner-only).
--             - CREATE OR REPLACE conserve les privilèges (ACL) existants des
--               fonctions : aucun GRANT/REVOKE modifié ici.
--             - CHECK : chaîne vide ou blanche rejetée ; NULL toujours permis.
--             - Idempotente : ADD COLUMN IF NOT EXISTS ; DROP CONSTRAINT IF
--               EXISTS + ADD ; CREATE OR REPLACE FUNCTION.
--
-- ⚠️ À NE PAS appliquer automatiquement : attendre le GO explicite.
--    Ne PAS exécuter `supabase db push` ni toucher la base Production.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Colonne (nullable, additive, sans default, NON unique) -------------------
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists pseudo text;

comment on column public.profiles.pseudo is
  'Pseudo affiché aux autres membres et au public À LA PLACE du prénom dès '
  'qu''il est renseigné (repli sur first_name sinon). Facultatif, NON unique, '
  'librement modifiable par le membre. L''administration continue de voir le '
  'vrai prénom et le vrai nom.';

-- ---------------------------------------------------------------------------
-- 2. Contrainte de domaine (NULL permis ; vide/blanc rejeté ; 2..30 après trim)
-- ---------------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_pseudo_len;
alter table public.profiles add constraint profiles_pseudo_len
  check (
    pseudo is null
    or char_length(btrim(pseudo)) between 2 and 30
  );

-- ---------------------------------------------------------------------------
-- 3. Découverte — discover_candidates : REMPLACÉE à l'identique, seule
--    l'expression de `first_name` change (pseudo prioritaire).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.discover_candidates(p_universe text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, first_name text, age integer, city text, country text, marital_status text, intention text, discovery_universe text, has_photo boolean, is_blurred boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with viewer as (
    select
      v.id,
      v.gender,
      v.verification_status,
      v.account_status
    from public.profiles v
    where v.id = (select auth.uid())
  )
  select
    c.id,
    -- Pseudo affiché (§5.4) : remplace le prénom dès qu'il est renseigné.
    coalesce(nullif(btrim(c.pseudo), ''), c.first_name) as first_name,
    date_part('year', age(c.birth_date))::int as age,
    c.city,
    c.country,
    c.marital_status,
    c.intention,
    c.discovery_universe,
    exists (
      select 1
      from public.photos ph
      where ph.profile_id = c.id
        and ph.is_primary
    ) as has_photo,
    c.blur_photos as is_blurred
  from public.profiles c
  cross join viewer vw
  where (select auth.uid()) is not null
    and vw.account_status = 'active'::public.account_status
    and vw.verification_status = 'approved'
    and vw.gender is not null
    and p_universe in (
      'christian_marriage',
      'islamic_marriage',
      'open_marriage'
    )
    and c.account_status = 'active'::public.account_status
    and c.verification_status = 'approved'
    and c.id <> (select auth.uid())
    and c.gender = (
      case vw.gender
        when 'homme' then 'femme'
        else 'homme'
      end
    )::public.gender
    and c.discovery_universe = p_universe
    and not public.blocking_exists((select auth.uid()), c.id)
    and c.first_name is not null
    and btrim(c.first_name) <> ''
    and c.gender is not null
    and c.birth_date is not null
  order by
    public.profile_has_active_premium(c.id) desc,
    has_photo desc,
    c.created_at desc,
    c.id
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0);
$function$;

-- ---------------------------------------------------------------------------
-- 4. Relations — list_my_relationships : REMPLACÉE à l'identique, seule
--    l'expression de `first_name` change. Couvre par ricochet la messagerie,
--    les favoris et les visiteurs (tous lisent cette RPC).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_my_relationships()
 RETURNS TABLE(match_id uuid, other_id uuid, kind text, status text, first_name text, age integer, city text, country text, marital_status text, intention text, has_photo boolean, is_blurred boolean, last_message_content text, last_message_at timestamp with time zone, unread_count integer, blocked_by_me boolean, messaging_available boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    m.id as match_id,
    o.id as other_id,
    (case
      when m.status = 'accepted' then 'matched'
      when m.user_b = (select auth.uid()) then 'received'
      else 'sent'
    end)::text as kind,
    m.status::text as status,
    -- Pseudo affiché (§5.4) : remplace le prénom dès qu'il est renseigné.
    coalesce(nullif(btrim(o.pseudo), ''), o.first_name) as first_name,
    date_part('year', age(o.birth_date))::int as age,
    o.city,
    o.country,
    o.marital_status,
    o.intention,
    exists (
      select 1
      from public.photos ph
      where ph.profile_id = o.id
        and ph.is_primary
    ) as has_photo,
    o.blur_photos as is_blurred,
    lm.content as last_message_content,
    lm.created_at as last_message_at,
    coalesce((
      select count(*)
      from public.messages msg
      where msg.match_id = m.id
        and msg.sender_id <> (select auth.uid())
        and msg.read_at is null
    ), 0)::int as unread_count,
    exists (
      select 1
      from public.profile_blocks b
      where b.blocker_id = (select auth.uid())
        and b.blocked_id = o.id
    ) as blocked_by_me,
    (
      m.status = 'accepted'
      and not public.blocking_exists((select auth.uid()), o.id)
    ) as messaging_available
  from public.matches m
  join public.profiles o
    on o.id = case
                when m.user_a = (select auth.uid()) then m.user_b
                else m.user_a
              end
  left join lateral (
    select msg.content, msg.created_at
    from public.messages msg
    where msg.match_id = m.id
    order by msg.created_at desc
    limit 1
  ) lm on true
  where (select auth.uid()) is not null
    and public.current_account_is_not_suspended()
    and (m.user_a = (select auth.uid()) or m.user_b = (select auth.uid()))
    and m.status in ('pending', 'accepted')
    and o.account_status = 'active'::public.account_status
    and o.verification_status = 'approved'
    and o.first_name is not null
    and btrim(o.first_name) <> ''
    and o.birth_date is not null
  order by m.updated_at desc, m.id;
$function$;

-- ---------------------------------------------------------------------------
-- 5. Vitrine (fiche) — get_public_candidate_showcase : REMPLACÉE à
--    l'identique, seule l'expression du nom change.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_public_candidate_showcase(p_slug text)
 RETURNS TABLE(public_slug text, first_name text, age integer, city text, country text, discovery_universe text, marital_status text, intention text, bio text, partner_expectations text, published_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    p.public_slug,
    -- Pseudo affiché (§5.4) : remplace le prénom dès qu'il est renseigné.
    coalesce(
      nullif(pg_catalog.btrim(pr.pseudo), ''),
      pg_catalog.btrim(pr.first_name)
    ),
    extract(
      year from pg_catalog.age(current_date, pr.birth_date)
    )::integer as age,
    pg_catalog.btrim(pr.city),
    pg_catalog.btrim(pr.country),
    pr.discovery_universe,
    pr.marital_status,
    pr.intention,
    pg_catalog.left(pg_catalog.btrim(pr.bio), 600),
    pg_catalog.left(pg_catalog.btrim(pr.partner_expectations), 600),
    p.published_at,
    greatest(p.updated_at, pr.updated_at, ph.updated_at) as updated_at
  from public.candidate_showcase_publications p
  join public.profiles pr on pr.id = p.profile_id
  join public.photos ph on ph.id = p.selected_photo_id
  where p_slug ~ '^[A-Za-z0-9_-]{22}$'
    and p.public_slug = p_slug
    and p.listing_enabled
    and public.candidate_showcase_eligibility_reason(
      p.profile_id,
      p.selected_photo_id
    ) = 'eligible'
  limit 1;
$function$;

-- ---------------------------------------------------------------------------
-- 6. Vitrine (liste) — list_public_candidate_showcases : REMPLACÉE à
--    l'identique, seule l'expression du nom change.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_public_candidate_showcases(p_limit integer DEFAULT 24, p_offset integer DEFAULT 0)
 RETURNS TABLE(public_slug text, first_name text, age integer, city text, country text, discovery_universe text, marital_status text, published_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    p.public_slug,
    -- Pseudo affiché (§5.4) : remplace le prénom dès qu'il est renseigné.
    coalesce(
      nullif(pg_catalog.btrim(pr.pseudo), ''),
      pg_catalog.btrim(pr.first_name)
    ),
    extract(
      year from pg_catalog.age(current_date, pr.birth_date)
    )::integer as age,
    pg_catalog.btrim(pr.city),
    pg_catalog.btrim(pr.country),
    pr.discovery_universe,
    pr.marital_status,
    p.published_at,
    greatest(p.updated_at, pr.updated_at, ph.updated_at) as updated_at
  from public.candidate_showcase_publications p
  join public.profiles pr on pr.id = p.profile_id
  join public.photos ph on ph.id = p.selected_photo_id
  where p.listing_enabled
    and public.candidate_showcase_eligibility_reason(
      p.profile_id,
      p.selected_photo_id
    ) = 'eligible'
  order by p.published_at desc, p.public_slug
  limit greatest(
    1,
    least(coalesce(p_limit, 24), 48)
  )
  offset greatest(coalesce(p_offset, 0), 0);
$function$;
