-- =============================================================================
-- KASSALAFAM — MARIAGE À TOUT PRIX
-- Migration : refuser les coordonnées personnelles dans les champs PUBLICS
-- Date      : 2026-08-06 (heure réelle du Cameroun)
--
-- Objet     : `bio`, `partner_expectations`, `first_name` et `pseudo` sont
--             servis PUBLIQUEMENT (vitrine /candidats, /p, /promo) et à tout
--             membre compatible (discover_candidates, view_candidate_details).
--             Un numéro ou un identifiant de messagerie écrit là n'est pas
--             exposé à un prétendant : il est exposé à l'internet entier et
--             moissonnable. C'est une fuite de donnée personnelle, pas une
--             question de rétention.
--
-- Autorité  : les pages `/profile` et l'onboarding écrivent DIRECTEMENT dans
--             `public.profiles` depuis le navigateur (policy profiles_update_own,
--             grant `authenticated=arw`). Une validation côté client serait donc
--             contournable en trois lignes de console : la règle DOIT vivre
--             dans la base. Le miroir TypeScript n'est là que pour afficher un
--             message aimable AVANT l'aller-retour.
--
-- Sécurité  : - `text_has_contact_details` est IMMUTABLE, sans effet de bord,
--               `search_path` fixé, et reste INTERNE (aucun grant : les
--               privilèges par défaut sont durcis depuis 20260724045658).
--             - Le trigger ne valide QUE les champs réellement modifiés : un
--               profil existant n'est jamais re-bloqué par une écriture qui ne
--               touche pas ces colonnes (même prudence qu'à la migration 55).
--             - Aucune donnée n'est lue, écrite ni supprimée.
--             - Idempotent (create or replace / drop trigger if exists).
--
-- Vérifié AVANT écriture : 0 ligne existante ne contient de suite de chiffres
-- dans `bio` ou `partner_expectations`. La migration ne casse aucun profil.
--
-- ⚠️ ORDRE — règle du §8 : cette migration AJOUTE UNE EXIGENCE que le code doit
--    satisfaire ⇒ **MERGER LA PR AVANT D'APPLIQUER**. Sinon un membre qui
--    enregistre son profil reçoit une erreur brute au lieu du message explicatif.
--
-- ⚠️ À NE PAS appliquer automatiquement : attendre le GO explicite.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Détection. Volontairement CONSERVATRICE : mieux vaut laisser passer un cas
-- tordu que refuser une biographie honnête.
--
--   · 8 chiffres ou plus à la suite, séparés au plus par un espace, un point,
--     un tiret ou une parenthèse. Le « / » n'est PAS un séparateur accepté,
--     pour ne pas refuser une date (12/05/1990). Un âge, une année, un prix
--     en FCFA restent donc parfaitement autorisés.
--   · un indicatif international « + » suivi d'au moins 6 chiffres ;
--   · une adresse email ;
--   · un identifiant précédé de « @ » (3 caractères ou plus) ;
--   · les noms de messageries les plus utilisées comme point de bascule.
-- ---------------------------------------------------------------------------
create or replace function public.text_has_contact_details(p_text text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_text is null or pg_catalog.btrim(p_text) = '' then false
    else
      p_text ~ '([0-9][ .()-]?){8,}'
      or p_text ~ '\+ ?[0-9]([ .()-]?[0-9]){5,}'
      or p_text ~* '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}'
      or p_text ~* '@[a-z0-9._]{3,}'
      or p_text ~* '(whats ?app|wa\.me|t\.me|telegram|snapchat|viber|imo\.im)'
  end;
$$;

comment on function public.text_has_contact_details(text) is
  'Vrai si le texte contient un numéro, un email ou un identifiant de '
  'messagerie. Utilisé par le trigger des champs publics de profiles. '
  'FAIT AUTORITÉ : le miroir TypeScript src/lib/profile/contact-details.ts '
  'sert uniquement à afficher un message avant l''aller-retour.';

revoke all on function public.text_has_contact_details(text) from public;
revoke all on function public.text_has_contact_details(text) from anon;
revoke all on function public.text_has_contact_details(text) from authenticated;

-- ---------------------------------------------------------------------------
-- Trigger. Refuse l'écriture et NOMME le champ fautif dans `detail`, pour que
-- l'interface puisse pointer le bon encadré.
-- ---------------------------------------------------------------------------
create or replace function public.profiles_reject_contact_details()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_check_bio boolean;
  v_check_expectations boolean;
  v_check_first_name boolean;
  v_check_pseudo boolean;
  v_field text := null;
begin
  -- OLD n'existe pas en INSERT : on ne l'évalue jamais dans cette branche.
  if tg_op = 'INSERT' then
    v_check_bio := true;
    v_check_expectations := true;
    v_check_first_name := true;
    v_check_pseudo := true;
  else
    v_check_bio := new.bio is distinct from old.bio;
    v_check_expectations :=
      new.partner_expectations is distinct from old.partner_expectations;
    v_check_first_name := new.first_name is distinct from old.first_name;
    v_check_pseudo := new.pseudo is distinct from old.pseudo;
  end if;

  if v_check_bio and public.text_has_contact_details(new.bio) then
    v_field := 'bio';
  elsif v_check_expectations
        and public.text_has_contact_details(new.partner_expectations) then
    v_field := 'partner_expectations';
  elsif v_check_first_name
        and public.text_has_contact_details(new.first_name) then
    v_field := 'first_name';
  elsif v_check_pseudo and public.text_has_contact_details(new.pseudo) then
    v_field := 'pseudo';
  end if;

  if v_field is not null then
    raise exception 'PROFILE_CONTACT_DETAILS_NOT_ALLOWED'
      using errcode = '22023',
            detail = v_field,
            hint = 'Ces champs sont publics : ni numero, ni email, ni identifiant de messagerie.';
  end if;

  return new;
end
$$;

drop trigger if exists profiles_reject_contact_details on public.profiles;
create trigger profiles_reject_contact_details
  before insert or update on public.profiles
  for each row
  execute function public.profiles_reject_contact_details();
