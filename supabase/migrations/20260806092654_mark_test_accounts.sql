-- =============================================================================
-- KASSALAFAM — MARIAGE À TOUT PRIX
-- Migration : marquer les comptes de test du développeur
-- Date      : 2026-08-06 (heure réelle du Cameroun)
--
-- Objet     : cinq profils sont créés par le développeur pour ses essais. Tant
--             qu'ils n'étaient identifiés que par une liste d'adresses dans un
--             document, chaque analyse risquait de les compter comme des
--             membres — c'est arrivé le 06/08 : « 9 onboardings finalisés »
--             annonçait en réalité 4, et la moitié des inscriptions attribuées
--             à Facebook étaient des tests.
--
--             Un drapeau en base rend l'erreur impossible : la requête d'analyse
--             filtre sur une colonne, plus sur une liste recopiée à la main.
--
-- ⚠️ CE QUE CETTE MIGRATION NE FAIT PAS, VOLONTAIREMENT : elle ne retire ces
--    comptes NI de la découverte, NI de la vitrine, NI d'aucune RPC membre.
--    Ils servent précisément à tester ces parcours ; les masquer les rendrait
--    inutiles. Le drapeau sert à l'ANALYSE et à l'admin, pas au produit.
--
-- Sécurité  : - colonne en `not null default false` : aucun profil existant
--               n'est modifié par l'ajout lui-même.
--             - AUCUN grant nouveau. `authenticated` peut lire la colonne
--               comme le reste de sa propre ligne (policy profiles_select_own),
--               et l'écrire sur SA ligne — sans intérêt, et sans conséquence :
--               la colonne ne conditionne aucune règle métier.
--             - Aucune donnée supprimée. Le marquage des 5 comptes est fait
--               SÉPARÉMENT, après comptage annoncé (§8), pas dans ce fichier :
--               une migration reste reproductible sur une base vide.
--
-- ⚠️ À NE PAS appliquer automatiquement : attendre le GO explicite.
-- =============================================================================

alter table public.profiles
  add column if not exists is_test_account boolean not null default false;

comment on column public.profiles.is_test_account is
  'Compte créé par le développeur pour ses essais. À EXCLURE de toute mesure '
  'd''acquisition, de conversion ou d''activité. N''a AUCUN effet sur le '
  'produit : ces comptes restent visibles en découverte et en vitrine, c''est '
  'leur raison d''être. Marquage posé à la main, jamais par l''application.';

create index if not exists profiles_real_accounts_idx
  on public.profiles (created_at desc)
  where not is_test_account;
