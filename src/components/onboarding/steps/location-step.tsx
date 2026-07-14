"use client";

import {
  ORIGIN_COUNTRY_MAX,
  REGION_MAX,
} from "@/lib/onboarding/options";
import { Input, Label } from "@/components/ui/field";
import { CountryCityFields } from "@/components/profile/country-city-fields";
import { StepShell } from "@/components/onboarding/step-shell";

export function LocationStep({
  country,
  city,
  originCountry,
  region,
  onCountryChange,
  onCityChange,
  onOriginCountryChange,
  onRegionChange,
  disabled,
}: {
  country: string;
  city: string;
  originCountry: string;
  region: string;
  onCountryChange: (value: string) => void;
  onCityChange: (value: string) => void;
  onOriginCountryChange: (value: string) => void;
  onRegionChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <StepShell
      title="Où vivez-vous ?"
      description="Votre lieu de résidence et vos origines aident à proposer des rencontres pertinentes."
    >
      {/* Pays → ville de RÉSIDENCE : sélecteurs dépendants (PR A géo).
          Les valeurs restent des libellés français stockés tels quels dans
          profiles.country / profiles.city ; le changement de pays efface la
          ville (géré par le composant). */}
      <CountryCityFields
        country={country}
        city={city}
        onCountryChange={onCountryChange}
        onCityChange={onCityChange}
        disabled={disabled}
        idPrefix="onboarding-geo"
      />

      {/* Origines : champs libres INCHANGÉS — à ne pas confondre avec le pays
          et la ville de résidence ci-dessus. */}
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <Label htmlFor="origin_country">Pays d’origine</Label>
          <Input
            id="origin_country"
            name="origin_country"
            type="text"
            maxLength={ORIGIN_COUNTRY_MAX}
            placeholder="Votre pays d'origine"
            value={originCountry}
            onChange={(e) => onOriginCountryChange(e.target.value)}
            disabled={disabled}
          />
        </div>
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
    </StepShell>
  );
}
