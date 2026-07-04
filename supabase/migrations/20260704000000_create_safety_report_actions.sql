-- =============================================================================
-- KASSALAFAM — MARIAGE À TOUT PRIX
-- L3F-C2A — Traitement des signalements : journal append-only + transition
--           transactionnelle (backend only, additif). Aucune UI ici.
-- Date : 2026-07-04
--
-- OBJECTIF
--   Donner à un administrateur autorisé le moyen de TRAITER un signalement
--   (prise en charge / résolution / classement sans suite) de façon ATOMIQUE et
--   TRACÉE, sans toucher au reste (messagerie, matches, blocages, suspension).
--
-- PÉRIMÈTRE / NON-RÉGRESSION
--   Migration STRICTEMENT ADDITIVE. Elle NE modifie PAS :
--     - les policies / privilèges de safety_reports (hors la FK reviewed_by) ;
--     - la messagerie (can_message / can_send_message / send_message) ;
--     - les matches, les blocages, la découverte, les notifications ;
--     - l'enum match_status ni profile_verification_status.
--   Aucune donnée n'est créée. Aucune policy RLS n'est ajoutée : les nouvelles
--   écritures passent EXCLUSIVEMENT par la fonction SECURITY DEFINER
--   admin_transition_safety_report, appelée uniquement par le client service_role
--   (Server Action admin). search_path = '' partout ; références qualifiées.
--
-- IDEMPOTENCE : drop constraint if exists / create table if not exists /
--   create or replace function / drop trigger if exists.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- A. CORRECTION DE LA FK safety_reports.reviewed_by  (profiles -> auth.users)
--
--    RATIONALE :
--      - ADMIN_USER_IDS contient des identifiants `auth.users.id` (allowlist
--        serveur, hors base). Un administrateur autorisé peut LÉGITIMEMENT ne
--        PAS avoir de ligne dans public.profiles (il n'est pas obligé d'être un
--        membre onboardé).
--      - L'ancienne FK reviewed_by -> profiles(id) rendait impossible la
--        journalisation de l'acteur pour un tel admin (violation de FK).
--      - Cette correction aligne la modération sur le flux de vérification
--        existant, où profiles.verification_reviewed_by -> auth.users(id).
--
--    On remplace UNIQUEMENT la contrainte FK. La colonne reviewed_by (uuid,
--    nullable) et toutes les autres contraintes restent inchangées. Table à 0
--    ligne : le drop/add est sans risque de données.
-- ---------------------------------------------------------------------------
alter table public.safety_reports
  drop constraint if exists safety_reports_reviewed_by_fkey;

alter table public.safety_reports
  add constraint safety_reports_reviewed_by_fkey
  foreign key (reviewed_by) references auth.users (id) on delete set null;

-- ---------------------------------------------------------------------------
-- B. TABLE APPEND-ONLY public.safety_report_actions
--    Un enregistrement par TRANSITION de statut d'un signalement. Immuable :
--    aucune mise à jour ni suppression (voir trigger en §C).
--
--    - report_id -> safety_reports(id) ON DELETE RESTRICT : on ne supprime
--      jamais un signalement qui possède un historique (protection de la trace).
--    - actor_id -> auth.users(id) ON DELETE SET NULL : l'identité vivante peut
--      disparaître ; actor_email_snapshot conserve alors une trace immuable.
--    - actor_email_snapshot : capturé CÔTÉ SERVEUR par la fonction (jamais
--      transmis par l'application).
-- ---------------------------------------------------------------------------
create table if not exists public.safety_report_actions (
  id                    uuid primary key default gen_random_uuid(),
  report_id             uuid not null references public.safety_reports (id) on delete restrict,
  actor_id              uuid references auth.users (id) on delete set null,
  actor_email_snapshot  text,
  previous_status       text not null,
  new_status            text not null,
  note                  text,
  created_at            timestamptz not null default now(),
  constraint safety_report_actions_prev_status_valid check (
    previous_status in ('open', 'reviewing', 'resolved', 'dismissed')
  ),
  constraint safety_report_actions_new_status_valid check (
    new_status in ('reviewing', 'resolved', 'dismissed')
  ),
  constraint safety_report_actions_status_distinct check (
    previous_status <> new_status
  ),
  -- Note NULL, ou 10..2000 caractères APRÈS normalisation (btrim).
  constraint safety_report_actions_note_len check (
    note is null or char_length(btrim(note)) between 10 and 2000
  )
);

-- Historique d'un signalement, du plus récent au plus ancien.
create index if not exists safety_report_actions_report_idx
  on public.safety_report_actions (report_id, created_at desc);

-- ---------------------------------------------------------------------------
-- B.bis  RLS + PRIVILÈGES (append-only, service_role uniquement)
--    RLS activée, AUCUNE policy => aucun accès direct anon/authenticated.
--    On révoque tout puis on n'accorde à service_role que SELECT + INSERT
--    (jamais UPDATE/DELETE : le journal est append-only, y compris pour lui).
--    La fonction SECURITY DEFINER (§C) insère en tant que propriétaire, ce qui
--    reste autorisé (l'INSERT ne déclenche pas le trigger anti-mutation).
-- ---------------------------------------------------------------------------
alter table public.safety_report_actions enable row level security;

revoke all on table public.safety_report_actions from public;
revoke all on table public.safety_report_actions from anon;
revoke all on table public.safety_report_actions from authenticated;
revoke all on table public.safety_report_actions from service_role;
grant select, insert on table public.safety_report_actions to service_role;

-- ---------------------------------------------------------------------------
-- C. IMMUABILITÉ — trigger BEFORE UPDATE OR DELETE
--    Refuse toute mutation d'une ligne existante avec un message STABLE.
--    SECURITY DEFINER non nécessaire (la fonction ne fait que lever une
--    exception, sans privilège élevé) : on reste en SECURITY INVOKER.
-- ---------------------------------------------------------------------------
create or replace function public.safety_report_actions_no_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'SAFETY_REPORT_ACTIONS_APPEND_ONLY' using errcode = '42501';
end;
$$;

revoke all on function public.safety_report_actions_no_mutation() from public;
revoke all on function public.safety_report_actions_no_mutation() from anon;
revoke all on function public.safety_report_actions_no_mutation() from authenticated;

drop trigger if exists trg_safety_report_actions_append_only
  on public.safety_report_actions;
create trigger trg_safety_report_actions_append_only
  before update or delete on public.safety_report_actions
  for each row execute function public.safety_report_actions_no_mutation();

-- ---------------------------------------------------------------------------
-- D. FONCTION TRANSACTIONNELLE admin_transition_safety_report
--    Effectue, dans UNE seule transaction :
--      verrou (FOR UPDATE) -> vérif concurrence (p_expected_status) ->
--      vérif transition -> vérif note -> vérif acteur -> UPDATE safety_reports
--      -> INSERT journal -> RETURN de la ligne mise à jour.
--
--    - p_expected_status est OBLIGATOIRE : il porte l'état vu par l'admin au
--      moment de décider. Si le statut réel a changé entre-temps (décision
--      concurrente), on lève REPORT_STATUS_CONFLICT et rien n'est écrit.
--    - L'acteur (p_actor_id) provient de requireAdmin() côté serveur ; son email
--      est relu ICI depuis auth.users (jamais accepté depuis l'application).
--    - Messages d'erreur métier STABLES, sans donnée sensible.
-- ---------------------------------------------------------------------------
create or replace function public.admin_transition_safety_report(
  p_report_id uuid,
  p_expected_status text,
  p_new_status text,
  p_note text,
  p_actor_id uuid
)
returns public.safety_reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report      public.safety_reports%rowtype;
  v_prev_status text;
  v_note        text;
  v_actor_email text;
begin
  -- 1. Verrou + lecture du signalement (sérialise les décisions concurrentes).
  select * into v_report
    from public.safety_reports
    where id = p_report_id
    for update;

  if not found then
    raise exception 'REPORT_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_prev_status := v_report.status;

  -- 2. Concurrence optimiste : l'état réel doit être celui vu par l'admin.
  if v_prev_status is distinct from p_expected_status then
    raise exception 'REPORT_STATUS_CONFLICT' using errcode = '40001';
  end if;

  -- 3. Un statut terminal ne peut plus transiter.
  if v_prev_status in ('resolved', 'dismissed') then
    raise exception 'REPORT_ALREADY_FINAL' using errcode = '22023';
  end if;

  -- 4. Pas de transition vers le statut déjà courant.
  if p_new_status = v_prev_status then
    raise exception 'INVALID_REPORT_TRANSITION' using errcode = '22023';
  end if;

  -- 5. Matrice des transitions autorisées (MVP, sans réouverture).
  if not (
       (v_prev_status = 'open'      and p_new_status in ('reviewing', 'resolved', 'dismissed'))
    or (v_prev_status = 'reviewing' and p_new_status in ('resolved', 'dismissed'))
  ) then
    raise exception 'INVALID_REPORT_TRANSITION' using errcode = '22023';
  end if;

  -- 6. Normalisation + règles de note.
  --    reviewing : note facultative ; resolved/dismissed : note obligatoire.
  --    Si une note est présente, elle doit faire 10..2000 (cohérent avec le
  --    CHECK de safety_report_actions et de safety_reports.resolution_note).
  v_note := nullif(btrim(coalesce(p_note, '')), '');

  if p_new_status in ('resolved', 'dismissed') and v_note is null then
    raise exception 'NOTE_REQUIRED' using errcode = '22023';
  end if;

  if v_note is not null
     and (char_length(v_note) < 10 or char_length(v_note) > 2000) then
    raise exception 'NOTE_LENGTH_INVALID' using errcode = '22023';
  end if;

  -- 7. Acteur : doit exister dans auth.users. Email relu côté serveur.
  select u.email into v_actor_email
    from auth.users u
    where u.id = p_actor_id;

  if not found then
    raise exception 'ACTOR_NOT_FOUND' using errcode = '22023';
  end if;

  -- 8. Mise à jour atomique du signalement.
  update public.safety_reports
    set status          = p_new_status,
        reviewed_by     = p_actor_id,
        reviewed_at     = now(),
        resolution_note = coalesce(v_note, resolution_note)
    where id = p_report_id
    returning * into v_report;

  -- 9. Journal append-only (même transaction).
  insert into public.safety_report_actions (
    report_id, actor_id, actor_email_snapshot,
    previous_status, new_status, note
  )
  values (
    p_report_id, p_actor_id, v_actor_email,
    v_prev_status, p_new_status, v_note
  );

  return v_report;
end;
$$;

-- ---------------------------------------------------------------------------
-- E. PRIVILÈGES DE LA FONCTION — service_role uniquement.
--    Aucun membre authentifié ne doit pouvoir l'appeler directement.
-- ---------------------------------------------------------------------------
revoke all on function public.admin_transition_safety_report(uuid, text, text, text, uuid) from public;
revoke all on function public.admin_transition_safety_report(uuid, text, text, text, uuid) from anon;
revoke all on function public.admin_transition_safety_report(uuid, text, text, text, uuid) from authenticated;
grant execute on function public.admin_transition_safety_report(uuid, text, text, text, uuid) to service_role;
