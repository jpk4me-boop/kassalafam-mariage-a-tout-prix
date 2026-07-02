-- =============================================================================
-- KASSALAFAM — MARIAGE À TOUT PRIX
-- L3F-A — Correctif de privilège du helper interne blocking_exists.
-- Date : 2026-07-02
--------------------

-- Supabase accorde par défaut EXECUTE sur les nouvelles fonctions au rôle
-- authenticated. Ce helper interne ne doit être appelé que par les fonctions
-- SECURITY DEFINER qui l’utilisent.
-- =============================================================================

revoke all
on function public.blocking_exists(uuid, uuid)
from authenticated;
