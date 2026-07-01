-- L3D-C — Flux « Intérêts reçus / envoyés / Matches acceptés ».
--
-- Ajoute DEUX RPC SECURITY DEFINER, sans modifier aucune table ni aucune RLS
-- existante (les fondations L3D-A / L3D-B restent intactes) :
--
--   1. public.respond_to_interest(p_match, p_decision) — UNIQUE chemin pour
--      répondre à un intérêt reçu. Seule la CIBLE de l'intérêt (matches.user_b,
--      c.-à-d. auth.uid()) peut répondre, et seulement tant que le match est
--      « pending ». Comme express_interest écrit toujours user_a = initiateur et
--      user_b = cible, cette garde empêche NATIVEMENT l'auteur d'un intérêt
--      d'accepter/refuser le sien (il est user_a, jamais user_b).
--
--   2. public.list_my_relationships() — lecture curée et sans fuite des relations
--      de l'appelant, classées en 'received' | 'sent' | 'matched'. Ne renvoie que
--      des champs sûrs de l'AUTRE membre (jamais birth_date, storage_path,
--      verification_*, email, bio, partner_expectations). Les paires 'rejected'
--      ne sont JAMAIS renvoyées (on n'expose pas un profil rejeté / une décision).
--
-- Rappels d'état (déjà en base, non modifiés) :
--   - matches : CHECK (user_a <> user_b), index unique matches_unique_pair,
--     RLS matches_select_participants CONSERVÉE ;
--   - les policies d'INSERT / UPDATE directes sur matches ont été supprimées en
--     PR3 : toute écriture passe désormais par une RPC contrôlée. respond_to_interest
--     devient donc le SEUL chemin de mise à jour du statut d'un match.
--
-- Ne crée PAS de messagerie, pas d'IA, pas de paiement.

-- ---------------------------------------------------------------------------
-- Index de support (additif, idempotent) : accélère la lecture des relations
-- de l'appelant filtrées par statut, dans les deux sens (user_a / user_b).
-- ---------------------------------------------------------------------------
create index if not exists idx_matches_user_a_status
  on public.matches (user_a, status);
create index if not exists idx_matches_user_b_status
  on public.matches (user_b, status);

-- ---------------------------------------------------------------------------
-- RPC respond_to_interest.
-- Retour : statut résultant du match ('accepted' | 'rejected').
-- Idempotent côté UX : si le match n'est plus 'pending', renvoie le statut
-- courant SANS erreur (une 2e réponse est donc un no-op contrôlé).
-- ---------------------------------------------------------------------------
create or replace function public.respond_to_interest(
  p_match uuid,
  p_decision text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.matches%rowtype;
begin
  -- Authentification.
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Décision valide uniquement.
  if p_decision not in ('accepted', 'rejected') then
    raise exception 'invalid decision' using errcode = '22023';
  end if;

  -- Lecture de la ligne (SECURITY DEFINER : contourne la RLS pour la garde).
  select * into v_row
    from public.matches
    where id = p_match;

  -- Non trouvé OU l'appelant n'est pas la CIBLE (user_b) : même réponse
  -- générique, pour ne pas révéler l'existence d'un match qui ne le concerne pas.
  -- (user_b = cible => seul le destinataire répond ; l'auteur = user_a est exclu.)
  if not found or v_row.user_b is distinct from v_uid then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  -- Idempotence : déjà répondu (ou paire rejetée) => renvoie l'état courant.
  if v_row.status <> 'pending' then
    return v_row.status::text;
  end if;

  -- Transition pending -> accepted|rejected (garde status='pending' pour éviter
  -- toute course concurrente).
  update public.matches
    set status = p_decision::public.match_status,
        updated_at = now()
    where id = p_match
      and status = 'pending';

  return p_decision;
end
$$;

revoke all on function public.respond_to_interest(uuid, text) from public;
revoke all on function public.respond_to_interest(uuid, text) from anon;
grant execute on function public.respond_to_interest(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC list_my_relationships.
-- Renvoie 0..N lignes décrivant les relations de l'appelant. `kind` :
--   - 'received' : intérêt entrant en attente (user_b = moi, pending) ;
--   - 'sent'     : intérêt sortant en attente (user_a = moi, pending) ;
--   - 'matched'  : intérêt mutuel (status = accepted, quel que soit l'initiateur).
-- Les paires 'rejected' sont exclues. L'AUTRE membre doit être 'approved'
-- (cohérent avec discover_candidates : jamais de profil non vérifié exposé).
-- ---------------------------------------------------------------------------
create or replace function public.list_my_relationships()
returns table (
  match_id uuid,
  other_id uuid,
  kind text,
  status text,
  first_name text,
  age int,
  city text,
  country text,
  marital_status text,
  intention text,
  has_photo boolean,
  is_blurred boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    m.id as match_id,
    o.id as other_id,
    (case
      when m.status = 'accepted' then 'matched'
      when m.user_b = (select auth.uid()) then 'received'
      else 'sent'
    end)::text as kind,
    m.status::text as status,
    o.first_name,
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
    o.blur_photos as is_blurred
  from public.matches m
  join public.profiles o
    on o.id = case
                when m.user_a = (select auth.uid()) then m.user_b
                else m.user_a
              end
  where (select auth.uid()) is not null
    and (m.user_a = (select auth.uid()) or m.user_b = (select auth.uid()))
    and m.status in ('pending', 'accepted')
    and o.verification_status = 'approved'
    and o.first_name is not null
    and btrim(o.first_name) <> ''
    and o.birth_date is not null
  order by m.updated_at desc, m.id;
$$;

revoke all on function public.list_my_relationships() from public;
revoke all on function public.list_my_relationships() from anon;
grant execute on function public.list_my_relationships() to authenticated;
