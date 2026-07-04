-- =============================================================================
-- KASSALAFAM — MARIAGE À TOUT PRIX
-- Migration : notifications membre après action admin de vérification (L3-C)
-- Date      : 2026-06-29
--
-- Objet     : table des notifications affichées au membre dans son espace.
--             Créées côté serveur (service_role) après une action admin réussie
--             (Approuver / Rejeter / Pause). Le membre les lit en lecture seule.
--
-- Sécurité  : - RLS activée. Le membre ne peut QUE lire ses propres lignes
--               (auth.uid() = user_id). Aucune policy insert/update/delete côté
--               membre : l'écriture passe par le service_role serveur.
--             - Aucune donnée existante modifiée. Aucune RLS existante touchée.
--             - Idempotent (create ... if not exists, drop policy if exists).
--
-- ⚠️ À NE PAS appliquer automatiquement : attendre le GO explicite.
-- =============================================================================

create table if not exists public.member_notifications (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete cascade,
  type                text not null,
  title               text not null,
  body                text not null,
  verification_status public.profile_verification_status,
  related_profile_id  uuid references public.profiles (id) on delete cascade,
  read_at             timestamptz,
  created_at          timestamptz not null default now()
);

alter table public.member_notifications enable row level security;

create index if not exists member_notifications_user_created_idx
  on public.member_notifications (user_id, created_at desc);

-- Lecture : un membre ne voit QUE ses propres notifications.
drop policy if exists "Members can read their own notifications"
  on public.member_notifications;
create policy "Members can read their own notifications"
  on public.member_notifications
  for select
  to authenticated
  using (auth.uid() = user_id);
