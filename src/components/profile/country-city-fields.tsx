"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, PencilLine } from "lucide-react";

import {
  filterCountries,
  findCountryByName,
  matchCityInList,
  normalizeGeo,
} from "@/lib/geo/countries-fr";
import { Input, Label } from "@/components/ui/field";
import { cn } from "@/lib/utils";

/**
 * PR A géo — Champs dépendants « Pays de résidence » → « Ville de résidence ».
 *
 * Composant CONTRÔLÉ réutilisé par l'étape 6 de l'onboarding et par /profile :
 * le parent reste propriétaire des valeurs finales (`country`, `city`), qui
 * sont les libellés FRANÇAIS stockés tels quels dans `profiles.country` /
 * `profiles.city` (colonnes texte inchangées — compatibilité totale avec les
 * valeurs existantes).
 *
 * Règles :
 *   - pays : combobox recherchable (casse/accents ignorés — « cote » trouve
 *     « Côte d’Ivoire »), navigation clavier (↑ ↓ Entrée Échap), tous les pays
 *     ISO 3166-1 en français ; un pays ne se valide que par sélection dans la
 *     liste (une saisie non reconnue est annulée à la sortie du champ, la
 *     valeur précédente est conservée) ;
 *   - ville : désactivée tant qu'aucun pays n'est choisi ; PRINCIPALES villes
 *     du pays (dataset chargé à la demande — chunk séparé) + « Autre ville »
 *     toujours proposée ; RÉINITIALISÉE à chaque changement de pays ;
 *   - « Autre ville » : champ texte manuel obligatoire — c'est le TEXTE saisi
 *     qui est stocké dans `city`, jamais une valeur technique « other » ;
 *   - valeurs héritées : rapprochées par normalisation à l'affichage ; une
 *     ville inconnue bascule automatiquement en « Autre ville » et sa valeur
 *     est CONSERVÉE ; rien n'est jamais effacé au simple chargement.
 */

/** Libellé UI de l'option de saisie manuelle (jamais stocké en base). */
export const OTHER_CITY_LABEL = "Autre ville";
/** Borne raisonnable de la saisie manuelle (colonne texte sans CHECK dédié). */
export const CITY_MAX_LENGTH = 80;

// ---------------------------------------------------------------------------
// Combobox interne recherchable (ARIA) — utilisée pour le pays ET la ville.
// ---------------------------------------------------------------------------
function SearchableCombobox({
  id,
  value,
  options,
  placeholder,
  disabled,
  onSelect,
  otherOptionLabel,
  onOtherSelected,
  autoComplete,
  listLabel,
}: {
  id: string;
  /** Valeur COMMITTÉE affichée hors saisie (libellé stocké ou hérité). */
  value: string;
  options: readonly string[];
  placeholder: string;
  disabled?: boolean;
  onSelect: (option: string) => void;
  /** Option spéciale ajoutée en fin de liste (« Autre ville »). */
  otherOptionLabel?: string;
  onOtherSelected?: () => void;
  autoComplete?: string;
  /** Nom accessible de la liste déroulante (lecteurs d'écran). */
  listLabel: string;
}) {
  // null = aucune saisie en cours (l'input affiche la valeur committée).
  const [query, setQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const filtered = useMemo(() => {
    const q = normalizeGeo(query ?? "");
    if (!q) return options;
    return options.filter((o) => normalizeGeo(o).includes(q));
  }, [options, query]);

  // L'option spéciale reste TOUJOURS proposée, même quand le filtre est vide.
  const items = useMemo(
    () =>
      otherOptionLabel ? [...filtered, otherOptionLabel] : [...filtered],
    [filtered, otherOptionLabel],
  );

  function close() {
    setOpen(false);
    setQuery(null);
    setActiveIndex(0);
  }

  function commit(index: number) {
    const item = items[index];
    if (item == null) return;
    if (otherOptionLabel && item === otherOptionLabel) {
      onOtherSelected?.();
    } else {
      onSelect(item);
    }
    close();
  }

  function handleBlur() {
    // Saisie reconnue exactement (casse/accents ignorés) → sélection ; sinon
    // la saisie est ANNULÉE et la valeur committée précédente est conservée.
    if (query != null) {
      const exact = options.find(
        (o) => normalizeGeo(o) === normalizeGeo(query),
      );
      if (exact && exact !== value) onSelect(exact);
    }
    close();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setActiveIndex(0);
        return;
      }
      setActiveIndex((prev) => {
        const delta = e.key === "ArrowDown" ? 1 : -1;
        const next = prev + delta;
        if (next < 0) return items.length - 1;
        if (next >= items.length) return 0;
        return next;
      });
    } else if (e.key === "Enter") {
      // Toujours neutralisée : Entrée valide l'option active quand la liste
      // est ouverte et ne doit JAMAIS soumettre un formulaire parent par
      // accident quand elle est fermée.
      e.preventDefault();
      if (open) commit(activeIndex);
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        close();
      }
    } else if (e.key === "Tab") {
      handleBlur();
    }
  }

  const listboxId = `${id}-listbox`;
  const activeId = open && items[activeIndex] != null
    ? `${id}-option-${activeIndex}`
    : undefined;

  return (
    <div className="relative">
      <Input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={activeId}
        aria-autocomplete="list"
        autoComplete={autoComplete ?? "off"}
        placeholder={placeholder}
        value={query ?? value}
        disabled={disabled}
        onFocus={() => {
          setOpen(true);
          setQuery("");
          setActiveIndex(0);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActiveIndex(0);
        }}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className="pr-10"
      />
      <ChevronDown
        size={16}
        aria-hidden
        className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-700/45"
      />

      {open ? (
        <ul
          id={listboxId}
          role="listbox"
          aria-label={listLabel}
          className="absolute z-20 mt-1.5 max-h-64 w-full overflow-auto rounded-xl border border-champagne-500/30 bg-cream-50 py-1 shadow-card"
        >
          {items.length === 0 ? (
            <li role="presentation" className="px-4 py-2.5 text-sm text-ink-700/55">
              Aucun résultat.
            </li>
          ) : (
            items.map((item, index) => {
              const isOther =
                otherOptionLabel != null && item === otherOptionLabel;
              return (
                <li
                  key={`${item}-${index}`}
                  id={`${id}-option-${index}`}
                  role="option"
                  aria-selected={item === value}
                  // preventDefault : garde le focus dans l'input pour que le
                  // clic sélectionne AVANT le blur.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    commit(index);
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 px-4 py-2.5 text-sm text-ink-800",
                    index === activeIndex && "bg-champagne-400/20",
                    isOther && "border-t border-champagne-500/20 font-medium text-choco-700",
                  )}
                >
                  {isOther ? <PencilLine size={14} aria-hidden /> : null}
                  {item}
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Champs dépendants Pays → Ville.
// ---------------------------------------------------------------------------
export function CountryCityFields({
  country,
  city,
  onCountryChange,
  onCityChange,
  disabled,
  idPrefix = "geo",
  countryLabel = "Pays de résidence",
  cityLabel = "Ville de résidence",
}: {
  country: string;
  city: string;
  onCountryChange: (value: string) => void;
  onCityChange: (value: string) => void;
  disabled?: boolean;
  /** Préfixe des ids DOM (évite les collisions si deux formulaires). */
  idPrefix?: string;
  countryLabel?: string;
  cityLabel?: string;
}) {
  // Dataset des villes : chargé UNE fois, à la demande (chunk séparé).
  const [citiesByCode, setCitiesByCode] = useState<Record<
    string,
    readonly string[]
  > | null>(null);

  useEffect(() => {
    let active = true;
    import("@/lib/geo/cities-fr").then((mod) => {
      if (active) setCitiesByCode(mod.CITIES_FR);
    });
    return () => {
      active = false;
    };
  }, []);

  const knownCountry = findCountryByName(country);
  const cities = useMemo(
    () =>
      knownCountry && citiesByCode
        ? citiesByCode[knownCountry.code] ?? []
        : [],
    [knownCountry, citiesByCode],
  );

  // "list" = sélection parmi les principales villes ; "other" = saisie
  // manuelle (« Autre ville »). null = pas encore résolu (dataset en cours).
  const [cityMode, setCityMode] = useState<"list" | "other" | null>(null);
  const [prevCountry, setPrevCountry] = useState(country);

  // Résolution du mode PENDANT le rendu (pattern React « adjusting state when
  // props change ») : au premier chargement (valeurs héritées) puis à chaque
  // changement de pays — jamais pendant une simple saisie manuelle. Une ville
  // inconnue est CONSERVÉE et bascule en « Autre ville », rien n'est effacé.
  if (citiesByCode && (country !== prevCountry || cityMode === null)) {
    setPrevCountry(country);
    const list = knownCountry ? citiesByCode[knownCountry.code] ?? [] : [];
    setCityMode(
      city.trim() && !matchCityInList(city, list) ? "other" : "list",
    );
  }

  function handleCountrySelect(name: string) {
    if (name === country) return;
    onCountryChange(name);
    // Changement de pays → l'ancienne ville n'est plus valide : effacée.
    onCityChange("");
    setCityMode("list");
  }

  const countryChosen = country.trim().length > 0;
  const citiesReady = citiesByCode != null;
  // Pays connu sans aucune ville référencée → saisie manuelle directe (le
  // dataset ne couvre que les PRINCIPALES villes des pays prioritaires).
  const noListForCountry =
    countryChosen && citiesReady && knownCountry != null && cities.length === 0;
  const effectiveMode: "list" | "other" =
    cityMode === "other" || noListForCountry || knownCountry == null
      ? "other"
      : "list";

  // Affichage de la sélection : libellé canonique si la valeur (héritée)
  // correspond à une ville connue — la valeur STOCKÉE n'est pas réécrite.
  const displayedCity = matchCityInList(city, cities) ?? city;

  const countryId = `${idPrefix}-country`;
  const cityId = `${idPrefix}-city`;

  const allCountryNames = useMemo(
    () => filterCountries("").map((c) => c.name),
    [],
  );

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <div>
        <Label htmlFor={countryId}>{countryLabel}</Label>
        <SearchableCombobox
          id={countryId}
          value={country}
          options={allCountryNames}
          placeholder="Rechercher un pays…"
          disabled={disabled}
          onSelect={handleCountrySelect}
          autoComplete="country-name"
          listLabel={countryLabel}
        />
        <p className="mt-1.5 text-xs text-ink-700/55">
          Tous les pays, recherche sans accent (« cote » trouve « Côte
          d’Ivoire »).
        </p>
      </div>

      <div>
        <Label htmlFor={cityId}>{cityLabel}</Label>

        {!countryChosen ? (
          <>
            <Input
              id={cityId}
              type="text"
              placeholder="Choisissez d’abord un pays"
              value=""
              disabled
              readOnly
            />
            <p className="mt-1.5 text-xs text-ink-700/55">
              La ville se choisit après le pays.
            </p>
          </>
        ) : !citiesReady ? (
          <Input id={cityId} type="text" placeholder="Chargement…" value="" disabled readOnly />
        ) : effectiveMode === "list" ? (
          <>
            <SearchableCombobox
              id={cityId}
              value={displayedCity}
              options={cities}
              placeholder="Rechercher une ville…"
              disabled={disabled}
              onSelect={(name) => onCityChange(name)}
              otherOptionLabel={OTHER_CITY_LABEL}
              onOtherSelected={() => {
                setCityMode("other");
                onCityChange("");
              }}
              autoComplete="address-level2"
              listLabel={cityLabel}
            />
            <p className="mt-1.5 text-xs text-ink-700/55">
              Principales villes du pays — « {OTHER_CITY_LABEL} » pour une
              saisie libre.
            </p>
          </>
        ) : (
          <>
            <Input
              id={cityId}
              type="text"
              placeholder="Saisissez votre ville"
              maxLength={CITY_MAX_LENGTH}
              value={city}
              disabled={disabled}
              onChange={(e) => onCityChange(e.target.value)}
              autoComplete="address-level2"
            />
            <div className="mt-1.5 flex items-center justify-between gap-2 text-xs">
              <span className="text-ink-700/55">
                {noListForCountry
                  ? "Saisie libre : indiquez votre ville."
                  : "Autre ville : saisie libre obligatoire."}
              </span>
              {!noListForCountry && cities.length > 0 ? (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    setCityMode("list");
                    onCityChange("");
                  }}
                  className="shrink-0 font-medium text-choco-600 underline decoration-champagne-500/50 underline-offset-2 transition-colors hover:text-choco-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Choisir dans la liste
                </button>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
