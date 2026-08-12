-- =============================================================================
-- KASSALAFAM — MARIAGE À TOUT PRIX
-- Migration : Lot B — gating premium des SIGNAUX ENTRANTS
-- Date      : 2026-08-12
--
-- Objet     : réserver au Premium la lecture des signaux entrants (qui me
--             visite, qui m'ajoute en favori) AVANT l'ouverture des paiements,
--             sans jamais mentir au membre gratuit ni lui reprendre ce qui lui
--             appartient.
--
--             1) profiles.discreet_favorites : réglage membre, calqué sur
--                discreet_visits — mes ajouts en favori ne sont jamais révélés
--                à la personne concernée.
--             2) index member_favorites (target_profile_id, created_at desc) :
--                la table n'était indexée que dans le sens SORTANT.
--             3) count_profile_visitors() : compteur LIBRE (entier seul).
--             4) list_profile_visitors() : recréée, réservée au Premium.
--             5) count_favorited_by() : compteur LIBRE (entier seul).
--             6) list_favorited_by() : NOUVELLE, réservée au Premium —
--                c'est l'avantage « Vois qui t'ajoute en favori » annoncé sur
--                /premium et jamais livré jusqu'ici.
--
-- NON TOUCHÉ  : list_favorites() reste GRATUITE. Elle renvoie les profils que
--             le membre a lui-même enregistrés : c'est SA liste, pas un signal
--             entrant. La gater reviendrait à lui reprendre son propre contenu
--             sans livrer l'avantage vendu. Décision actée le 12/08.
--
-- Sécurité  : - Les quatre RPC sont SECURITY DEFINER, search_path fixé,
--               grants limités à authenticated (rien pour public/anon).
--             - Le garde premium est public.profile_has_active_premium(uuid),
--               SOURCE DE VÉRITÉ (teste status + starts_at + ends_at). La
--               colonne dénormalisée profiles.is_premium n'est JAMAIS utilisée
--               comme garde : elle peut être périmée entre deux synchros.
--               Le helper reste révoqué de authenticated — l'appel se fait
--               depuis le corps des fonctions propriétaires uniquement.
--             - Les listes gatées renvoient 0 LIGNE sans erreur quand le
--               membre n'est pas premium : l'interface s'appuie sur le
--               compteur libre pour afficher un état VERROUILLÉ, jamais un
--               faux « aucun visiteur ».
--             - Les compteurs ne renvoient QU'UN ENTIER : aucune donnée
--               personnelle, aucune identité, aucun horodatage.
--               ⚠️ Sur une base de petite taille, un compteur reste un signal
--               faible (savoir que « 1 personne » t'a ajouté n'anonymise pas
--               grand-chose s'il n'existe qu'une poignée de profils du genre
--               opposé). Assumé : le compteur ne nomme personne et le membre
--               dispose des deux réglages de discrétion pour se retirer.
--             - Discrétion respectée AUSSI dans les compteurs : un membre
--               discret ne doit pas être déductible d'un écart entre le
--               compteur et la liste.
--             - Revalidation de la visibilité à chaque lecture (profil
--               suspendu ou dé-approuvé : disparaît des listes ET des
--               compteurs). Règle pseudo appliquée partout.
--             - Idempotent (add column if not exists / create index if not
--               exists / create or replace).
--
-- ⚠️ À NE PAS appliquer automatiquement : attendre le GO explicite.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Réglage « favoris discrets » — librement éditable par le membre,
--    exactement comme discreet_visits et blur_photos.
--    Défaut false : AUCUN changement de comportement pour l'existant.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists discreet_favorites boolean not null default false;

comment on column public.profiles.discreet_favorites is
  'Favoris discrets : si true, les profils que ce membre ajoute en favori ne '
  'sont jamais révélés aux personnes concernées (ni dans la liste, ni dans le '
  'compteur). Le membre conserve sa propre liste de favoris.';

-- ---------------------------------------------------------------------------
-- 2) Index du sens ENTRANT. member_favorites_user_created_idx ne couvre que
--    le sens sortant (user_id) ; toute lecture par cible faisait un seq scan.
-- ---------------------------------------------------------------------------
create index if not exists member_favorites_target_created_idx
  on public.member_favorites (target_profile_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 3) count_profile_visitors() — LIBRE.
--    Mêmes prédicats que la liste (discrétion comprise), sans le plafond :
--    l'interface doit pouvoir annoncer un nombre exact.
-- ---------------------------------------------------------------------------
create or replace function public.count_profile_visitors()
returns int
language sql
stable
security definer
set search_path = ''
as $$
  with viewer as (
    select v.id, v.verification_status, v.account_status
    from public.profiles v
    where v.id = (select auth.uid())
  )
  select count(*)::int
  from public.profile_visits pv
  cross join viewer vw
  join public.profiles c on c.id = pv.visitor_id
  where
    pv.visited_profile_id = (select auth.uid())
    and (select auth.uid()) is not null
    and vw.verification_status = 'approved'
    and vw.account_status = 'active'::public.account_status
    and c.discreet_visits = false
    and c.verification_status = 'approved'
    and c.account_status = 'active'::public.account_status
    and c.first_name is not null
    and pg_catalog.btrim(c.first_name) <> ''
    and c.birth_date is not null;
$$;

revoke all on function public.count_profile_visitors() from public;
revoke all on function public.count_profile_visitors() from anon;
grant execute on function public.count_profile_visitors() to authenticated;

comment on function public.count_profile_visitors() is
  'Nombre de visiteurs visibles de MON profil. Libre (non premium) : sert à '
  'afficher un état verrouillé honnête plutôt qu''un faux « aucun visiteur ».';

-- ---------------------------------------------------------------------------
-- 4) list_profile_visitors() — RÉSERVÉE AU PREMIUM.
--    Signature et prédicats inchangés ; seul le garde premium est ajouté.
-- ---------------------------------------------------------------------------
create or replace function public.list_profile_visitors()
returns table (
  id uuid,
  first_name text,
  age int,
  city text,
  country text,
  marital_status text,
  intention text,
  discovery_universe text,
  has_photo boolean,
  is_blurred boolean,
  last_visited_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with viewer as (
    select v.id, v.verification_status, v.account_status
    from public.profiles v
    where v.id = (select auth.uid())
  )
  select
    c.id,
    coalesce(nullif(pg_catalog.btrim(c.pseudo), ''), c.first_name) as first_name,
    pg_catalog.date_part('year', pg_catalog.age(c.birth_date))::int as age,
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
    c.blur_photos as is_blurred,
    pv.last_visited_at
  from public.profile_visits pv
  cross join viewer vw
  join public.profiles c on c.id = pv.visitor_id
  where
    pv.visited_profile_id = (select auth.uid())
    and (select auth.uid()) is not null
    and vw.verification_status = 'approved'
    and vw.account_status = 'active'::public.account_status
    -- LOT B : avantage premium. 0 ligne sans erreur si l'abonnement est
    -- absent ou expiré — l'interface bascule sur l'état verrouillé.
    and public.profile_has_active_premium((select auth.uid()))
    -- Visites discrètes : jamais affichées (réglage ACTUEL du visiteur).
    and c.discreet_visits = false
    -- Revalidation du visiteur à chaque lecture.
    and c.verification_status = 'approved'
    and c.account_status = 'active'::public.account_status
    and c.first_name is not null
    and pg_catalog.btrim(c.first_name) <> ''
    and c.birth_date is not null
  order by pv.last_visited_at desc
  limit 100;
$$;

revoke all on function public.list_profile_visitors() from public;
revoke all on function public.list_profile_visitors() from anon;
grant execute on function public.list_profile_visitors() to authenticated;

comment on function public.list_profile_visitors() is
  'Visiteurs de MON profil — RÉSERVÉ AU PREMIUM (Lot B). Renvoie 0 ligne sans '
  'erreur si l''abonnement est absent ou expiré ; le compteur libre '
  'count_profile_visitors() porte l''état verrouillé.';

-- ---------------------------------------------------------------------------
-- 5) count_favorited_by() — LIBRE.
-- ---------------------------------------------------------------------------
create or replace function public.count_favorited_by()
returns int
language sql
stable
security definer
set search_path = ''
as $$
  with viewer as (
    select v.id, v.verification_status, v.account_status
    from public.profiles v
    where v.id = (select auth.uid())
  )
  select count(*)::int
  from public.member_favorites f
  cross join viewer vw
  join public.profiles c on c.id = f.user_id
  where
    f.target_profile_id = (select auth.uid())
    and (select auth.uid()) is not null
    and vw.verification_status = 'approved'
    and vw.account_status = 'active'::public.account_status
    and c.discreet_favorites = false
    and c.verification_status = 'approved'
    and c.account_status = 'active'::public.account_status
    and c.first_name is not null
    and pg_catalog.btrim(c.first_name) <> ''
    and c.birth_date is not null;
$$;

revoke all on function public.count_favorited_by() from public;
revoke all on function public.count_favorited_by() from anon;
grant execute on function public.count_favorited_by() to authenticated;

comment on function public.count_favorited_by() is
  'Nombre de membres m''ayant ajouté en favori, hors favoris discrets. Libre '
  '(non premium) : porte l''état verrouillé de la liste.';

-- ---------------------------------------------------------------------------
-- 6) list_favorited_by() — NOUVELLE, RÉSERVÉE AU PREMIUM.
--    C'est l'avantage « Vois qui t'ajoute en favori » annoncé sur /premium.
--    Même forme de retour que list_favorites (modèle carte + favorited_at)
--    afin de réutiliser le type FavoriteCandidate côté application.
-- ---------------------------------------------------------------------------
create or replace function public.list_favorited_by()
returns table (
  id uuid,
  first_name text,
  age int,
  city text,
  country text,
  marital_status text,
  intention text,
  discovery_universe text,
  has_photo boolean,
  is_blurred boolean,
  favorited_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with viewer as (
    select v.id, v.verification_status, v.account_status
    from public.profiles v
    where v.id = (select auth.uid())
  )
  select
    c.id,
    coalesce(nullif(pg_catalog.btrim(c.pseudo), ''), c.first_name) as first_name,
    pg_catalog.date_part('year', pg_catalog.age(c.birth_date))::int as age,
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
    c.blur_photos as is_blurred,
    f.created_at as favorited_at
  from public.member_favorites f
  cross join viewer vw
  join public.profiles c on c.id = f.user_id
  where
    f.target_profile_id = (select auth.uid())
    and (select auth.uid()) is not null
    and vw.verification_status = 'approved'
    and vw.account_status = 'active'::public.account_status
    -- LOT B : avantage premium.
    and public.profile_has_active_premium((select auth.uid()))
    -- Favoris discrets : jamais révélés (réglage ACTUEL de l'admirateur).
    and c.discreet_favorites = false
    -- Revalidation à chaque lecture.
    and c.verification_status = 'approved'
    and c.account_status = 'active'::public.account_status
    and c.first_name is not null
    and pg_catalog.btrim(c.first_name) <> ''
    and c.birth_date is not null
  order by f.created_at desc
  limit 100;
$$;

revoke all on function public.list_favorited_by() from public;
revoke all on function public.list_favorited_by() from anon;
grant execute on function public.list_favorited_by() to authenticated;

comment on function public.list_favorited_by() is
  'Membres m''ayant ajouté en favori — RÉSERVÉ AU PREMIUM (Lot B). Respecte '
  'discreet_favorites. Ne révèle QUE les champs sûrs du modèle carte : ni '
  'coordonnées, ni religion, ni email.';
