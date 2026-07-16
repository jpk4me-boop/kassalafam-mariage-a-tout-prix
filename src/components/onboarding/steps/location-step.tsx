"use client";

import { REGION_MAX } from "@/lib/onboarding/options";
import { Input, Label } from "@/components/ui/field";
import { CountryCityFields } from "@/components/profile/country-city-fields";
import { StepShell } from "@/components/onboarding/step-shell";

export function LocationStep({
  country,
  city,
  originCountry,
  originCity,
  region,
  onCountryChange,
  onCityChange,
  onOriginCountryChange,
  onOriginCityChange,
  onRegionChange,
  disabled,
}: {
  country: string;
  city: string;
  originCountry: string;
  originCity: string;
  region: string;
  onCountryChange: (value: string) => void;
  onCityChange: (value: string) => void;
  onOriginCountryChange: (value: string) => void;
  onOriginCityChange: (value: string) => void;
  onRegionChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <StepShell
      title="D’où venez-vous, où vivez-vous ?"
      description="Vos origines et votre lieu de résidence aident à proposer des rencontres pertinentes."
    >
      {/* ORIGINE d'abord (PR Origine/Résidence) : mêmes sélecteurs dépendants
          Pays → Ville que la résidence (catalogue unique, « Autre ville »,
          valeurs héritées conservées). Instance INDÉPENDANTE : changer le pays
          d'origine ne touche que la ville d'origine, jamais la résidence. */}
      <fieldset className="flex flex-col gap-5">
        <legend className="mb-1 text-sm font-semibold uppercase tracking-wide text-choco-700/80">
          Votre origine
        </legend>
        <CountryCityFields
          country={originCountry}
          city={originCity}
          onCountryChange={onOriginCountryChange}
          onCityChange={onOriginCityChange}
          disabled={disabled}
          idPrefix="onboarding-origin"
          countryLabel="Pays d’origine"
          cityLabel="Ville d’origine"
        />
      </fieldset>

      {/* RÉSIDENCE ensuite : comportement existant inchangé (PR A géo). Les
          valeurs sont des libellés français stockés tels quels dans
          profiles.country / profiles.city ; le changement de pays efface la
          ville (géré par le composant), sans effet sur l'origine. */}
      <fieldset className="flex flex-col gap-5">
        <legend className="mb-1 text-sm font-semibold uppercase tracking-wide text-choco-700/80">
          Votre résidence actuelle
        </legend>
        <CountryCityFields
          country={country}
          city={city}
          onCountryChange={onCountryChange}
          onCityChange={onCityChange}
          disabled={disabled}
          idPrefix="onboarding-geo"
        />

        {/* Région / zone de résidence : champ libre INCHANGÉ, rattaché à la
            résidence — distinct de l'origine. */}
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <Label htmlFor="region">Région / zone</Label>
            <Input
              id="region"
              name="region"
              type="text"
              maxLength={REGION_MAX}
              placeholder="Par exemple : Dakar, Île-de-France…"
              value={region}
              onChange={(e) => onRegionChange(e.target.value)}
              disabled={disabled}
            />
          </div>
        </div>
      </fieldset>
    </StepShell>
  );
}
