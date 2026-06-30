-- L3D-B PR1 — Socle sécurisé de lecture des candidats de découverte.
--
-- Crée la RPC public.discover_candidates (SECURITY DEFINER) : UNIQUE chemin de
-- lecture inter-profils, curé et filtré. AUCUNE policy RLS n'est modifiée ici :
--   - public.profiles        reste owner-only
--   - public.photos          reste owner-only
--   - storage.objects        reste owner-only (bucket privé profile-photos)
--
-- La fonction s'exécute en SECURITY DEFINER (elle contourne donc la RLS pour
-- LIRE les profils/photos), mais :
--   - n'accepte AUCUN identifiant de viewer en paramètre ; elle n'utilise que
--     auth.uid() en interne ;
--   - ne renvoie QUE des colonnes sûres (voir RETURNS TABLE) ; elle ne renvoie
--     JAMAIS birth_date, storage_path, verification_*, email, bio,
--     partner_expectations ;
--   - applique des gardes strictes : viewer authentifié + approved + genre
--     connu, sinon 0 ligne (jamais d'erreur).
--
-- Décisions v1 : cloisonnement strict par univers (égalité), MVP hétéro
-- (homme voit femme / femme voit homme), valeurs canoniques d'univers
-- (christian_marriage | islamic_marriage | open_marriage).

-- ---------------------------------------------------------------------------
-- Index de support (additifs, idempotents).
-- ---------------------------------------------------------------------------
create index if not exists idx_profiles_discovery
  on public.profiles (discovery_universe, gender, verification_status);

create index if not exists idx_photos_primary
  on public.photos (profile_id)
  where is_primary;

-- ---------------------------------------------------------------------------
-- RPC de découverte.
-- ---------------------------------------------------------------------------
create or replace function public.discover_candidates(
  p_universe text,
  p_limit int default 20,
  p_offset int default 0
)
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
  is_blurred boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with viewer as (
    select v.id, v.gender, v.verification_status
    from public.profiles v
    where v.id = (select auth.uid())
  )
  select
    c.id,
    c.first_name,
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
  where
    -- Gardes viewer : authentifié, approuvé, genre connu (sinon 0 ligne).
    (select auth.uid()) is not null
    and vw.verification_status = 'approved'
    and vw.gender is not null
    -- Univers valide uniquement (sinon 0 ligne).
    and p_universe in ('christian_marriage', 'islamic_marriage', 'open_marriage')
    -- Filtres candidats.
    and c.verification_status = 'approved'
    and c.id <> (select auth.uid())
    and c.gender = (case vw.gender when 'homme' then 'femme' else 'homme' end)::public.gender
    and c.discovery_universe = p_universe
    -- Profil suffisamment complet.
    and c.first_name is not null
    and btrim(c.first_name) <> ''
    and c.gender is not null
    and c.birth_date is not null
  order by c.is_premium desc, has_photo desc, c.created_at desc, c.id
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

-- ---------------------------------------------------------------------------
-- Droits d'exécution : réservés aux membres authentifiés.
-- ---------------------------------------------------------------------------
revoke all on function public.discover_candidates(text, int, int) from public;
revoke all on function public.discover_candidates(text, int, int) from anon;
grant execute on function public.discover_candidates(text, int, int) to authenticated;
