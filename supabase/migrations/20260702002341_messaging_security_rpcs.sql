-- L3E-PR1 — Sécurisation de la messagerie (backend only).
--
-- La table public.messages et son helper public.is_match_participant existent
-- depuis le schéma cœur (20260627000000). PROBLÈME : is_match_participant ignore
-- le statut du match, si bien que les RLS actuelles de messages autorisent la
-- lecture ET l'écriture sur des matches 'pending' (intérêt non mutuel) et même
-- 'rejected'. Cela contredit la règle L3E : seuls deux membres AVEC UN MATCH
-- ACCEPTÉ peuvent converser.
--
-- Cette migration (additive, ne touche AUCUNE autre table) :
--   1. ajoute public.can_message(p_match_id) : participant ET status='accepted' ;
--   2. remplace la policy SELECT de messages par une policy « accepted-only »
--      basée sur can_message ;
--   3. supprime les policies d'écriture DIRECTE (INSERT/UPDATE) de messages —
--      alignement sur le durcissement PR3 des matches : RPC = seul chemin d'écriture ;
--   4. ajoute un index messages(match_id, created_at) pour paginer/ordonner le fil ;
--   5. ajoute trois RPC SECURITY DEFINER gardées par can_message :
--        - send_message(p_match, p_content)         -> ligne message insérée ;
--        - get_conversation_messages(p_match)        -> messages ordonnés ;
--        - mark_conversation_read(p_match)           -> read_at sur les REÇUS.
--
-- Ne crée PAS de table conversations (le match accepté EST la conversation).
-- Pas de Realtime, pas d'IA/modération, pas de notification, pas d'UI. Ne modifie
-- ni discover_candidates, ni express_interest, ni respond_to_interest, ni photos.

-- ---------------------------------------------------------------------------
-- 1. Helper : l'appelant est-il participant d'un match ACCEPTÉ ?
--    (durcit is_match_participant en ajoutant la contrainte status='accepted'.)
-- ---------------------------------------------------------------------------
create or replace function public.can_message(p_match_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.matches m
    where m.id = p_match_id
      and m.status = 'accepted'
      and (m.user_a = (select auth.uid()) or m.user_b = (select auth.uid()))
  );
$$;

revoke all on function public.can_message(uuid) from public;
revoke all on function public.can_message(uuid) from anon;
grant execute on function public.can_message(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Lecture resserrée : uniquement les matches acceptés.
--    Remplace messages_select_participants (basée sur is_match_participant,
--    qui autorisait pending/rejected) par une policy accepted-only.
-- ---------------------------------------------------------------------------
drop policy if exists "messages_select_participants" on public.messages;
drop policy if exists "messages_select_accepted" on public.messages;
create policy "messages_select_accepted"
  on public.messages for select
  to authenticated
  using (public.can_message(match_id));

-- ---------------------------------------------------------------------------
-- 3. Suppression des écritures DIRECTES (RPC = seul chemin d'écriture),
--    cohérent avec le durcissement des matches en L3D-B PR3.
-- ---------------------------------------------------------------------------
drop policy if exists "messages_insert_participant" on public.messages;
drop policy if exists "messages_update_participants" on public.messages;

-- ---------------------------------------------------------------------------
-- 4. Index de support : lecture/pagination du fil par match, ordonnée par date.
-- ---------------------------------------------------------------------------
create index if not exists messages_match_created_idx
  on public.messages (match_id, created_at);

-- ---------------------------------------------------------------------------
-- 5a. RPC send_message : UNIQUE chemin d'envoi.
--     Refuse si non authentifié ou si le match n'est pas accepté / non participant.
--     Trim + longueur 1..4000. Force sender_id = auth.uid(). Remonte le fil
--     (matches.updated_at) pour l'ordre des conversations. Retourne la ligne.
-- ---------------------------------------------------------------------------
create or replace function public.send_message(
  p_match uuid,
  p_content text
)
returns public.messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_clean text;
  v_row public.messages%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Garde : participant d'un match ACCEPTÉ (réponse générique, ne révèle rien).
  if not public.can_message(p_match) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  v_clean := btrim(coalesce(p_content, ''));
  if char_length(v_clean) < 1 or char_length(v_clean) > 4000 then
    raise exception 'invalid content' using errcode = '22023';
  end if;

  insert into public.messages (match_id, sender_id, content)
    values (p_match, v_uid, v_clean)
    returning * into v_row;

  -- Remonte la conversation en tête de liste (ordre par matches.updated_at).
  update public.matches
    set updated_at = now()
    where id = p_match;

  return v_row;
end
$$;

revoke all on function public.send_message(uuid, text) from public;
revoke all on function public.send_message(uuid, text) from anon;
grant execute on function public.send_message(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5b. RPC get_conversation_messages : lecture ordonnée du fil d'un match accepté.
--     Redondante avec la RLS SELECT mais fournit un chemin explicite et garde
--     can_message (refus net si non éligible), pratique pour la future UI.
-- ---------------------------------------------------------------------------
create or replace function public.get_conversation_messages(
  p_match uuid
)
returns setof public.messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not public.can_message(p_match) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  return query
    select *
    from public.messages
    where match_id = p_match
    order by created_at asc, id asc;
end
$$;

revoke all on function public.get_conversation_messages(uuid) from public;
revoke all on function public.get_conversation_messages(uuid) from anon;
grant execute on function public.get_conversation_messages(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5c. RPC mark_conversation_read : marque comme lus les messages REÇUS.
--     Ne touche jamais le contenu ; n'affecte que read_at des messages dont
--     l'appelant n'est PAS l'expéditeur (donc les messages qu'il a reçus) et
--     encore non lus. Retourne le nombre de messages marqués.
-- ---------------------------------------------------------------------------
create or replace function public.mark_conversation_read(
  p_match uuid
)
returns integer
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
  if not public.can_message(p_match) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  update public.messages
    set read_at = now()
    where match_id = p_match
      and sender_id <> v_uid
      and read_at is null;

  get diagnostics v_count = row_count;
  return v_count;
end
$$;

revoke all on function public.mark_conversation_read(uuid) from public;
revoke all on function public.mark_conversation_read(uuid) from anon;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
