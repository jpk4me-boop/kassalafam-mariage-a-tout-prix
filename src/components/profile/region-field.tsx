"use client";

import { useMemo, useState } from "react";

import { findCountryByName, normalizeGeo } from "@/lib/geo/countries-fr";
import { OTHER_REGION_LABEL, REGIONS_FR } from "@/lib/geo/regions-fr";
import { REGION_MAX } from "@/lib/onboarding/options";
import { Input, Label, Select } from "@/components/ui/field";

/**
 * Champ « Région / zone » dépendant du pays de RÉSIDENCE.
 *
 * Composant CONTRÔLÉ : le parent reste propriétaire de la valeur finale, qui
 * est le libellé FRANÇAIS stocké tel quel dans `profiles.region`.
 *
 * Règles, calquées sur `CountryCityFields` :
 *   - pays dont les régions sont référencées (voir `regions-fr.ts`) → liste
 *     déroulante + « Autre région » pour une saisie libre ;
 *   - tout autre pays, ou pays non renseigné → saisie libre, comportement
 *     historique strictement inchangé ;
 *   - valeur héritée inconnue de la liste : CONSERVÉE, le champ bascule
 *     automatiquement en saisie libre — rien n'est jamais effacé au
 *     chargement.
 */
export function RegionField({
  country,
  region,
  onRegionChange,
  disabled,
  id = "region",
}: {
  /** Pays de résidence (libellé français), pilote la liste proposée. */
  country: string;
  region: string;
  onRegionChange: (value: string) => void;
  disabled?: boolean;
  id?: string;
}) {
  const knownCountry = findCountryByName(country);

  const regions = useMemo(
    () => (knownCountry ? REGIONS_FR[knownCountry.code] ?? [] : []),
    [knownCountry],
  );

  const matched = useMemo(() => {
    const value = normalizeGeo(region);
    if (!value) return null;
    return regions.find((r) => normalizeGeo(r) === value) ?? null;
  }, [regions, region]);

  // "list" = sélection dans la liste ; "other" = saisie manuelle.
  const [mode, setMode] = useState<"list" | "other" | null>(null);
  const [prevCountry, setPrevCountry] = useState(country);

  // Résolution du mode PENDANT le rendu (même patron que les champs
  // Pays → Ville) : au premier rendu puis à chaque changement de pays.
  if (mode === null || country !== prevCountry) {
    setPrevCountry(country);
    setMode(region.trim() && matched == null ? "other" : "list");
  }

  const hasList = regions.length > 0;
  const effectiveMode: "list" | "other" =
    !hasList || mode === "other" ? "other" : "list";

  return (
    <div>
      <Label htmlFor={id}>Région / zone</Label>

      {effectiveMode === "list" ? (
        <>
          <Select
            id={id}
            name={id}
            value={matched ?? ""}
            disabled={disabled}
            onChange={(e) => {
              if (e.target.value === OTHER_REGION_LABEL) {
                setMode("other");
                onRegionChange("");
                return;
              }
              onRegionChange(e.target.value);
            }}
          >
            <option value="" disabled>
              Sélectionner…
            </option>
            {regions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
            <option value={OTHER_REGION_LABEL}>{OTHER_REGION_LABEL}</option>
          </Select>
          <p className="mt-1.5 text-xs text-ink-700/55">
            Régions de votre pays de résidence — «&nbsp;{OTHER_REGION_LABEL}
            &nbsp;» pour une saisie libre.
          </p>
        </>
      ) : (
        <>
          <Input
            id={id}
            name={id}
            type="text"
            maxLength={REGION_MAX}
            placeholder="Par exemple : Littoral, Île-de-France…"
            value={region}
            disabled={disabled}
            onChange={(e) => onRegionChange(e.target.value)}
          />
          <div className="mt-1.5 flex items-center justify-between gap-2 text-xs">
            <span className="text-ink-700/55">
              {hasList
                ? "Saisie libre : indiquez votre région."
                : "Saisie libre : aucune liste n’est proposée pour ce pays."}
            </span>
            {hasList ? (
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  setMode("list");
                  onRegionChange("");
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
  );
}
