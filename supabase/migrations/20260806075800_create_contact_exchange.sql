-- =============================================================================
-- KASSALAFAM — MARIAGE À TOUT PRIX
-- Migration : échange MUTUEL de coordonnées, déclenché par un membre premium
-- Date      : 2026-08-06 (heure réelle du Cameroun)
--
-- Objet     : donner une valeur premium à l'accès au contact SANS jamais
--             divulguer le numéro de quelqu'un sans son accord.
--
--             Le premium achète le DROIT DE DEMANDER. Il n'achète ni le
--             numéro, ni le droit de recevoir, ni celui de répondre. Les deux
--             numéros ne se révèlent QUE si la personne sollicitée accepte, et
--             alors des DEUX côtés — symétrique par construction.
--
--             Deux des membres finalisés résident dans l'Union européenne et
--             au Québec (RGPD, Loi 25) : le consentement doit être explicite,
--             spécifique et révocable. Un paiement par un tiers ne peut pas en
--             tenir lieu.
--
-- Règles     : · demandeur premium UNIQUEMENT (profile_has_active_premium) ;
--              · 3 demandes par 24 h maximum ;
--              · une seule demande active par paire ;
--              · refus ⇒ verrou de 30 jours avant toute nouvelle demande ;
--              · révocation PAR LA PERSONNE SOLLICITÉE ⇒ verrou DÉFINITIF :
--                c'est l'insistance qui fait le harcèlement, pas le volume ;
--              · révocation par le demandeur ⇒ verrou de 30 jours ;
--              · une demande sans réponse expire d'elle-même au bout de 14 j ;
--              · blocage de part ou d'autre ⇒ plus rien ne se révèle.
--
-- Sécurité   : - `contact_exchange_requests` : RLS activée, AUCUN grant à
--                authenticated — ni lecture ni écriture directe. Tout passe
--                par les 4 RPC, comme `profile_visits` (migration 59).
--              - Les RPC sont SECURITY DEFINER, `search_path` fixé, réservées
--                à authenticated.
--              - Le prédicat d'accès à la conversation n'est PAS recopié :
--                on ENCAPSULE `can_send_message`, qui porte déjà « match
--                accepté + comptes actifs + non bloqué + non suspendu ». Une
--                seule définition, un seul endroit à corriger.
--              - `get_contact_exchange` ne renvoie un numéro que si l'état est
--                'accepted' ET que la conversation est toujours autorisée.
--              - Aucun motif de refus n'est exposé au demandeur : il voit une
--                demande close, rien de plus.
--
-- Note       : quand l'abonnement du demandeur expire, un échange DÉJÀ accepté
--              reste visible. On ne peut pas désapprendre un numéro ; le
--              masquer serait du théâtre. Le premium conditionne la demande,
--              pas la mémoire.
--
-- ⚠️ ORDRE — règle du §8 : cette migration AJOUTE des ressources dont le code a
--    besoin (table + RPC) ⇒ **APPLIQUER AVANT LE MERGE**.
--
-- ⚠️ À NE PAS appliquer automatiquement : attendre le GO explicite.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Table. Une ligne par demande ; l'historique est conservé, il fait foi
--    pour les verrous et pour la modération.
-- ---------------------------------------------------------------------------
create table if not exists public.contact_exchange_requests (
  id            uuid primary key default gen_random_uuid(),
  match_id      uuid not null references public.matches (id) on delete cascade,
  requester_id  uuid not null references auth.users (id) on delete cascade,
  target_id     uuid not null references auth.users (id) on delete cascade,
  status        text not null default 'pending',
  requested_at  timestamptz not null default now(),
  expires_at    timestamptz not null default (now() + interval '14 days'),
  responded_at  timestamptz,
  revoked_at    timestamptz,
  revoked_by    uuid references auth.users (id),
  constraint contact_exchange_no_self check (requester_id <> target_id),
  constraint contact_exchange_status_known check (
    status in ('pending', 'accepted', 'declined', 'revoked', 'expired')
  )
);

alter table public.contact_exchange_requests enable row level security;

-- Une seule demande VIVANTE par paire.
create unique index if not exists contact_exchange_active_idx
  on public.contact_exchange_requests (match_id)
  where status in ('pending', 'accepted');

-- Plafond quotidien et verrous : lectures par demandeur, puis par paire.
create index if not exists contact_exchange_requester_idx
  on public.contact_exchange_requests (requester_id, requested_at desc);
create index if not exists contact_exchange_match_idx
  on public.contact_exchange_requests (match_id, requested_at desc);

-- Aucun accès direct : ni policy permissive, ni grant.
revoke all privileges on table public.contact_exchange_requests
  from public, anon, authenticated;

comment on table public.contact_exchange_requests is
  'Demandes d''échange de coordonnées. Le premium ouvre le droit de DEMANDER ; '
  'seule la personne sollicitée peut faire révéler les numéros, des deux côtés.';

-- ---------------------------------------------------------------------------
-- 2) Marquer comme expirées les demandes sans réponse au-delà du délai.
--    Appelée en tête des RPC : le système se répare de lui-même, aucun cron.
-- ---------------------------------------------------------------------------
create or replace function public.expire_stale_contact_exchanges()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.contact_exchange_requests
  set status = 'expired'
  where status = 'pending'
    and expires_at <= pg_catalog.now();
$$;

revoke all on function public.expire_stale_contact_exchanges() from public;
revoke all on function public.expire_stale_contact_exchanges() from anon;
revoke all on function public.expire_stale_contact_exchanges() from authenticated;

-- ---------------------------------------------------------------------------
-- 3) RPC request_contact_exchange — le SEUL chemin de création.
--    Retour : 'requested'. Toute autre issue lève une exception nommée, que
--    l'interface traduit en une phrase compréhensible.
-- ---------------------------------------------------------------------------
create or replace function public.request_contact_exchange(p_match uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_target uuid;
  v_recent int;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  perform public.expire_stale_contact_exchanges();

  -- Accès à la conversation : match accepté, comptes actifs, aucun blocage.
  -- Règle unique, définie par can_send_message — jamais recopiée ici.
  if not public.can_send_message(p_match) then
    raise exception 'CONTACT_EXCHANGE_CONVERSATION_UNAVAILABLE'
      using errcode = '42501';
  end if;

  select case when m.user_a = v_uid then m.user_b else m.user_a end
    into v_target
    from public.matches m
    where m.id = p_match;

  if v_target is null then
    raise exception 'CONTACT_EXCHANGE_CONVERSATION_UNAVAILABLE'
      using errcode = '42501';
  end if;

  -- Le premium ouvre le droit de demander. Rien d'autre.
  if not public.profile_has_active_premium(v_uid) then
    raise exception 'CONTACT_EXCHANGE_PREMIUM_REQUIRED' using errcode = '42501';
  end if;

  -- Verrou DÉFINITIF : la personne sollicitée a repris son accord.
  if exists (
    select 1
    from public.contact_exchange_requests r
    where r.match_id = p_match
      and r.status = 'revoked'
      and r.revoked_by = v_target
  ) then
    raise exception 'CONTACT_EXCHANGE_CLOSED_BY_TARGET' using errcode = '42501';
  end if;

  -- Une seule demande vivante par paire.
  if exists (
    select 1
    from public.contact_exchange_requests r
    where r.match_id = p_match
      and r.status in ('pending', 'accepted')
  ) then
    raise exception 'CONTACT_EXCHANGE_ALREADY_OPEN' using errcode = '22023';
  end if;

  -- Refus ou retrait par le demandeur : 30 jours avant de réessayer.
  if exists (
    select 1
    from public.contact_exchange_requests r
    where r.match_id = p_match
      and r.status in ('declined', 'revoked')
      and coalesce(r.revoked_at, r.responded_at, r.requested_at)
          > pg_catalog.now() - interval '30 days'
  ) then
    raise exception 'CONTACT_EXCHANGE_LOCKED' using errcode = '42501';
  end if;

  -- Plafond : 3 demandes par 24 h, tous destinataires confondus.
  select count(*)
    into v_recent
    from public.contact_exchange_requests r
    where r.requester_id = v_uid
      and r.requested_at > pg_catalog.now() - interval '24 hours';

  if v_recent >= 3 then
    raise exception 'CONTACT_EXCHANGE_DAILY_LIMIT' using errcode = '42501';
  end if;

  insert into public.contact_exchange_requests (match_id, requester_id, target_id)
  values (p_match, v_uid, v_target);

  -- Notification interne : corps FIXE, aucune identité, aucun contenu.
  insert into public.member_notifications
    (user_id, type, title, body, related_profile_id)
  values (
    v_target,
    'contact_exchange_requested',
    'Demande d''échange de coordonnées',
    'Un membre avec qui vous échangez souhaite partager vos numéros. '
    'Vous seule décidez : ouvrez la conversation pour accepter ou refuser.',
    v_uid
  );

  return 'requested';
end
$$;

revoke all on function public.request_contact_exchange(uuid) from public;
revoke all on function public.request_contact_exchange(uuid) from anon;
grant execute on function public.request_contact_exchange(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) RPC respond_to_contact_exchange — la personne SOLLICITÉE décide.
--    Retour : 'accepted' | 'declined'.
--    Un refus ne notifie personne : le demandeur verra une demande close, sans
--    motif. La transparence brutale ne nourrirait ici que du ressentiment.
-- ---------------------------------------------------------------------------
create or replace function public.respond_to_contact_exchange(
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
  v_id uuid;
  v_requester uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if p_decision not in ('accept', 'decline') then
    raise exception 'CONTACT_EXCHANGE_BAD_DECISION' using errcode = '22023';
  end if;

  perform public.expire_stale_contact_exchanges();

  if not public.can_send_message(p_match) then
    raise exception 'CONTACT_EXCHANGE_CONVERSATION_UNAVAILABLE'
      using errcode = '42501';
  end if;

  select r.id, r.requester_id
    into v_id, v_requester
    from public.contact_exchange_requests r
    where r.match_id = p_match
      and r.status = 'pending'
      and r.target_id = v_uid;

  if v_id is null then
    raise exception 'CONTACT_EXCHANGE_NOTHING_TO_ANSWER' using errcode = '22023';
  end if;

  update public.contact_exchange_requests
  set status = case when p_decision = 'accept' then 'accepted' else 'declined' end,
      responded_at = pg_catalog.now()
  where id = v_id;

  if p_decision = 'accept' then
    insert into public.member_notifications
      (user_id, type, title, body, related_profile_id)
    values (
      v_requester,
      'contact_exchange_accepted',
      'Échange de coordonnées accepté',
      'Une personne avec qui vous échangez a accepté de partager les numéros. '
      'Ouvrez la conversation pour les retrouver.',
      v_uid
    );

    return 'accepted';
  end if;

  return 'declined';
end
$$;

revoke all on function public.respond_to_contact_exchange(uuid, text) from public;
revoke all on function public.respond_to_contact_exchange(uuid, text) from anon;
grant execute on function public.respond_to_contact_exchange(uuid, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 5) RPC revoke_contact_exchange — l'un OU l'autre reprend son accord.
--    Retour : 'revoked'.
-- ---------------------------------------------------------------------------
create or replace function public.revoke_contact_exchange(p_match uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Volontairement SANS can_send_message : on doit pouvoir se retirer même
  -- après un blocage ou une suspension de l'autre côté.
  select r.id
    into v_id
    from public.contact_exchange_requests r
    where r.match_id = p_match
      and r.status = 'accepted'
      and (r.requester_id = v_uid or r.target_id = v_uid);

  if v_id is null then
    raise exception 'CONTACT_EXCHANGE_NOTHING_TO_REVOKE' using errcode = '22023';
  end if;

  update public.contact_exchange_requests
  set status = 'revoked',
      revoked_at = pg_catalog.now(),
      revoked_by = v_uid
  where id = v_id;

  return 'revoked';
end
$$;

revoke all on function public.revoke_contact_exchange(uuid) from public;
revoke all on function public.revoke_contact_exchange(uuid) from anon;
grant execute on function public.revoke_contact_exchange(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6) RPC get_contact_exchange — état de la conversation courante.
--    Le numéro de l'autre n'est renvoyé QUE si l'état est 'accepted' ET que la
--    conversation reste autorisée. Sinon : NULL, jamais une chaîne vide.
-- ---------------------------------------------------------------------------
create or replace function public.get_contact_exchange(p_match uuid)
returns table (
  state text,
  i_requested boolean,
  other_whatsapp text,
  my_whatsapp text,
  can_request boolean,
  requests_left_today int
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_allowed boolean;
  v_row public.contact_exchange_requests%rowtype;
  v_other uuid;
  v_premium boolean;
  v_used int;
  v_locked boolean;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  v_allowed := public.can_send_message(p_match);

  select case when m.user_a = v_uid then m.user_b else m.user_a end
    into v_other
    from public.matches m
    where m.id = p_match
      and (m.user_a = v_uid or m.user_b = v_uid);

  if v_other is null then
    raise exception 'CONTACT_EXCHANGE_CONVERSATION_UNAVAILABLE'
      using errcode = '42501';
  end if;

  select *
    into v_row
    from public.contact_exchange_requests r
    where r.match_id = p_match
      and r.status in ('pending', 'accepted')
    limit 1;

  -- Une demande en attente dépassée compte comme close, sans écriture ici :
  -- cette fonction est STABLE. Le nettoyage se fait dans les RPC d'écriture.
  if v_row.id is not null
     and v_row.status = 'pending'
     and v_row.expires_at <= pg_catalog.now() then
    v_row := null;
  end if;

  v_premium := public.profile_has_active_premium(v_uid);

  select count(*)
    into v_used
    from public.contact_exchange_requests r
    where r.requester_id = v_uid
      and r.requested_at > pg_catalog.now() - interval '24 hours';

  v_locked := exists (
    select 1
    from public.contact_exchange_requests r
    where r.match_id = p_match
      and (
        (r.status = 'revoked' and r.revoked_by = v_other)
        or (r.status in ('declined', 'revoked')
            and coalesce(r.revoked_at, r.responded_at, r.requested_at)
                > pg_catalog.now() - interval '30 days')
      )
  );

  return query
  select
    coalesce(v_row.status, 'none')::text,
    coalesce(v_row.requester_id = v_uid, false),
    case
      when v_row.status = 'accepted' and v_allowed
      then (select p.whatsapp_phone from public.profiles p where p.id = v_other)
    end,
    case
      when v_row.status = 'accepted' and v_allowed
      then (select p.whatsapp_phone from public.profiles p where p.id = v_uid)
    end,
    (v_allowed and v_premium and v_row.id is null and not v_locked),
    greatest(0, 3 - v_used);
end
$$;

revoke all on function public.get_contact_exchange(uuid) from public;
revoke all on function public.get_contact_exchange(uuid) from anon;
grant execute on function public.get_contact_exchange(uuid) to authenticated;
