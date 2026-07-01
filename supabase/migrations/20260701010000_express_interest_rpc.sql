-- L3D-B PR3 — « Exprimer un intérêt ».
--
-- Crée la RPC public.express_interest (SECURITY DEFINER) : UNIQUE chemin
-- d'écriture d'un intérêt dans public.matches. Centralise tous les garde-fous
-- que ni la RLS ni un insert client ne peuvent assurer (cible approuvée / genre
-- opposé / même univers).
--
-- Durcissement RLS sur public.matches (aucune autre table touchée) :
--   - suppression de la policy d'INSERT directe (matches_insert_participant) ;
--   - suppression de la policy d'UPDATE directe (matches_update_participants) —
--     l'audit code confirme qu'aucun code ne fait d'insert/update direct de
--     matches ; tout changement de statut devra passer par des RPC contrôlées.
--   - CONSERVE matches_select_participants (les participants lisent leurs
--     propres relations).
--
-- Pré-requis DÉJÀ présents en base (non recréés) : CHECK (user_a <> user_b) et
-- l'index unique matches_unique_pair sur (LEAST(user_a,user_b),
-- GREATEST(user_a,user_b)) garantissant l'unicité de la paire non ordonnée.
--
-- Ne modifie PAS discover_candidates, ni les photos. Pas de messagerie, pas de
-- notification, pas de paiement.

-- ---------------------------------------------------------------------------
-- Retrait des policies d'écriture directe (RPC = seul chemin d'écriture).
-- ---------------------------------------------------------------------------
drop policy if exists matches_insert_participant on public.matches;
drop policy if exists matches_update_participants on public.matches;

-- ---------------------------------------------------------------------------
-- RPC express_interest.
-- Retour : 'created' | 'already' | 'matched'.
-- ---------------------------------------------------------------------------
create or replace function public.express_interest(
  p_target uuid,
  p_universe text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_gender public.gender;
  v_status public.profile_verification_status;
  v_existing public.matches%rowtype;
begin
  -- Garde viewer : authentifié, approuvé, genre connu.
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select gender, verification_status
    into v_gender, v_status
    from public.profiles
    where id = v_uid;

  if v_status is distinct from 'approved' or v_gender is null then
    raise exception 'viewer not eligible' using errcode = '42501';
  end if;

  -- Univers valide + pas de self.
  if p_universe not in ('christian_marriage', 'islamic_marriage', 'open_marriage') then
    raise exception 'invalid universe' using errcode = '22023';
  end if;
  if p_target = v_uid then
    raise exception 'self not allowed' using errcode = '22023';
  end if;

  -- Validation cible : mêmes prédicats que discover_candidates.
  if not exists (
    select 1
    from public.profiles c
    where c.id = p_target
      and c.verification_status = 'approved'
      and c.gender = (case v_gender when 'homme' then 'femme' else 'homme' end)::public.gender
      and c.discovery_universe = p_universe
      and c.first_name is not null
      and btrim(c.first_name) <> ''
      and c.birth_date is not null
  ) then
    raise exception 'invalid target' using errcode = '42501';
  end if;

  -- Existant sur la paire non ordonnée.
  select * into v_existing
    from public.matches
    where (user_a = v_uid and user_b = p_target)
       or (user_a = p_target and user_b = v_uid)
    limit 1;

  if not found then
    -- Aucune relation : on crée l'intérêt (viewer -> target).
    begin
      insert into public.matches (user_a, user_b, status)
        values (v_uid, p_target, 'pending');
      return 'created';
    exception when unique_violation then
      -- Course concurrente : une ligne vient d'être créée ; on relit.
      select * into v_existing
        from public.matches
        where (user_a = v_uid and user_b = p_target)
           or (user_a = p_target and user_b = v_uid)
        limit 1;
    end;
  end if;

  -- Relation existante (initiale ou issue de la course concurrente).
  if v_existing.status = 'accepted' then
    return 'matched';
  elsif v_existing.status = 'rejected' then
    -- Ne pas recréer : retour contrôlé.
    return 'already';
  else
    -- pending
    if v_existing.user_a = v_uid then
      -- Le viewer a déjà exprimé cet intérêt.
      return 'already';
    else
      -- La cible avait déjà exprimé un intérêt vers le viewer -> mutuel.
      update public.matches
        set status = 'accepted', updated_at = now()
        where id = v_existing.id;
      return 'matched';
    end if;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Droits d'exécution : réservés aux membres authentifiés.
-- ---------------------------------------------------------------------------
revoke all on function public.express_interest(uuid, text) from public;
revoke all on function public.express_interest(uuid, text) from anon;
grant execute on function public.express_interest(uuid, text) to authenticated;
