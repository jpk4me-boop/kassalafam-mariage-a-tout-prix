-- =============================================================================
-- KASSALAFAM — MARIAGE À TOUT PRIX
-- Migration : marquage comme lu des notifications membre
-- Date      : 2026-08-04
--
-- Objet     : permettre au membre de marquer SES notifications comme lues
--             depuis la page /notifications, sans passer par service_role.
--
-- Sécurité  : - Grant par colonne : authenticated ne peut modifier QUE read_at
--               (le harden 20260723222350 avait laissé SELECT seul — les autres
--               colonnes restent inaccessibles en écriture).
--             - Policy UPDATE limitée aux lignes du membre
--               (auth.uid() = user_id), USING et WITH CHECK identiques.
--             - Aucune policy INSERT/DELETE ajoutée : la création des
--               notifications reste réservée au service_role serveur.
--             - Idempotent (drop policy if exists, grant rejouable).
--
-- ⚠️ À NE PAS appliquer automatiquement : attendre le GO explicite.
-- =============================================================================

-- Autoriser uniquement la colonne read_at en écriture pour authenticated.
grant update (read_at) on table public.member_notifications to authenticated;

-- Un membre ne peut marquer comme lues QUE ses propres notifications.
drop policy if exists "Members can mark their own notifications read"
  on public.member_notifications;
create policy "Members can mark their own notifications read"
  on public.member_notifications
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
