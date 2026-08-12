-- =============================================================================
-- KASSALAFAM — MARIAGE À TOUT PRIX
-- Migration 64 : réparer le garde-fou « coordonnées dans les champs publics »
-- Date        : 2026-08-12 (heure réelle du Cameroun)
--
-- INCIDENT     : depuis la migration 20260806073500, TOUTE écriture d'un membre
--                sur `public.profiles` échoue en 403.
--                Journal PostgreSQL : « permission denied for function
--                text_has_contact_details ».
--
-- CAUSE        : la migration 20260806073500 a fait deux choix corrects pris
--                séparément, incompatibles pris ensemble :
--                  · `text_has_contact_details` reste INTERNE — EXECUTE révoqué
--                    à public, anon et authenticated ;
--                  · `profiles_reject_contact_details` (le trigger) est resté en
--                    SECURITY INVOKER.
--                Le trigger s'exécute donc SOUS L'IDENTITÉ DU MEMBRE, qui n'a
--                pas le droit d'appeler la fonction d'aide. PostgreSQL vérifie
--                ce droit à la PLANIFICATION : la court-circuitation logique
--                (`if v_check_bio and …`) ne protège de rien, l'erreur tombe
--                même quand aucun champ surveillé n'est modifié.
--                Portée : /profile ET l'onboarding (INSERT comme UPDATE), pour
--                TOUS les membres. Les écritures en service_role (outils
--                d'administration, routes serveur) n'étaient pas touchées, ce
--                qui a masqué la panne.
--
-- CORRECTIF    : passer le TRIGGER en SECURITY DEFINER. Il s'exécute alors sous
--                son propriétaire (postgres), qui détient EXECUTE sur la
--                fonction d'aide. La fonction d'aide RESTE INTERNE : aucun
--                privilège n'est rendu au rôle `authenticated`.
--
-- Sécurité     : - `search_path` est déjà fixé à '' et tous les appels sont
--                  qualifiés par schéma : aucun détournement de résolution.
--                - La fonction ne lit, n'écrit et ne supprime rien : elle
--                  inspecte NEW/OLD et lève une exception. Passer en SECURITY
--                  DEFINER n'ouvre donc aucune écriture privilégiée.
--                - Le comportement fonctionnel est INCHANGÉ : mêmes champs
--                  surveillés, même code d'erreur 22023, même `detail`.
--                - Idempotent (create or replace).
--
-- ⚠️ ORDRE     : correctif PUREMENT base. Il ne dépend d'aucun code applicatif
--                et RESTAURE un comportement attendu par le code déjà en
--                production (`a69ae4c`). Il s'applique donc SEUL et TOUT DE
--                SUITE, sans attendre de merge.
-- =============================================================================

create or replace function public.profiles_reject_contact_details()
returns trigger
language plpgsql
security definer
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

comment on function public.profiles_reject_contact_details() is
  'Trigger BEFORE INSERT OR UPDATE sur profiles : refuse un numéro, un email '
  'ou un identifiant de messagerie dans les champs PUBLICS (bio, '
  'partner_expectations, first_name, pseudo). SECURITY DEFINER depuis la '
  'migration 64 : la fonction d''aide text_has_contact_details reste interne, '
  'seul le propriétaire du trigger peut l''appeler. En SECURITY INVOKER, toute '
  'écriture de membre échouait en « permission denied ».';

-- La fonction d'aide RESTE interne : on réaffirme les révocations, sans
-- jamais rendre EXECUTE à `authenticated`.
revoke all on function public.text_has_contact_details(text) from public;
revoke all on function public.text_has_contact_details(text) from anon;
revoke all on function public.text_has_contact_details(text) from authenticated;

-- Le trigger existe déjà (migration 20260806073500) et pointe sur la même
-- fonction : `create or replace` suffit, on ne le recrée pas.
