-- L3E-PR3 — Polish messagerie léger : aperçu du dernier message + non-lus.
--
-- Enrichit UNIQUEMENT la RPC de lecture `public.list_my_relationships()` avec
-- trois colonnes additionnelles, sans créer de table, sans Realtime, sans
-- notifications, et sans toucher aux tables / RLS / chemins d'écriture existants :
--
--   - last_message_content : contenu du dernier message du fil (ou NULL) ;
--   - last_message_at       : horodatage du dernier message (ou NULL) ;
--   - unread_count          : nombre de messages REÇUS non lus (sender <> moi,
--                             read_at IS NULL). Toujours >= 0.
--
-- Justification du choix : la messagerie n'existe QUE sur les matches 'accepted'
-- (garde can_message + RLS messages_select_accepted, cf L3E-PR1) ; la table
-- messages ne contient donc jamais de ligne pour un match 'pending'. Les trois
-- colonnes valent donc naturellement NULL / 0 pour les relations 'received' /
-- 'sent', sans filtre supplémentaire.
--
-- Sécurité : la fonction reste SECURITY DEFINER et n'expose que des fils dont
-- l'appelant est participant (jointure sur m.id d'un match où il est user_a/user_b).
-- Le contenu du dernier message est déjà lisible par l'appelant via
-- get_conversation_messages : aucune nouvelle surface d'exposition.
--
-- Perf : réutilise l'index existant messages(match_id, created_at) (L3E-PR1)
-- pour le LATERAL (dernier message) et le comptage. Aucun nouvel index requis.
--
-- Compatibilité : changement PUREMENT ADDITIF côté client (colonnes ajoutées en
-- fin de projection, ordre inchangé). Le code déployé qui lit les 12 colonnes
-- d'origine continue de fonctionner (colonnes supplémentaires ignorées). Côté
-- base, changer le type de retour d'une fonction TABLE impose un DROP préalable
-- (CREATE OR REPLACE refuse un nouveau type de retour) ; le DROP + CREATE est
-- exécuté dans la même transaction de migration, sans fenêtre d'indisponibilité.

drop function if exists public.list_my_relationships();

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
  is_blurred boolean,
  last_message_content text,
  last_message_at timestamptz,
  unread_count int
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
    o.blur_photos as is_blurred,
    lm.content as last_message_content,
    lm.created_at as last_message_at,
    coalesce((
      select count(*)
      from public.messages msg
      where msg.match_id = m.id
        and msg.sender_id <> (select auth.uid())
        and msg.read_at is null
    ), 0)::int as unread_count
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
