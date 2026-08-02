-- =============================================================================
-- KASSALAFAM — Profil : nom de famille et numéro WhatsApp
--
-- Deux colonnes ADDITIVES, facultatives, sans backfill et sans modification
-- d'aucune donnée existante.
--
-- CONFIDENTIALITÉ — ces deux champs sont des données personnelles qui ne
-- doivent JAMAIS être exposées publiquement :
--   * aucune fonction de partage public ne les sélectionne
--     (public-profile-share, public-profile-promotion et la vitrine
--     candidats énumèrent explicitement leurs colonnes) ;
--   * la découverte et les relations n'exposent que des projections
--     contrôlées ;
--   * toute future exposition devra être une décision explicite, jamais un
--     effet de bord d'un `select *`.
-- =============================================================================

alter table public.profiles
  add column if not exists last_name text,
  add column if not exists whatsapp_phone text;

comment on column public.profiles.last_name is
  'Nom de famille. Donnée privée : jamais affichée publiquement (vitrine, '
  'liens de partage, promotion, découverte). Usage interne et administratif.';

comment on column public.profiles.whatsapp_phone is
  'Numéro WhatsApp de contact, format international. Donnée privée : jamais '
  'affichée publiquement ni transmise à un autre membre.';

-- -----------------------------------------------------------------------------
-- Contraintes de format — mêmes bornes que l'interface, NULL toujours permis.
-- -----------------------------------------------------------------------------

alter table public.profiles
  drop constraint if exists profiles_last_name_len;

alter table public.profiles
  add constraint profiles_last_name_len check (
    last_name is null
    or char_length(btrim(last_name)) between 2 and 100
  );

-- Format international : chiffres, précédés d'un « + » facultatif. Les
-- espaces, points et tirets sont retirés par l'interface avant envoi.
alter table public.profiles
  drop constraint if exists profiles_whatsapp_phone_format;

alter table public.profiles
  add constraint profiles_whatsapp_phone_format check (
    whatsapp_phone is null
    or whatsapp_phone ~ '^\+?[0-9]{8,15}$'
  );
