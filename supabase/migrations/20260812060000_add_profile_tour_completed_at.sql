-- =============================================================================
-- KASSALAFAM — MARIAGE À TOUT PRIX
-- Migration 65 : témoin de fin de la visite guidée de la Découverte
-- Date        : 2026-08-12 (heure réelle du Cameroun)
--
-- Objet     : `profiles.tour_completed_at` retient qu'un membre a terminé (ou
--             volontairement passé) la visite guidée du flux de découverte.
--             NULL = visite à jouer. Une date = visite vue.
--
-- Pourquoi en base et pas en localStorage : la visite se joue UNE fois par
--             personne, pas une fois par navigateur. Un membre qui passe du
--             téléphone à l'ordinateur, installe la PWA ou vide son cache ne
--             doit pas la revoir. En prime, la colonne est mesurable : on saura
--             combien de nouveaux membres vont au bout.
--
-- Écriture  : LIBRE pour le membre sur SA ligne (policy profiles_update_own).
--             Ce n'est pas un champ administratif : le remettre à NULL est même
--             la fonction « Revoir la visite guidée » de /profile.
--             La garde trg_profiles_guard_admin_fields n'est pas concernée —
--             elle ne surveille que les champs administratifs.
--
-- Sécurité  : aucune donnée personnelle, aucune RPC, aucune policy touchée.
--             Colonne NULLABLE sans valeur par défaut : les 19 profils
--             existants restent à NULL et verront donc la visite une fois.
--             C'est voulu — ils ne l'ont jamais vue.
--
-- Idempotent : `add column if not exists`.
--
-- ⚠️ ORDRE — règle du §8 : l'interface AJOUTE une colonne à ses lectures et à
--    ses écritures ⇒ **APPLIQUER LA MIGRATION AVANT DE MERGER LA PR.**
-- =============================================================================

alter table public.profiles
  add column if not exists tour_completed_at timestamptz;

comment on column public.profiles.tour_completed_at is
  'Visite guidée de la Découverte : date de fin (ou de passage volontaire). '
  'NULL = à jouer au prochain passage sur un univers de découverte. '
  'Librement écrivable par le membre sur sa propre ligne ; le remettre à NULL '
  'relance la visite (« Revoir la visite guidée » dans /profile).';
