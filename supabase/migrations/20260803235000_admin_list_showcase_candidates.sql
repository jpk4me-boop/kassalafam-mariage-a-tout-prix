-- =============================================================================
-- KASSALAFAM — MARIAGE À TOUT PRIX
-- Migration : lecture admin de l'état « vitrine » des membres
-- Date      : 2026-08-03 (soir — version > 20260803230000, règle du §3)
--
-- Objet     : permettre au back-office de voir, en un coup d'œil, QUI pourrait
--             figurer sur /candidats et ce qui l'en empêche.
--             Constat production du 03/08 : 9 onboardings terminés, 1 seul
--             profil publié ; 4 membres n'ont qu'un consentement à donner,
--             2 sont bloqués par le floutage de leurs photos, 2 ont un profil
--             redevenu incomplet. Aucune page ne le montrait.
--
--             `public.candidate_showcase_eligibility_reason` est une fonction
--             INTERNE : ses privilèges sont `{postgres=X/postgres}`, donc même
--             `service_role` ne peut pas l'exécuter (vérifié le 03/08). Cette
--             migration ajoute donc UNE RPC de lecture, réservée au serveur
--             administratif, qui l'encapsule — la règle d'éligibilité reste
--             définie à UN SEUL endroit, rien n'est recalculé ailleurs.
--
-- Sécurité  : - LECTURE SEULE : la fonction ne fait aucun INSERT/UPDATE/DELETE.
--             - SECURITY DEFINER + `search_path` fixé ; propriétaire `postgres`
--               (seul habilité à lire la fonction d'éligibilité interne).
--             - GRANT EXECUTE au SEUL `service_role`. Ni `anon` ni
--               `authenticated` : un membre ne doit jamais lire l'état vitrine
--               des autres, ni leurs coordonnées.
--             - Renvoie `last_name` et `whatsapp_phone` : données PRIVÉES,
--               destinées au back-office uniquement (même statut que la fiche
--               membre admin). Elles ne transitent par AUCUNE page publique.
--             - Migration ADDITIVE : aucune table, aucune colonne, aucune
--               donnée touchée. Idempotente (CREATE OR REPLACE).
--
-- ⚠️ À NE PAS appliquer automatiquement : attendre le GO explicite.
-- =============================================================================

create or replace function public.admin_list_showcase_candidates()
returns table(
  profile_id uuid,
  first_name text,
  last_name text,
  whatsapp_phone text,
  blur_photos boolean,
  has_primary_photo boolean,
  eligibility_reason text,
  is_published boolean,
  onboarding_completed_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    p.first_name,
    p.last_name,
    p.whatsapp_phone,
    p.blur_photos,
    exists (
      select 1 from public.photos ph
      where ph.profile_id = p.id and ph.is_primary
    ) as has_primary_photo,
    -- Règle d'éligibilité : UNE seule définition, celle de la base.
    public.candidate_showcase_eligibility_reason(
      p.id,
      (select ph.id from public.photos ph
        where ph.profile_id = p.id and ph.is_primary
        limit 1)
    ) as eligibility_reason,
    exists (
      select 1 from public.candidate_showcase_publications pub
      where pub.profile_id = p.id and pub.listing_enabled
    ) as is_published,
    p.onboarding_completed_at
  from public.profiles p
  where p.account_status = 'active'::public.account_status
    and p.onboarding_completed_at is not null
  order by p.onboarding_completed_at;
$$;

comment on function public.admin_list_showcase_candidates() is
  'Back-office : état vitrine de chaque membre actif ayant terminé son '
  'inscription (motif d''éligibilité, publication en cours, contact privé). '
  'Encapsule la fonction interne candidate_showcase_eligibility_reason — '
  'AUCUNE règle n''est dupliquée. Lecture seule, service_role UNIQUEMENT : '
  'contient des données privées (nom, téléphone) qui ne doivent jamais sortir '
  'du back-office.';

revoke all on function public.admin_list_showcase_candidates() from public;
revoke all on function public.admin_list_showcase_candidates() from anon;
revoke all on function public.admin_list_showcase_candidates() from authenticated;
grant execute on function public.admin_list_showcase_candidates() to service_role;
