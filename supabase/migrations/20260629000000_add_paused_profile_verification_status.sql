-- =============================================================================
-- KASSALAFAM — MARIAGE À TOUT PRIX
-- Migration : ajout du statut de vérification « paused » (L3-B2B)
-- Date      : 2026-06-29
--
-- Objet     : permettre au back-office de mettre un profil EN PAUSE, en plus de
--             pending / approved / rejected.
--
-- Sécurité  : - Ajout d'UNE valeur d'enum uniquement. Idempotent (IF NOT EXISTS).
--             - Aucune donnée modifiée. Aucune colonne ajoutée/supprimée/renommée.
--             - Aucune policy RLS modifiée. Aucun trigger modifié.
--             - Le trigger trg_profiles_guard_verification reste valable : un
--               membre ne peut toujours pas changer lui-même son statut.
--
-- Note PG   : `ALTER TYPE ... ADD VALUE` est une commande utilitaire qui ne peut
--             PAS être encapsulée dans un bloc DO/plpgsql ni utilisée dans la même
--             transaction que sa création. La forme idempotente correcte est donc
--             « ADD VALUE IF NOT EXISTS ». La nouvelle valeur n'est PAS utilisée
--             dans cette migration (aucune réécriture de données) → sûr.
--
-- ⚠️ À NE PAS appliquer automatiquement : attendre le GO explicite.
-- =============================================================================

alter type public.profile_verification_status
  add value if not exists 'paused';
